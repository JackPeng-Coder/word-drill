import type { GeneratedItem, Grade } from '../lib/types';

/**
 * 判分：
 * - 选「不知道」→ unknown（如实标记，不算答错）
 * - 未选择 → wrong
 * - 释义集合：全等 correct；真子集 missed（漏选）；超集 over（多选）；其余 wrong（错选）
 * - 否定题（correctIds === ['none']）同规则自然成立
 */
export function gradeItem(item: GeneratedItem, picked: string[]): Grade {
  const correctIds = item.correctIds;
  if (picked.includes('unknown')) {
    return { result: 'unknown', correctIds };
  }
  if (!picked.length) {
    return { result: 'wrong', correctIds };
  }

  const senseIds = new Set(item.options.filter((o) => o.kind === 'sense').map((o) => o.id));
  const pickedSense = new Set(picked.filter((id) => senseIds.has(id)));
  const correctSet = new Set(correctIds.filter((id) => senseIds.has(id)));
  const nonePicked = picked.includes('none');
  const noneCorrect = correctIds.includes('none');

  // 否定题：正确集合只有 none
  if (noneCorrect) {
    return { result: nonePicked ? 'correct' : 'wrong', correctIds };
  }
  // 肯定题却选了「以上都不对」
  if (nonePicked) {
    return { result: 'wrong', correctIds };
  }

  let inCorrect = 0;
  let outCorrect = 0;
  for (const id of pickedSense) {
    if (correctSet.has(id)) inCorrect += 1;
    else outCorrect += 1;
  }
  if (inCorrect === correctSet.size && outCorrect === 0) {
    return { result: 'correct', correctIds };
  }
  if (outCorrect === 0) {
    return { result: 'missed', correctIds };
  }
  if (inCorrect === correctSet.size && outCorrect > 0) {
    return { result: 'over', correctIds };
  }
  return { result: 'wrong', correctIds };
}
