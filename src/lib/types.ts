/**
 * 共享类型契约 —— 唯一来源。
 * 由 Lead 维护；队友只读引用，不要修改本文件（需要变更请找 Lead）。
 */

/* ------------------------------------------------------------------ *
 * 词库数据（由 scripts/build-data.mjs 生成，放在 public/data/）
 * ------------------------------------------------------------------ */

/** [词性, 中文释义]；词性可能为空字符串 */
export type SenseTuple = [pos: string, gloss: string];

/** 单词 [原形, 义项列表, 音标?] */
export type RawWord = [word: string, senses: SenseTuple[], phonetic?: string];

export interface DictMeta {
  id: string;
  title: string;
  category: string;
  featured: boolean;
  /** 词条数 */
  count: number;
  /** 义项总数 */
  senses: number;
  /** 词性覆盖率 0..1 */
  posRate: number;
  /** 若为重复词表，指向被保留的词表 id */
  aliasOf: string | null;
  /** 相对 public/data 的路径；重复词表（aliasOf 非空）为 null */
  file: string | null;
}

export interface Manifest {
  version: number;
  builtAt: string;
  dicts: DictMeta[];
}

export interface DictFile {
  id: string;
  words: RawWord[];
}

export interface PoolFile {
  version: number;
  /** 干扰词池：只含单个英文单词 */
  words: RawWord[];
}

/* ------------------------------------------------------------------ *
 * 出题
 * ------------------------------------------------------------------ */

export type OptionKind = 'sense' | 'none' | 'unknown';

export interface Option {
  /** 稳定 id：'s0'..'s3' | 'none' | 'unknown' */
  id: string;
  kind: OptionKind;
  pos: string;
  text: string;
  correct: boolean;
  /** 该释义所属的单词：干扰项为来源词，正确项为目标词 */
  source?: string;
}

export type ItemKind = 'positive' | 'negative';

export interface GeneratedItem {
  word: string;
  phonetic: string;
  kind: ItemKind;
  /** 4 个释义选项 + 'none' + 'unknown'，顺序已洗牌（元选项固定在末尾两名） */
  options: Option[];
  correctIds: string[];
  /** 该题是否正确项为多选（不定项） */
  multi: boolean;
  /** 干扰项是否动用了降级/随机回退 */
  fallback: boolean;
  /** 目标词的正确释义；否定题（4 个选项全错）时用于当场揭晓 */
  answer: SenseTuple[];
}

/* ------------------------------------------------------------------ *
 * 判分
 * ------------------------------------------------------------------ */

export type ResultKind =
  | 'correct'
  | 'wrong'
  | 'missed'
  | 'over'
  | 'unknown'
  | 'timeout'
  | 'skip';

export interface Grade {
  result: ResultKind;
  correctIds: string[];
}

/* ------------------------------------------------------------------ *
 * 设置
 * ------------------------------------------------------------------ */

/** 考察顺序：按词表顺序 / 随机 */
export type OrderMode = 'sequential' | 'random';

/** 练习范围 */
export type Scope = 'all' | 'unmastered' | 'new' | 'wrongFirst';

export interface Settings {
  /** 单选题每题限时秒数，0 表示不限时 */
  timeLimitSingleSec: number;
  /** 多选（不定项）每题限时秒数，0 表示不限时 */
  timeLimitMultiSec: number;
  /** 多义项是否启用不定项多选 */
  multiSense: boolean;
  /** 「以上都不对」作为正确答案的概率 0..1 */
  noneRate: number;
  /** 显示音标 */
  showPhonetic: boolean;
  /** 考察顺序（用户可切换） */
  order: OrderMode;
  /** 允许回退 */
  allowBack: boolean;
  /** 允许跳过 */
  allowSkip: boolean;
  /** 答对后自动进入下一题 */
  autoNextOnCorrect: boolean;
  /** 单选时单击即提交 */
  instantSubmit: boolean;
  /** 音效 */
  sound: boolean;
  /** 每轮题数；'all' 表示该范围全部 */
  roundSize: number | 'all';
  /** 练习范围 */
  scope: Scope;
}

