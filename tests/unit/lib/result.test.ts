import { describe, expect, it } from 'vitest';
import { RESULT_NOTE, masteryNote } from '../../../src/lib/result';
import { MASTERY_STREAK } from '../../../src/lib/types';

describe('masteryNote', () => {
  it('答对第一次时说明还差一次，避免误以为答对即掌握', () => {
    expect(masteryNote(1, false)).toBe(`连对 1/${MASTERY_STREAK}，再答对一次即掌握。`);
  });

  it('已达标时明确说已掌握', () => {
    expect(masteryNote(MASTERY_STREAK, true)).toBe(
      `本词已掌握（已连对 ${MASTERY_STREAK} 次）。`,
    );
  });

  it('差最后一次时给出「再答对一次」', () => {
    const streak = MASTERY_STREAK - 1;
    expect(streak).toBeGreaterThanOrEqual(1);
    expect(masteryNote(streak, false)).toBe(
      `连对 ${streak}/${MASTERY_STREAK}，再答对一次即掌握。`,
    );
  });

  it('距离达标还早时按剩余次数措辞', () => {
    expect(masteryNote(0, false)).toBe(`连对 0/${MASTERY_STREAK}，再连对 ${MASTERY_STREAK} 次即掌握。`);
  });

  it('答对提示本身不再暗示「已掌握」', () => {
    expect(RESULT_NOTE.correct).toBe('全对。');
  });
});
