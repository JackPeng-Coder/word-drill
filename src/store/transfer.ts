import {
  EXPORT_APP,
  EXPORT_VERSION,
  wordKey,
  type ExportBundle,
  type RawWord,
  type Settings,
  type Stats,
} from '../lib/types';

export function buildBundle(settings: Settings, stats: Stats): ExportBundle {
  return {
    app: EXPORT_APP,
    schemaVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    stats,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBundle(
  raw: string,
): { ok: true; bundle: ExportBundle } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: false, error: '文件为空' };
  if (raw.length > 20 * 1024 * 1024) return { ok: false, error: '文件过大（超过 20MB）' };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }
  if (!isPlainObject(data)) return { ok: false, error: '存档结构不正确' };
  if (data.app !== EXPORT_APP) return { ok: false, error: '这不是 WordDrill 的存档文件' };
  if (data.schemaVersion !== EXPORT_VERSION) {
    return {
      ok: false,
      error: `存档版本不兼容（文件 ${String(data.schemaVersion)}，当前 ${EXPORT_VERSION}）`,
    };
  }
  if (!isPlainObject(data.settings)) return { ok: false, error: '存档缺少设置数据' };
  if (!isPlainObject(data.stats)) return { ok: false, error: '存档缺少学习记录' };

  const stats: Stats = {};
  for (const [key, value] of Object.entries(data.stats)) {
    if (!isPlainObject(value)) continue;
    if (typeof value.seen !== 'number') continue;
    stats[key] = {
      seen: Number(value.seen) || 0,
      correct: Number(value.correct) || 0,
      wrong: Number(value.wrong) || 0,
      missed: Number(value.missed) || 0,
      over: Number(value.over) || 0,
      unknown: Number(value.unknown) || 0,
      timeouts: Number(value.timeouts) || 0,
      skips: Number(value.skips) || 0,
      streak: Number(value.streak) || 0,
      lastAt: Number(value.lastAt) || 0,
      lastResult: (value.lastResult ?? null) as Stats[string]['lastResult'],
      mastered: Boolean(value.mastered),
    };
  }

  return {
    ok: true,
    bundle: {
      app: EXPORT_APP,
      schemaVersion: EXPORT_VERSION,
      exportedAt: String(data.exportedAt ?? new Date().toISOString()),
      settings: data.settings as unknown as Settings,
      stats,
    },
  };
}

/** 逐词合并：同一个词取 lastAt 较新的一条记录，保留双方独有词 */
export function mergeStats(base: Stats, incoming: Stats): Stats {
  const merged: Stats = { ...base };
  for (const [key, stat] of Object.entries(incoming)) {
    const current = merged[key];
    if (!current || stat.lastAt >= current.lastAt) merged[key] = stat;
  }
  return merged;
}

interface TxtArgs {
  dictId?: string;
  words: RawWord[];
  stats: Stats;
  format: 'word' | 'gloss' | 'posGloss';
  sort: 'errors' | 'alpha';
  includeUnseen: boolean;
}

export function exportUnmasteredTxt({
  dictId,
  words,
  stats,
  format,
  sort,
  includeUnseen,
}: TxtArgs): string {
  const rows: Array<{ word: string; errors: number; seens: number; line: string }> = [];

  for (const entry of words) {
    const word = entry[0];
    if (!word) continue;
    const key = dictId ? wordKey(dictId, word) : Object.keys(stats).find((k) => k.endsWith(`:${word.toLowerCase()}`));
    const stat = key ? stats[key] : undefined;
    const seen = stat?.seen ?? 0;
    const isUnmastered = seen > 0 && !stat?.mastered;
    if (!isUnmastered && !(includeUnseen && seen === 0)) continue;

    const errors = stat
      ? stat.wrong + stat.missed + stat.over + stat.unknown + stat.timeouts + stat.skips
      : 0;
    const sense = entry[1]?.[0];
    const gloss = sense?.[1] ?? '';
    const pos = sense?.[0] ?? '';

    let line = word;
    if (format === 'gloss') line = `${word}\t${gloss}`;
    if (format === 'posGloss') line = `${word}\t${pos ? `${pos} ` : ''}${gloss}`;

    rows.push({ word, errors, seens: seen, line });
  }

  if (sort === 'alpha') {
    rows.sort((a, b) => a.word.localeCompare(b.word, 'en'));
  } else {
    rows.sort((a, b) => b.errors - a.errors || b.seens - a.seens || a.word.localeCompare(b.word, 'en'));
  }

  return rows.length ? `${rows.map((r) => r.line).join('\n')}\n` : '';
}
