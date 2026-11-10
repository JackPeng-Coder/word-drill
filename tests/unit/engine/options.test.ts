import { describe, expect, it } from 'vitest';
import { generateItem } from '../../../src/engine/options';
import { DEFAULT_SETTINGS, type PoolFile, type RawWord, type Settings } from '../../../src/lib/types';

const poolWords: RawWord[] = [
  ['confine', [['v.', '囚禁；限制；使局限']]],
  ['confess', [['v.', '坦白；承认；忏悔']]],
  ['confide', [['v.', '倾诉；委托；信赖']]],
  ['conflict', [['n.', '冲突；矛盾；争执']]],
  ['conclude', [['v.', '推断；结束；缔结']]],
  ['concert', [['n.', '音乐会；演奏会']]],
  ['concrete', [['adj.', '具体的；混凝土的']]],
  ['conquer', [['v.', '征服；战胜；克服']]],
  ['concept', [['n.', '概念；观念']]],
  ['confusion', [['n.', '混乱；困惑']]],
  ['confusedly', [['adv.', '混乱地；受困惑地']]],
  ['apple', [['n.', '苹果']]],
  ['banana', [['n.', '香蕉']]],
  ['candle', [['n.', '蜡烛']]],
  ['desert', [['n.', '沙漠']]],
  ['engine', [['n.', '发动机；引擎']]],
];

function pool(): PoolFile {
  return { version: 1, words: poolWords };
}

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, noneRate: 0, ...patch };
}

const target = { word: 'confuse', phonetic: 'kənˈfjuːz', senses: [['v.', '使困惑；混淆']] as Array<[string, string]> };

describe('generateItem', () => {
  it('恒为 6 个选项：4 个释义 + 以上都不对 + 不知道', () => {
    const item = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 42 });
    expect(item.options).toHaveLength(6);
    expect(item.options.filter((o) => o.kind === 'sense')).toHaveLength(4);
    expect(item.options.some((o) => o.id === 'none' && o.text === '以上都不对')).toBe(true);
    expect(item.options.some((o) => o.id === 'unknown' && o.text === '不知道')).toBe(true);
  });

  it('correctIds 与 correct 标记一致，且正确项至少 1 个', () => {
    const item = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 7 });
    const flags = item.options.filter((o) => o.correct).map((o) => o.id);
    expect(new Set(item.correctIds)).toEqual(new Set(flags));
    expect(item.correctIds.length).toBeGreaterThanOrEqual(1);
  });

  it('同一 seed 完全可复现', () => {
    const a = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 123 });
    const b = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 123 });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('排除自身与同词干变形', () => {
    const item = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 5 });
    const texts = item.options.map((o) => o.text).join('|');
    expect(texts).not.toContain('使困惑；混淆');
    expect(texts).not.toContain('混乱；困惑');
    expect(texts).not.toContain('混乱地');
  });

  it('语义相关（释义重叠）的候选被剔除', () => {
    const item = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 5 });
    const glosses = item.options.filter((o) => !o.correct).map((o) => o.text);
    expect(glosses.some((g) => g.includes('混乱'))).toBe(false);
    expect(glosses.some((g) => g.includes('困惑'))).toBe(false);
  });

  it('干扰项来自形态相近的单词', () => {
    const item = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 5 });
    const distractors = item.options.filter((o) => !o.correct && o.kind === 'sense').map((o) => o.text);
    expect(distractors.length).toBe(3);
    expect(distractors.some((d) => d.includes('囚禁') || d.includes('坦白') || d.includes('倾诉'))).toBe(true);
  });

  it('多义项时启用不定项，正确项为多个', () => {
    const item = generateItem({
      word: 'abandon',
      senses: [
        ['v.', '放弃；抛弃'],
        ['n.', '放任；纵情'],
      ],
      pool: pool(),
      settings: settings({ multiSense: true }),
      prevKind: null,
      seed: 11,
    });
    expect(item.multi).toBe(true);
    expect(item.correctIds.length).toBe(2);
    expect(item.options.filter((o) => o.kind === 'sense' && o.correct)).toHaveLength(2);
  });

  it('multiSense 关闭时即使多义项也只有一个正确项', () => {
    const item = generateItem({
      word: 'abandon',
      senses: [
        ['v.', '放弃；抛弃'],
        ['n.', '放任；纵情'],
      ],
      pool: pool(),
      settings: settings({ multiSense: false }),
      prevKind: null,
      seed: 11,
    });
    expect(item.multi).toBe(false);
    expect(item.correctIds).toHaveLength(1);
  });

  it('noneRate=1 时生成否定题，唯一正确答案是「以上都不对」', () => {
    const item = generateItem({
      ...target,
      pool: pool(),
      settings: settings({ noneRate: 1 }),
      prevKind: null,
      seed: 3,
    });
    expect(item.kind).toBe('negative');
    expect(item.correctIds).toEqual(['none']);
    expect(item.options.filter((o) => o.kind === 'sense' && o.correct)).toHaveLength(0);
  });

  it('否定题不会连续出现（prevKind=negative 时强制肯定题）', () => {
    const item = generateItem({
      ...target,
      pool: pool(),
      settings: settings({ noneRate: 1 }),
      prevKind: 'negative',
      seed: 3,
    });
    expect(item.kind).toBe('positive');
  });

  it('释义选项标注来源单词：干扰项是别的词，正确项是本词', () => {
    const item = generateItem({ ...target, pool: pool(), settings: settings(), prevKind: null, seed: 21 });
    const senses = item.options.filter((o) => o.kind === 'sense');
    for (const option of senses) {
      expect(option.source).toBeTruthy();
      if (option.correct) expect(option.source?.toLowerCase()).toBe('confuse');
      else expect(option.source?.toLowerCase()).not.toBe('confuse');
    }
  });

  it('answer 给出目标词的正确释义，供「以上都不对」题当场揭晓', () => {
    const item = generateItem({
      word: 'confuse',
      senses: [
        ['v.', '使困惑；混淆'],
        ['n.', '混乱'],
      ],
      pool: pool(),
      settings: settings({ noneRate: 1 }),
      prevKind: null,
      seed: 8,
    });
    expect(item.kind).toBe('negative');
    expect(item.answer.length).toBe(2);
    expect(item.answer[0][0]).toBe('v.');
    expect(item.answer[0][1]).toContain('使困惑');
    expect(item.answer[1][1]).toContain('混乱');
  });

  it('词池很小也能凑满 4 个释义项', () => {
    const small: PoolFile = {
      version: 1,
      words: [
        ['confine', [['v.', '囚禁；限制']]],
        ['apple', [['n.', '苹果']]],
        ['banana', [['n.', '香蕉']]],
        ['cherry', [['n.', '樱桃']]],
      ],
    };
    const item = generateItem({ ...target, pool: small, settings: settings(), prevKind: null, seed: 9 });
    expect(item.options.filter((o) => o.kind === 'sense')).toHaveLength(4);
    expect(item.fallback).toBe(true);
  });
});
