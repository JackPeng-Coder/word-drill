import { MASTERY_STREAK, type GeneratedItem, type Option, type ResultKind } from './types';

export const RESULT_LABEL: Record<ResultKind, string> = {
  correct: '全对',
  wrong: '错选',
  missed: '漏选',
  over: '多选',
  unknown: '不知道',
  timeout: '超时',
  skip: '跳过',
};

export const RESULT_STAMP_CLASS: Record<ResultKind, string> = {
  correct: 'stamp--correct',
  wrong: 'stamp--wrong',
  missed: 'stamp--missed',
  over: 'stamp--over',
  unknown: 'stamp--unknown',
  timeout: 'stamp--timeout',
  skip: 'stamp--skip',
};

export const RESULT_ROW_CLASS: Record<ResultKind, string> = {
  correct: 'r-correct',
  wrong: 'r-wrong',
  missed: 'r-missed',
  over: 'r-over',
  unknown: 'r-unknown',
  timeout: 'r-timeout',
  skip: 'r-skip',
};

export const RESULT_NOTE: Record<ResultKind, string> = {
  correct: '全对。',
  wrong: '错选：至少一项不属于该词。',
  missed: '漏选：还有正确义项没有选中。',
  over: '多选：选中了可判为错误的释义。',
  unknown: '已标记为「不知道」，计入未掌握。',
  timeout: '超时，本词按未掌握处理。',
  skip: '已跳过，计入未掌握。',
};

/**
 * 答对之后的掌握进度说明：掌握要求连续答对 MASTERY_STREAK 次，
 * 把它讲清楚，避免「我选对了为什么还是未掌握」。
 */
export function masteryNote(streak: number, mastered: boolean): string {
  if (mastered) return '本词已掌握。';
  const left = Math.max(1, MASTERY_STREAK - streak);
  return left <= 1
    ? `连对 ${streak}/${MASTERY_STREAK}，再答对一次即掌握。`
    : `连对 ${streak}/${MASTERY_STREAK}，再连对 ${left} 次即掌握。`;
}

export type OptionState =
  | 'is-picked'
  | 'is-correct'
  | 'is-wrong'
  | 'is-missed'
  | 'is-dim'
  | '';

export function optionState(option: Option, picked: string[], revealed: boolean): OptionState {
  const isPicked = picked.includes(option.id);
  if (!revealed) return isPicked ? 'is-picked' : '';

  if (option.kind === 'unknown') {
    return isPicked ? 'is-picked' : 'is-dim';
  }
  if (option.correct) {
    return isPicked ? 'is-correct' : 'is-missed';
  }
  return isPicked ? 'is-wrong' : 'is-dim';
}

export function optionMark(state: OptionState): string {
  if (state === 'is-correct') return '✓';
  if (state === 'is-wrong') return '✗';
  if (state === 'is-missed') return '!';
  return '';
}

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

/** 正确释义摘要，用于答错后的提示 */
export function correctAnswerText(item: GeneratedItem): string {
  if (item.kind === 'negative') return '以上都不对';
  return item.options
    .filter((o) => o.correct)
    .map((o) => (o.pos ? `${o.pos} ${o.text}` : o.text))
    .join('；');
}

export function senseOptions(item: GeneratedItem): Option[] {
  return item.options.filter((o) => o.kind === 'sense');
}

export function metaOption(item: GeneratedItem, kind: 'none' | 'unknown'): Option | undefined {
  return item.options.find((o) => o.kind === kind);
}
