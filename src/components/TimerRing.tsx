import { useEffect, useRef, useState } from 'react';

interface Props {
  limitSec: number;
  startedAt: number;
  onExpire: () => void;
}

/** 每题倒计时环；切到后台时暂停计时 */
export default function TimerRing({ limitSec, startedAt, onExpire }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const hiddenAccum = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    fired.current = false;
    hiddenAccum.current = 0;
    hiddenAt.current = null;
    setNow(Date.now());
  }, [startedAt, limitSec]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 120);
    const onVis = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null) {
        hiddenAccum.current += Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        setNow(Date.now());
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const frozen = hiddenAt.current !== null ? now - hiddenAt.current : 0;
  const elapsed = now - startedAt - hiddenAccum.current - frozen;
  const remaining = Math.max(0, limitSec * 1000 - elapsed);

  useEffect(() => {
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      expireRef.current();
    }
  }, [remaining]);

  const ratio = limitSec > 0 ? remaining / (limitSec * 1000) : 0;
  const seconds = Math.ceil(remaining / 1000);
  const urgent = remaining <= 3000;
  const warn = !urgent && remaining <= 7000;
  const color = urgent ? 'var(--red)' : warn ? 'var(--gold)' : 'var(--ink-2)';

  const size = 46;
  const r = 19;
  const c = 2 * Math.PI * r;

  return (
    <div
      className="timer"
      title={`本题限时 ${limitSec} 秒`}
      style={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.2s ease' }}
        />
      </svg>
      <span
        className="mono"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 12,
          color,
        }}
      >
        {seconds}
      </span>
    </div>
  );
}
