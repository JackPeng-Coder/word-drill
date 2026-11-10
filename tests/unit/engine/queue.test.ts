import { describe, expect, it } from 'vitest';
import { buildQueue } from '../../../src/engine/queue';
import { createRng } from '../../../src/engine/rng';
import { emptyStat, wordKey, type RawWord, type Stats } from '../../../src/lib/types';

const words: RawWord[] = [
  ['alpha', [['n.', '阿尔法']]],
  ['bravo', [['n.', '喝彩']]],
  ['charlie', [['n.', '查理']]],
  ['delta', [['n.', '三角洲']]],
  ['echo', [['n.', '回声']]],
  ['foxtrot', [['n.', '狐步舞']]],
];

const dictId = 'test';
const key = (w: string) => wordKey(dictId, w);

function stats(patch: Record<string, Partial<ReturnType<typeof emptyStat>>>): Stats {
  const out: Stats = {};
  for (const [word, p] of Object.entries(patch)) out[key(word)] = { ...emptyStat(), ...p };
  return out;
}

describe('buildQueue', () => {
  it('scope=all 返回全部（顺序不变）', () => {
    const queue = buildQueue({
      dictId,
      words,
      stats: {},
      options: { scope: 'all', roundSize: 'all', order: 'sequential' },
      rng: createRng(1),
    });
    expect(queue).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']);
  });

  it('scope=new 只返回没练过的词', () => {
    const queue = buildQueue({
      dictId,
      words,
      stats: stats({ alpha: { seen: 1 } }),
      options: { scope: 'new', roundSize: 'all', order: 'sequential' },
      rng: createRng(1),
    });
    expect(queue).not.toContain('alpha');
    expect(queue).toHaveLength(5);
  });

  it('scope=unmastered 只返回练过但未掌握的', () => {
    const queue = buildQueue({
      dictId,
      words,
      stats: stats({
        alpha: { seen: 2, mastered: true, correct: 2, streak: 2 },
        bravo: { seen: 1, mastered: false, wrong: 1 },
      }),
      options: { scope: 'unmastered', roundSize: 'all', order: 'sequential' },
      rng: createRng(1),
    });
    expect(queue).toEqual(['bravo']);
  });

  it('scope=wrongFirst 按错误分降序、同分保持原序', () => {
    const queue = buildQueue({
      dictId,
      words,
      stats: stats({
        echo: { seen: 1, wrong: 1 },
        delta: { seen: 1, missed: 3 },
        charlie: { seen: 1, wrong: 1 },
      }),
      options: { scope: 'wrongFirst', roundSize: 'all', order: 'sequential' },
      rng: createRng(1),
    });
    expect(queue.slice(0, 3)).toEqual(['delta', 'charlie', 'echo']);
  });

  it('order=random 打乱顺序但集合不变', () => {
    const a = buildQueue({
      dictId,
      words,
      stats: {},
      options: { scope: 'all', roundSize: 'all', order: 'random' },
      rng: createRng(7),
    });
    const b = buildQueue({
      dictId,
      words,
      stats: {},
      options: { scope: 'all', roundSize: 'all', order: 'random' },
      rng: createRng(7),
    });
    expect(a).toEqual(b);
    expect(new Set(a)).toEqual(new Set(words.map((w) => w[0])));
    expect(a).not.toEqual(words.map((w) => w[0]));
  });

  it('roundSize 截断；random 在过滤后洗牌', () => {
    const queue = buildQueue({
      dictId,
      words,
      stats: {},
      options: { scope: 'all', roundSize: 3, order: 'random' },
      rng: createRng(3),
    });
    expect(queue).toHaveLength(3);
    expect(new Set(queue).size).toBe(3);
  });

  it('没有义项的词被跳过', () => {
    const withEmpty: RawWord[] = [...words, ['broken', []]];
    const queue = buildQueue({
      dictId,
      words: withEmpty,
      stats: {},
      options: { scope: 'all', roundSize: 'all', order: 'sequential' },
      rng: createRng(1),
    });
    expect(queue).not.toContain('broken');
  });
});
