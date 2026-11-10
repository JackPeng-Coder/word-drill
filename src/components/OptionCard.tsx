import type { Option } from '../lib/types';
import { optionMark, type OptionState } from '../lib/result';

interface Props {
  option: Option;
  letter?: string;
  state: OptionState;
  locked: boolean;
  onSelect: (id: string) => void;
}

export default function OptionCard({ option, letter, state, locked, onSelect }: Props) {
  const meta = option.kind !== 'sense';
  const mark = optionMark(state);
  return (
    <button
      type="button"
      className={`option ${meta ? 'option-meta' : ''} ${state} ${locked ? 'is-locked' : ''}`}
      onClick={() => {
        if (!locked) onSelect(option.id);
      }}
      aria-pressed={state === 'is-picked'}
      aria-disabled={locked}
    >
      {letter ? <span className="option-letter">{letter}</span> : null}
      <span className="option-body">
        {option.pos ? <span className="option-pos">{option.pos}</span> : null}
        <span className="option-text" style={{ display: 'block' }}>
          {option.text}
        </span>
      </span>
      {mark ? <span className="option-mark">{mark}</span> : null}
    </button>
  );
}