export const DEFAULT_SETTINGS: Settings = {
  timeLimitSingleSec: 10,
  timeLimitMultiSec: 15,
  multiSense: true,
  noneRate: 0.12,
  showPhonetic: true,
  order: 'sequential',
  allowBack: true,
  allowSkip: true,
  autoNextOnCorrect: true,
  instantSubmit: true,
  sound: false,
  roundSize: 20,
  scope: 'all',
};

export const SETTINGS_LIMITS = {
  timeLimit: { min: 0, max: 300, step: 1 },
  noneRate: { min: 0, max: 0.4, step: 0.02 },
} as const;

/* ------------------------------------------------------------------ *
 * 统计 / 会话
 * ------------------------------------------------------------------ */

export interface WordStat {
  seen: number;
  correct: number;
  wrong: number;
  missed: number;
  over: number;
  unknown: number;
  timeouts: number;
  skips: number;
  /** 连续全对次数 */
  streak: number;
  lastAt: number;
  lastResult: ResultKind | null;
  mastered: boolean;
}

export type Stats = Record<string, WordStat>;

export interface AnswerEvent {
  seq: number;
  word: string;
  picked: string[];
  correctIds: string[];
  result: ResultKind;
  itemKind: ItemKind;
  multi: boolean;
  /** 该题作答耗时（毫秒） */
  elapsedMs: number;
  at: number;
  /** 撤销该次作答时用于恢复连击与掌握状态 */
  prev?: { streak: number; mastered: boolean };
}

export interface Session {
  id: string;
  dictId: string;
  /** 本轮单词顺序（已按设置排好） */
  queue: string[];
  index: number;
  /** 当前题已选选项 id */
  picks: string[];
  /** 当前题（含回退后的题），用于刷新/回退复现 */
  item: GeneratedItem | null;
  events: AnswerEvent[];
  startedAt: number;
  /** 本轮开始时的设置快照（中途改设置不污染本轮） */
  settings: Settings;
  /** 已判分并展示反馈 */
  revealed: boolean;
  /** 本轮已结束（完成或提前结束） */
  finished?: boolean;
}

/* ------------------------------------------------------------------ *
 * 导出 / 导入
 * ------------------------------------------------------------------ */

export const EXPORT_APP = 'worddrill';
export const EXPORT_VERSION = 1;

export interface ExportBundle {
  app: typeof EXPORT_APP;
  schemaVersion: typeof EXPORT_VERSION;
  exportedAt: string;
  settings: Settings;
  stats: Stats;
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

export function wordKey(dictId: string, word: string): string {
  return `${dictId}:${word.trim().toLowerCase()}`;
}

export const MASTERY_STREAK = 2;

/** 当前题（单选 / 多选）适用的限时秒数 */
export function limitForQuestion(settings: Settings, multi: boolean): number {
  return multi ? settings.timeLimitMultiSec : settings.timeLimitSingleSec;
}

function clampSec(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const { min, max } = SETTINGS_LIMITS.timeLimit;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * 把任意来源（存档 / 旧版本快照）的设置整理成当前结构：
 * 旧版只有一个 timeLimitSec，迁移时单选与多选都用它。
 */
export function normalizeSettings(raw: unknown): Settings {
  const input =
    typeof raw === 'object' && raw !== null
      ? (raw as Partial<Settings> & { timeLimitSec?: unknown })
      : {};
  const settings: Settings = { ...DEFAULT_SETTINGS, ...input };
  const legacy = typeof input.timeLimitSec === 'number' ? input.timeLimitSec : null;
  if (legacy !== null) {
    if (typeof input.timeLimitSingleSec !== 'number') settings.timeLimitSingleSec = legacy;
    if (typeof input.timeLimitMultiSec !== 'number') settings.timeLimitMultiSec = legacy;
  }
  settings.timeLimitSingleSec = clampSec(settings.timeLimitSingleSec, DEFAULT_SETTINGS.timeLimitSingleSec);
  settings.timeLimitMultiSec = clampSec(settings.timeLimitMultiSec, DEFAULT_SETTINGS.timeLimitMultiSec);
  return settings;
}

export function emptyStat(): WordStat {
  return {
    seen: 0,
    correct: 0,
    wrong: 0,
    missed: 0,
    over: 0,
    unknown: 0,
    timeouts: 0,
    skips: 0,
    streak: 0,
    lastAt: 0,
    lastResult: null,
    mastered: false,
  };
}
