import { create } from 'zustand';
import { mergeStats } from './transfer';
import {
  DEFAULT_SETTINGS,
  MASTERY_STREAK,
  emptyStat,
  wordKey,
  type AnswerEvent,
  type DictFile,
  type DictMeta,
  type ExportBundle,
  type Grade,
  type ItemKind,
  type Manifest,
  type PoolFile,
  type RawWord,
  type ResultKind,
  type Session,
  type Settings,
  type Stats,
  type WordStat,
} from '../lib/types';
import { buildQueue } from '../engine/queue';
import { generateItem } from '../engine/options';
import { gradeItem } from '../engine/grade';
import { createRng, hashSeed } from '../engine/rng';
import { clearAll, loadSnapshot, saveSession, saveSettings, saveSettingsNow, saveStats } from './persist';
import { cleanPhonetic, loadDict, loadManifest, loadPool } from '../data/loader';

export type Screen = 'home' | 'drill' | 'summary' | 'settings' | 'data';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'ok' | 'warn' | 'error';
}

interface AppState {
  booted: boolean;
  bootError: string | null;
  manifest: Manifest | null;
  pool: PoolFile | null;
  poolLoading: boolean;
  poolError: string | null;

  dict: DictFile | null;
  dictMeta: DictMeta | null;
  dictLoading: boolean;
  dictError: string | null;
  wordMap: Map<string, RawWord>;

  settings: Settings;
  stats: Stats;
  session: Session | null;

  screen: Screen;
  selectedDictId: string | null;
  savedAt: number | null;
  toast: Toast | null;
  lastGrade: Grade | null;
  questionStartAt: number;

  boot: () => Promise<void>;
  selectDict: (id: string) => Promise<void>;
  setScreen: (screen: Screen) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  startSession: (opts?: { words?: string[] }) => Promise<void>;
  resumeSession: () => Promise<void>;
  toggleOption: (id: string) => void;
  submit: () => void;
  timeout: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  finishSession: () => void;
  replayWrong: () => Promise<void>;
  restart: () => Promise<void>;

  showToast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: () => void;
  importBundle: (bundle: ExportBundle, mode: 'merge' | 'replace') => Promise<void>;
  clearEverything: () => Promise<void>;
  clearDictProgress: (dictId: string) => Promise<void>;
  resetSettings: () => void;
  touchSave: () => void;
}

/* ------------------------------------------------------------------ *
 * 持久化（防抖 300ms）
 * ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(get: () => AppState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const s = get();
    void Promise.all([
      saveSettings(s.settings),
      saveStats(s.stats),
      saveSession(s.session),
    ])
      .then(() => useAppStore.setState({ savedAt: Date.now() }))
      .catch(() => {
        /* 存储失败不阻塞练习 */
      });
  }, 300);
}

/* ------------------------------------------------------------------ *
 * 统计变换
 * ------------------------------------------------------------------ */

function applyResult(prev: WordStat | undefined, result: ResultKind, at: number): WordStat {
  const base = prev ? { ...prev } : emptyStat();
  base.seen += 1;
  base.lastAt = at;
  base.lastResult = result;
  switch (result) {
    case 'correct':
      base.correct += 1;
      base.streak += 1;
      base.mastered = base.streak >= MASTERY_STREAK;
      break;
    case 'unknown':
      base.unknown += 1;
      base.streak = 0;
      base.mastered = false;
      break;
    case 'timeout':
      base.timeouts += 1;
      base.streak = 0;
      base.mastered = false;
      break;
    case 'skip':
      base.skips += 1;
      base.streak = 0;
      base.mastered = false;
      break;
    case 'missed':
      base.missed += 1;
      base.streak = 0;
      base.mastered = false;
      break;
    case 'over':
      base.over += 1;
      base.streak = 0;
      base.mastered = false;
      break;
    case 'wrong':
    default:
      base.wrong += 1;
      base.streak = 0;
      base.mastered = false;
      break;
  }
  return base;
}

