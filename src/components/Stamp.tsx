import type { ResultKind } from '../lib/types';
import { RESULT_LABEL, RESULT_STAMP_CLASS } from '../lib/result';

export default function Stamp({ result }: { result: ResultKind }) {
  return (
    <div className={`stamp ${RESULT_STAMP_CLASS[result]}`} aria-live="polite">
      {RESULT_LABEL[result]}
    </div>
  );
}
