import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { RESULT_LABEL, RESULT_ROW_CLASS } from '../lib/result';
import { formatDuration } from '../lib/download';
import type { AnswerEvent } from '../lib/types';

export default function Summary() {
  const session = useAppStore((s) => s.session);
  const dictMeta = useAppStore((s) => s.dictMeta);
  const wordMap = useAppStore((s) => s.wordMap);
  const replayWrong = useAppStore((s) => s.replayWrong);
  const restart = useAppStore((s) => s.restart);
  const setScreen = useAppStore((s) => s.setScreen);

  const events = session?.events ?? [];

  const counts = useMemo(() => {
    const base = { correct: 0, missed: 0, over: 0, wrong: 0, timeout: 0, unknown: 0, skip: 0 };
    for (const e of events) base[e.result] += 1;
    return base;
  }, [events]);

  const missedRows = useMemo(() => {
    const seen = new Map<string, AnswerEvent>();
    for (const e of events) {
      if (e.result === 'correct') continue;
      seen.set(e.word, e);
    }
    return [...seen.values()];
  }, [events]);

  const duration = useMemo(() => {
    if (!events.length) return 0;
    const first = events[0].at;
    const last = events[events.length - 1].at;
    return Math.max(0, last - first);
  }, [events]);

  const avg = events.length
    ? events.reduce((sum, e) => sum + e.elapsedMs, 0) / events.length
    : 0;
  const accuracy = events.length ? counts.correct / events.length : 0;

  if (!session) {
    return (
      <div className="empty">
        还没有可结算的一轮。
        <div style={{ marginTop: 14 }}>
          <button className="btn" type="button" onClick={() => setScreen('home')}>
            返回练习台
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="summary-head">
        <h2>本轮结算</h2>
        <p>
          {dictMeta?.title ?? session.dictId} · 共 {events.length} 题 · 正确率{' '}
          {Math.round(accuracy * 100)}%
        </p>
      </div>

      <div className="result-grid">
        <div className="result-cell c-correct">
          <b>{counts.correct}</b>
          <span>全对 · 绿</span>
        </div>
        <div className="result-cell c-missed">
          <b>{counts.missed}</b>
          <span>漏选 · 黄</span>
        </div>
        <div className="result-cell c-over">
          <b>{counts.over}</b>
          <span>多选 · 蓝</span>
        </div>
        <div className="result-cell c-wrong">
          <b>{counts.wrong}</b>
          <span>错选 · 红</span>
        </div>
        <div className="result-cell c-wrong" style={{ opacity: 0.86 }}>
          <b>{counts.timeout}</b>
          <span>超时</span>
        </div>
        <div className="result-cell c-neutral">
          <b>{counts.unknown + counts.skip}</b>
          <span>不知道 / 跳过</span>
        </div>
      </div>

      <div className="summary-meta">
        <span>
          用时 <b>{formatDuration(duration)}</b>
        </span>
        <span>
          平均每题 <b>{(avg / 1000).toFixed(1)}s</b>
        </span>
        <span>
          未掌握 <b>{missedRows.length}</b>
        </span>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">需要再看一眼</h2>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {missedRows.length} 个词
          </span>
        </div>
        {missedRows.length === 0 ? (
          <div className="empty">全部答对，这一轮没有遗留。</div>
        ) : (
          <div className="wrong-list">
            {missedRows.map((e) => {
              const raw = wordMap.get(e.word.toLowerCase());
              const sense = raw?.[1]?.[0];
              return (
                <div className="wrong-row" key={e.word}>
                  <span className="w">{e.word}</span>
                  <span className="g">
                    {sense ? `${sense[0] ? `${sense[0]} ` : ''}${sense[1]}` : '—'}
                  </span>
                  <span className={`r ${RESULT_ROW_CLASS[e.result]}`}>{RESULT_LABEL[e.result]}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="summary-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => void replayWrong()}
          disabled={missedRows.length === 0}
        >
          只练这些词
        </button>
        <button className="btn" type="button" onClick={() => void restart()}>
          再来一轮
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => setScreen('home')}>
          返回练习台
        </button>
      </div>
    </div>
  );
}