function revertResult(prev: WordStat, event: AnswerEvent): WordStat {
  const next = { ...prev };
  next.seen = Math.max(0, next.seen - 1);
  switch (event.result) {
    case 'correct':
      next.correct = Math.max(0, next.correct - 1);
      break;
    case 'unknown':
      next.unknown = Math.max(0, next.unknown - 1);
      break;
    case 'timeout':
      next.timeouts = Math.max(0, next.timeouts - 1);
      break;
    case 'skip':
      next.skips = Math.max(0, next.skips - 1);
      break;
    case 'missed':
      next.missed = Math.max(0, next.missed - 1);
      break;
    case 'over':
      next.over = Math.max(0, next.over - 1);
      break;
    default:
      next.wrong = Math.max(0, next.wrong - 1);
      break;
  }
  next.streak = event.prev?.streak ?? 0;
  next.mastered = event.prev?.mastered ?? false;
  if (next.seen === 0) {
    return emptyStat();
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * 出题
 * ------------------------------------------------------------------ */

function buildItemFor(state: AppState, session: Session, index: number) {
  const word = session.queue[index];
  if (!word) return null;
  const raw = state.wordMap.get(word.toLowerCase());
  const senses = raw?.[1] ?? [];
  if (!senses.length || !state.pool) return null;
  const prevKind: ItemKind | null = index > 0 ? session.events[index - 1]?.itemKind ?? null : null;
  return generateItem({
    word: raw?.[0] ?? word,
    phonetic: cleanPhonetic(raw?.[2]),
    senses,
    pool: state.pool,
    settings: session.settings,
    prevKind,
    seed: hashSeed(`${session.id}:${index}`),
  });
}

function lastDictStorageKey(): string {
  return 'worddrill:lastDict';
}

function readLastDict(): string | null {
  try {
    return window.localStorage.getItem(lastDictStorageKey());
  } catch {
    return null;
  }
}

function writeLastDict(id: string): void {
  try {
    window.localStorage.setItem(lastDictStorageKey(), id);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * store
 * ------------------------------------------------------------------ */

export const useAppStore = create<AppState>()((set, get) => ({
  booted: false,
  bootError: null,
  manifest: null,
  pool: null,
  poolLoading: false,
  poolError: null,

  dict: null,
  dictMeta: null,
  dictLoading: false,
  dictError: null,
  wordMap: new Map(),

  settings: DEFAULT_SETTINGS,
  stats: {},
  session: null,

  screen: 'home',
  selectedDictId: null,
  savedAt: null,
  toast: null,
  lastGrade: null,
  questionStartAt: Date.now(),

  async boot() {
    if (get().booted) return;
    try {
      const [snapshot, manifest] = await Promise.all([loadSnapshot(), loadManifest()]);
      const settings: Settings = { ...DEFAULT_SETTINGS, ...(snapshot.settings ?? {}) };
      const stats: Stats = snapshot.stats ?? {};
      const session: Session | null = snapshot.session ?? null;
      set({
        manifest,
        settings,
        stats,
        session,
        selectedDictId: session?.dictId ?? readLastDict(),
        booted: true,
      });

      // 干扰词池后台加载
      set({ poolLoading: true });
      try {
        const pool = await loadPool(manifest.version ?? 1);
        set({ pool, poolLoading: false });
      } catch (err) {
        set({
          poolLoading: false,
          poolError: err instanceof Error ? err.message : '干扰词池加载失败',
        });
      }
      scheduleSave(get);
    } catch (err) {
      set({
        booted: true,
        bootError: err instanceof Error ? err.message : '初始化失败',
      });
    }
  },

  async selectDict(id) {
    const { manifest } = get();
    if (!manifest) return;
    const meta = manifest.dicts.find((d) => d.id === id);
    if (!meta) return;
    set({ selectedDictId: id, dictError: null });
    writeLastDict(id);
    if (meta.aliasOf) {
      set({ dictError: '这是重复词表，已并入同名主词表' });
      return;
    }
    set({ dictLoading: true, dictMeta: meta });
    try {
      const dict = await loadDict(meta, manifest);
      const map = new Map<string, RawWord>();
      for (const entry of dict.words) map.set(entry[0].toLowerCase(), entry);
      set({ dict, dictMeta: meta, wordMap: map, dictLoading: false });
    } catch (err) {
      set({
        dictLoading: false,
        dictError: err instanceof Error ? err.message : '词表加载失败',
      });
    }
  },

  setScreen(screen) {
    set({ screen });
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    // 设置体积小：同步写镜像，避免刚改完立即刷新丢失
    saveSettingsNow(settings);
    scheduleSave(get);
  },

  async startSession(opts) {
    const state = get();
    const { settings, dict, dictMeta, pool, wordMap } = state;
    if (!dictMeta || !dict) {
      get().showToast('请先选择词表', 'warn');
      return;
    }
    if (!pool) {
      get().showToast('干扰词池仍在加载，请稍候', 'warn');
      return;
    }
    const usable = dict.words.filter((w) => (w[1]?.length ?? 0) > 0);
    let queue: string[];
    if (opts?.words?.length) {
      queue = opts.words.filter((w) => (wordMap.get(w.toLowerCase())?.[1]?.length ?? 0) > 0);
    } else {
      const rng = createRng(hashSeed(`${dictMeta.id}:${Date.now()}:${Math.random()}`));
      queue = buildQueue({
        dictId: dictMeta.id,
        words: usable,
        stats: state.stats,
        options: {
          scope: settings.scope,
          roundSize: settings.roundSize,
          order: settings.order,
        },
        rng,
      });
    }
    if (!queue.length) {
      get().showToast('该范围内没有可练习的单词', 'warn');
      return;
    }
    const session: Session = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      dictId: dictMeta.id,
      queue,
      index: 0,
      picks: [],
      item: null,
      events: [],
      startedAt: Date.now(),
      settings: { ...settings },
      revealed: false,
      finished: false,
    };
    const item = buildItemFor(state, session, 0);
    if (!item) {
      get().showToast('出题失败，请检查词库或干扰词池', 'error');
      return;
    }
    session.item = item;
    set({
      session,
      screen: 'drill',
      lastGrade: null,
      questionStartAt: Date.now(),
    });
    scheduleSave(get);
  },

  async resumeSession() {
    const state = get();
    const session = state.session;
    if (!session) return;
    if (!state.dict || state.dictMeta?.id !== session.dictId) {
      await get().selectDict(session.dictId);
    }
    const nextState = get();
    if (!nextState.pool || !nextState.dict) {
      get().showToast('词表尚未就绪，请稍候再试', 'warn');
      return;
    }
    let item = session.item;
    if (!item || item.word !== session.queue[session.index]) {
      item = buildItemFor(nextState, session, session.index);
    }
    if (!item) {
      get().showToast('无法恢复上次的题目', 'error');
      return;
    }
    set({
      session: { ...session, item },
      screen: session.finished ? 'summary' : 'drill',
      questionStartAt: Date.now(),
      lastGrade: null,
    });
  },

  toggleOption(id) {
    const state = get();
    const session = state.session;
    if (!session || !session.item || session.revealed) return;
    const option = session.item.options.find((o) => o.id === id);
    if (!option) return;

    if (option.kind !== 'sense') {
      // 元选项互斥
      const picks = session.picks.includes(id) ? [] : [id];
      set({ session: { ...session, picks } });
      if (picks.length && session.settings.instantSubmit && !session.item.multi) {
        get().submit();
      }
      return;
    }
    const multi = session.item.multi;
    if (!multi) {
      const picks = [id];
      set({ session: { ...session, picks } });
      if (session.settings.instantSubmit) {
        get().submit();
      }
      return;
    }
    const picks = session.picks.includes(id)
      ? session.picks.filter((p) => p !== id)
      : [...session.picks.filter((p) => p !== 'none' && p !== 'unknown'), id];
    set({ session: { ...session, picks } });
  },

  submit() {
    const state = get();
    const session = state.session;
    if (!session || !session.item || session.revealed) return;
    if (!session.picks.length) {
      get().showToast('请至少选择一项', 'warn');
      return;
    }
    const grade = gradeItem(session.item, session.picks);
    const at = Date.now();
    const key = wordKey(session.dictId, session.item.word);
    const prevStat = state.stats[key];
    const event: AnswerEvent = {
      seq: session.events.length + 1,
      word: session.item.word,
      picked: session.picks,
      correctIds: grade.correctIds,
      result: grade.result,
      itemKind: session.item.kind,
      multi: session.item.multi,
      elapsedMs: Math.max(0, at - state.questionStartAt),
      at,
      prev: { streak: prevStat?.streak ?? 0, mastered: prevStat?.mastered ?? false },
    };
    const stats = { ...state.stats, [key]: applyResult(prevStat, grade.result, at) };
    set({
      stats,
      lastGrade: grade,
      session: {
        ...session,
        picks: session.picks,
        revealed: true,
        events: [...session.events, event],
      },
    });
    scheduleSave(get);
  },

  timeout() {
    const state = get();
    const session = state.session;
    if (!session || !session.item || session.revealed || session.settings.timeLimitSec <= 0) return;
    const at = Date.now();
    const key = wordKey(session.dictId, session.item.word);
    const prevStat = state.stats[key];
    const event: AnswerEvent = {
      seq: session.events.length + 1,
      word: session.item.word,
      picked: session.picks,
      correctIds: session.item.correctIds,
      result: 'timeout',
      itemKind: session.item.kind,
      multi: session.item.multi,
      elapsedMs: Math.max(0, at - state.questionStartAt),
      at,
      prev: { streak: prevStat?.streak ?? 0, mastered: prevStat?.mastered ?? false },
    };
    set({
      stats: { ...state.stats, [key]: applyResult(prevStat, 'timeout', at) },
      lastGrade: { result: 'timeout', correctIds: session.item.correctIds },
      session: { ...session, revealed: true, events: [...session.events, event] },
    });
    scheduleSave(get);
  },

  next() {
    const state = get();
    const session = state.session;
    if (!session) return;
    if (!session.revealed) return;
    if (session.index + 1 >= session.queue.length) {
      get().finishSession();
      return;
    }
    const index = session.index + 1;
    const base: Session = { ...session, index, picks: [], revealed: false, item: null };
    const item = buildItemFor(state, base, index);
    if (!item) {
      get().showToast('下一题生成失败，已结束本轮', 'error');
      get().finishSession();
      return;
    }
    set({
      session: { ...base, item },
      lastGrade: null,
      questionStartAt: Date.now(),
    });
    scheduleSave(get);
  },

  back() {
    const state = get();
    const session = state.session;
    if (!session) return;
    if (!session.settings.allowBack) {
      get().showToast('当前设置不允许回退', 'warn');
      return;
    }
    if (!session.events.length) {
      get().showToast('已经是第一题', 'warn');
      return;
    }

    let targetIndex = session.index;
    if (!session.revealed) {
      if (session.index === 0) {
        get().showToast('已经是第一题', 'warn');
        return;
      }
      targetIndex = session.index - 1;
    }

    const event = session.events[session.events.length - 1];
    if (!event) return;
    const events = session.events.slice(0, -1);
    const key = wordKey(session.dictId, event.word);
    const prevStat = state.stats[key];
    let stats = state.stats;
    if (prevStat) {
      const reverted = revertResult(prevStat, event);
      if (reverted.seen === 0 && reverted.correct === 0) {
        const { [key]: _removed, ...rest } = state.stats;
        stats = rest;
      } else {
        stats = { ...state.stats, [key]: reverted };
      }
    }

    const base: Session = {
      ...session,
      index: targetIndex,
      events,
      picks: [],
      revealed: false,
      item: null,
    };
    const item = buildItemFor({ ...state, stats }, base, targetIndex);
    if (!item) {
      get().showToast('无法回退：题目生成失败', 'error');
      return;
    }
    set({
      stats,
      session: { ...base, item },
      lastGrade: null,
      questionStartAt: Date.now(),
    });
    scheduleSave(get);
  },

  skip() {
    const state = get();
    const session = state.session;
    if (!session || !session.item) return;
    if (!session.settings.allowSkip) {
      get().showToast('当前设置不允许跳过', 'warn');
      return;
    }
    if (session.revealed) {
      get().next();
      return;
    }
    const at = Date.now();
    const key = wordKey(session.dictId, session.item.word);
    const prevStat = state.stats[key];
    const event: AnswerEvent = {
      seq: session.events.length + 1,
      word: session.item.word,
      picked: [],
      correctIds: session.item.correctIds,
      result: 'skip',
      itemKind: session.item.kind,
      multi: session.item.multi,
      elapsedMs: Math.max(0, at - state.questionStartAt),
      at,
      prev: { streak: prevStat?.streak ?? 0, mastered: prevStat?.mastered ?? false },
    };
    set({
      stats: { ...state.stats, [key]: applyResult(prevStat, 'skip', at) },
      session: { ...session, picks: [], events: [...session.events, event], revealed: true },
      lastGrade: { result: 'skip', correctIds: session.item.correctIds },
    });
    get().next();
  },

  finishSession() {
    const state = get();
    const session = state.session;
    if (!session) return;
    set({ session: { ...session, finished: true }, screen: 'summary', lastGrade: null });
    scheduleSave(get);
  },

  async replayWrong() {
    const state = get();
    const session = state.session;
    if (!session) return;
    const wrong = session.events
      .filter((e) => e.result !== 'correct')
      .map((e) => e.word);
    const unique = [...new Set(wrong)];
    if (!unique.length) {
      get().showToast('本轮没有错词', 'ok');
      return;
    }
    await get().startSession({ words: unique });
  },

  async restart() {
    await get().startSession();
  },

  showToast(text, tone = 'info') {
    if (toastTimer) clearTimeout(toastTimer);
    const id = Date.now();
    set({ toast: { id, text, tone } });
    toastTimer = setTimeout(() => {
      toastTimer = null;
      if (get().toast?.id === id) set({ toast: null });
    }, 2600);
  },

  dismissToast() {
    set({ toast: null });
  },

  async importBundle(bundle, mode) {
    const state = get();
    const stats = mode === 'merge' ? mergeStats(state.stats, bundle.stats) : bundle.stats;
    const settings: Settings = { ...DEFAULT_SETTINGS, ...bundle.settings };
    set({ stats, settings });
    scheduleSave(get);
  },

  async clearEverything() {
    await clearAll();
    set({
      stats: {},
      session: null,
      settings: DEFAULT_SETTINGS,
      lastGrade: null,
      savedAt: Date.now(),
    });
  },

  async clearDictProgress(dictId) {
    const stats: Stats = {};
    const prefix = `${dictId}:`;
    for (const [key, value] of Object.entries(get().stats)) {
      if (!key.startsWith(prefix)) stats[key] = value;
    }
    const session = get().session?.dictId === dictId ? null : get().session;
    set({ stats, session });
    scheduleSave(get);
  },

  resetSettings() {
    set({ settings: DEFAULT_SETTINGS });
    scheduleSave(get);
  },

  touchSave() {
    scheduleSave(get);
  },
}));

/* ------------------------------------------------------------------ *
 * 派生数据
 * ------------------------------------------------------------------ */

export function dictProgress(stats: Stats, dictId: string) {
  const prefix = `${dictId}:`;
  let seen = 0;
  let mastered = 0;
  let errors = 0;
  for (const [key, stat] of Object.entries(stats)) {
    if (!key.startsWith(prefix)) continue;
    if (stat.seen > 0) seen += 1;
    if (stat.mastered) mastered += 1;
    errors += stat.wrong + stat.missed + stat.over + stat.unknown + stat.timeouts;
  }
  return { seen, mastered, errors };
}

export function todayStats(stats: Stats) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  let attempts = 0;
  let correct = 0;
  let unmastered = 0;
  for (const stat of Object.values(stats)) {
    if (stat.lastAt >= from) {
      attempts += stat.seen;
      correct += stat.correct;
    }
    if (stat.seen > 0 && !stat.mastered) unmastered += 1;
  }
  const rate = attempts ? correct / attempts : 0;
  return { attempts, correct, rate, unmastered };
}
