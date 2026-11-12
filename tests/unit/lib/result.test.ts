import { describe, expect, it } from 'vitest';
import { RESULT_NOTE, masteryNote } from '../../../src/lib/result';
import { MASTERY_STREAK } from '../../../src/lib/types';

describe('masteryNote', () => {
  it('达到门槛后直接说已掌握，不再让人等第二次', () => {
    expect(masteryNote(MASTERY_STREAK, true)).toBe('本词已掌握。');
  });

  it('与答对提示拼起来是一句完整的话', () => {
    expect(`${RESULT_NOTE.correct}${masteryNote(MASTERY_STREAK, true)}`).toBe(
      '全对。本词已掌握。',
    );
  });

  it('未达标时给出连对进度与还差几次', () => {
    const note = masteryNote(0, false);
    expect(note).toContain(`0/${MASTERY_STREAK}`);
    expect(note).toContain('掌握');
  });
});
