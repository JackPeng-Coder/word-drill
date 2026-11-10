import { describe, expect, it } from 'vitest';
import { gradeItem } from '../../../src/engine/grade';
import type { GeneratedItem, Option } from '../../../src/lib/types';

function option(id: string, correct: boolean, kind: Option['kind'] = 'sense'): Option {
  return { id, kind, pos: '', text: id, correct };
}

function makeItem(kind: GeneratedItem['kind']): GeneratedItem {
  if (kind === 'negative') {
    return {
      word: 'x',
      phonetic: '',
      kind: 'negative',
      multi: false,
      fallback: false,
      answer: [],
      correctIds: ['none'],
      options: [
        option('s0', false),
        option('s1', false),
        option('s2', false),
        option('s3', false),
        option('none', true, 'none'),
        option('unknown', false, 'unknown'),
      ],
    };
  }
  return {
    word: 'x',
    phonetic: '',
    kind: 'positive',
    multi: true,
    fallback: false,
    answer: [],
    correctIds: ['s0', 's2'],
    options: [
      option('s0', true),
      option('s1', false),
      option('s2', true),
      option('s3', false),
      option('none', false, 'none'),
      option('unknown', false, 'unknown'),
    ],
  };
}

describe('gradeItem', () => {
  const single: GeneratedItem = {
    ...makeItem('positive'),
    correctIds: ['s0'],
    multi: false,
  };

  it('全对 → correct', () => {
    expect(gradeItem(single, ['s0']).result).toBe('correct');
    expect(gradeItem(makeItem('positive'), ['s0', 's2']).result).toBe('correct');
  });

  it('只选了部分正确项 → missed', () => {
    expect(gradeItem(makeItem('positive'), ['s0']).result).toBe('missed');
  });

  it('正确项选全且多选了错误项 → over', () => {
    expect(gradeItem(makeItem('positive'), ['s0', 's2', 's1']).result).toBe('over');
  });

  it('选了错误项但没选全正确项 → wrong', () => {
    expect(gradeItem(makeItem('positive'), ['s0', 's1']).result).toBe('wrong');
    expect(gradeItem(single, ['s1']).result).toBe('wrong');
    expect(gradeItem(single, ['s1', 's2']).result).toBe('wrong');
  });

  it('「不知道」→ unknown（不计对错）', () => {
    expect(gradeItem(makeItem('positive'), ['unknown']).result).toBe('unknown');
    expect(gradeItem(makeItem('negative'), ['unknown']).result).toBe('unknown');
  });

  it('空选择 → wrong', () => {
    expect(gradeItem(makeItem('positive'), []).result).toBe('wrong');
  });

  it('否定题：选「以上都不对」才正确', () => {
    expect(gradeItem(makeItem('negative'), ['none']).result).toBe('correct');
    expect(gradeItem(makeItem('negative'), ['s0']).result).toBe('wrong');
  });

  it('肯定题选「以上都不对」→ wrong', () => {
    expect(gradeItem(single, ['none']).result).toBe('wrong');
  });

  it('返回的 correctIds 与题目一致', () => {
    expect(gradeItem(makeItem('positive'), ['s0']).correctIds).toEqual(['s0', 's2']);
  });
});
