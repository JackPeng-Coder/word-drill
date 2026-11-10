import { describe, expect, it } from 'vitest';
import {
  buildBundle,
  exportUnmasteredTxt,
  mergeStats,
  parseBundle,
} from '../../../src/store/transfer';
import {
  DEFAULT_SETTINGS,
  emptyStat,
  wordKey,
  type RawWord,
  type Stats,
} from '../../../src/lib/types';

const dictId = 'test';
const words: RawWord[] = [
  ['cancel', [['v.', '取消；撤销']]],
  ['abandon', [['vt.', '放弃；抛弃']]],
  ['bravo', [['n.', '喝彩']]],
];

describe('transfer', () => {
  it('buildBundle → parseBundle 往返一致', () => {
    const stats: Stats = {
      [wordKey(dictId, 'cancel')]: { ...emptyStat(), seen: 2, wrong: 1, lastAt: 100 },
    };
    const bundle = buildBundle({ ...DEFAULT_SETTINGS, order: 'random' }, stats);
    const raw = JSON.stringify(bundle);
    const parsed = parseBundle(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.settings.order).toBe('random');
    expect(parsed.bundle.stats[wordKey(dictId, 'cancel')].wrong).toBe(1);
  });

  it('拒绝损坏/异类 JSON', () => {
    expect(parseBundle('not json').ok).toBe(false);
    expect(parseBundle('').ok).toBe(false);
    expect(parseBundle(JSON.stringify({ app: 'other' })).ok).toBe(false);
    expect(
      parseBundle(JSON.stringify({ app: 'worddrill', schemaVersion: 2, settings: {}, stats: {} }))
        .ok,
    ).toBe(false);
  });

  it('mergeStats 逐词取较新的一条并保留双方独有词', () => {
    const older: Stats = {
      [wordKey(dictId, 'cancel')]: { ...emptyStat(), seen: 1, wrong: 0, lastAt: 10 },
      [wordKey(dictId, 'abandon')]: { ...emptyStat(), seen: 1, lastAt: 10 },
    };
    const newer: Stats = {
      [wordKey(dictId, 'cancel')]: { ...emptyStat(), seen: 5, wrong: 3, lastAt: 99 },
      [wordKey(dictId, 'bravo')]: { ...emptyStat(), seen: 2, lastAt: 50 },
    };
    const merged = mergeStats(older, newer);
    expect(merged[wordKey(dictId, 'cancel')].wrong).toBe(3);
    expect(merged[wordKey(dictId, 'abandon')].seen).toBe(1);
    expect(merged[wordKey(dictId, 'bravo')].seen).toBe(2);
  });

  it('导出未掌握 TXT：只含练过且未掌握的词，格式与排序正确', () => {
    const stats: Stats = {
      [wordKey(dictId, 'cancel')]: {
        ...emptyStat(),
        seen: 3,
        wrong: 2,
        mastered: false,
        lastAt: 1,
      },
      [wordKey(dictId, 'abandon')]: {
        ...emptyStat(),
        seen: 2,
        missed: 1,
        lastAt: 2,
      },
      [wordKey(dictId, 'bravo')]: {
        ...emptyStat(),
        seen: 3,
        correct: 3,
        streak: 3,
        mastered: true,
        lastAt: 3,
      },
    };

    const wordsOnly = exportUnmasteredTxt({
      dictId,
      words,
      stats,
      format: 'word',
      sort: 'errors',
      includeUnseen: false,
    });
    expect(wordsOnly.trim().split('\n')).toEqual(['cancel', 'abandon']);

    const posGloss = exportUnmasteredTxt({
      dictId,
      words,
      stats,
      format: 'posGloss',
      sort: 'alpha',
      includeUnseen: false,
    });
    const lines = posGloss.trim().split('\n');
    expect(lines[0]).toBe('abandon\tvt. 放弃；抛弃');
    expect(lines[1]).toBe('cancel\tv. 取消；撤销');
  });

  it('includeUnseen 时包含从未练习的词', () => {
    const text = exportUnmasteredTxt({
      dictId,
      words,
      stats: {},
      format: 'word',
      sort: 'alpha',
      includeUnseen: true,
    });
    expect(text.trim().split('\n')).toEqual(['abandon', 'bravo', 'cancel']);
  });
});
