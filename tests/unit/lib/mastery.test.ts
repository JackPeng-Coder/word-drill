import { describe, expect, it } from 'vitest';
import { MASTERY_STREAK, emptyStat, normalizeStats } from '../../../src/lib/types';
import type { Stats, WordStat } from '../../../src/lib/types';

function stat(patch: Partial<WordStat>): WordStat {
  return { ...emptyStat(), seen: 1, correct: 1, streak: 1, lastAt: 1, ...patch };
}

describe('normalizeStats', () => {
  it('按当前门槛对齐掌握状态：连对够了就不再算未掌握', () => {
    const stats: Stats = {
      'dict:ok': stat({ streak: MASTERY_STREAK, mastered: false }),
      'dict:low': stat({ streak: Math.max(0, MASTERY_STREAK - 1), mastered: true }),
    };
    const out = normalizeStats(stats);
    expect(out['dict:ok'].mastered).toBe(true);
    expect(out['dict:low'].mastered).toBe(false);
  });

  it('不改动其他统计字段', () => {
    const stats: Stats = {
      'dict:the': stat({ streak: 0, mastered: false, wrong: 3, lastResult: 'wrong' }),
    };
    expect(normalizeStats(stats)['dict:the']).toMatchObject({ seen: 1, correct: 1, wrong: 3 });
  });

  it('空记录仍是空', () => {
    expect(normalizeStats({})).toEqual({});
  });
});
