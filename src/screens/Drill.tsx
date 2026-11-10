import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import OptionCard from '../components/OptionCard';
import Stamp from '../components/Stamp';
import TimerRing from '../components/TimerRing';
import {
  OPTION_LETTERS,
  RESULT_NOTE,
  RESULT_ROW_CLASS,
  metaOption,
  optionState,
  senseOptions,
} from '../lib/result';
import { playStamp } from '../lib/sound';

export default function Drill() {
  const session = useAppStore((s) => s.session);
  const dictMeta = useAppStore((s) => s.dictMeta);
  const lastGrade = useAppStore((s) => s.lastGrade);
  const questionStartAt = useAppStore((s) => s.questionStartAt);
  const setScreen = useAppStore((s) => s.setScreen);
  const toggleOption = useAppStore((s) => s.toggleOption);
  const submit = useAppStore((s) => s.submit);
  const next = useAppStore((s) => s.next);
  const back = useAppStore((s) => s.back);
  const skip = useAppStore((s) => s.skip);
  const timeout = useAppStore((s) => s.timeout);
  const soundOn = useAppStore((s) => s.settings.sound);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useAppStore.getState();
      const s = st.session;
      if (!s || !s.item) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const names = ['1', '2', '3', '4'];
      const index = names.indexOf(e.key);
      if (index >= 0) {
        const option = senseOptions(s.item)[index];
        if (option) {
          e.preventDefault();
          st.toggleOption(option.id);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === '5' || key === 'n') {
        e.preventDefault();
        st.toggleOption('none');
        return;
      }
      if (key === '0' || key === 'd') {
        e.preventDefault();
        st.toggleOption('unknown');
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (s.revealed) st.next();
        else st.submit();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        st.back();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        st.skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const revealed = session?.revealed ?? false;
  const result = lastGrade?.result ?? null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [session?.index]);

  useEffect(() => {
    if (!revealed || !result) return;
    if (useAppStore.getState().settings.autoNextOnCorrect && result === 'correct') {
      const timer = window.setTimeout(() => useAppStore.getState().next(), 700);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [revealed, result]);

  useEffect(() => {
    if (!revealed) return;
    const st = useAppStore.getState();
    if (st.session?.item?.kind !== 'negative') return;
    const el = document.querySelector<HTMLElement>('.drill-feedback');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 底部固定操作栏会遮住内容；只在「本题正确释义」被挡住时做最小滚动
    const visibleBottom = window.innerHeight - 96;
    if (rect.bottom > visibleBottom) {
      window.scrollBy({
        top: Math.min(rect.bottom - visibleBottom + 12, 220),
        behavior: 'smooth',
      });
    }
  }, [revealed]);

  useEffect(() => {
    if (!revealed || !result || !soundOn) return;
    playStamp(result === 'correct' ? 'ok' : result === 'unknown' || result === 'skip' ? 'neutral' : 'bad');
  }, [revealed, result, soundOn]);

  const item = session?.item ?? null;
  const total = session?.queue.length ?? 0;
  const index = session?.index ?? 0;
  const picks = session?.picks ?? [];

  const railTicks = useMemo(() => {
    if (!total) return [] as number[];
    if (total <= 56) return Array.from({ length: total }, (_, i) => i);
    const step = Math.ceil(total / 56);
    return Array.from({ length: Math.ceil(total / step) }, (_, i) => Math.min(total - 1, i * step));
  }, [total]);

  if (!session || !item) {
    return (
      <div className="drill-wrap">
        <div className="empty">
          还没有开始练习。
          <div style={{ marginTop: 14 }}>
            <button className="btn" type="button" onClick={() => setScreen('home')}>
              返回练习台
            </button>
          </div>
        </div>
      </div>
    );
  }

  const senses = senseOptions(item);
  const noneOption = metaOption(item, 'none');
  const unknownOption = metaOption(item, 'unknown');
  const progress = total ? ((index + (revealed ? 1 : 0)) / total) * 100 : 0;
  const limit = session.settings.timeLimitSec;
  const isNegative = item.kind === 'negative';

  return (
    <div className="drill-wrap">
      <aside className="rail" aria-hidden="true">
        {railTicks.map((tick) => (
          <i
            key={tick}
            className={tick < index ? 'is-done' : tick === index ? 'is-current' : ''}
          />
        ))}
      </aside>

      <div className="drill-top">
        <button className="btn btn-ghost btn-small" type="button" onClick={() => setScreen('home')}>
          ← 退出
        </button>
        <span className="dict-name">{dictMeta?.title ?? session.dictId}</span>
        <span className="drill-counter">
          {index + 1} / {total}
        </span>
        {limit > 0 && !revealed ? (
          <TimerRing
            key={`${session.id}:${index}:${questionStartAt}`}
            limitSec={limit}
            startedAt={questionStartAt}
            onExpire={timeout}
          />
        ) : (
          <span className="timer-slot" aria-hidden="true" />
        )}
        <span className="saved-dot">
          <i />
          自动保存
        </span>
      </div>
      <div className="progress-line">
        <i style={{ width: `${progress}%` }} />
      </div>

      <div className="word-stage">
        <div className="word-label">
          第 {index + 1} 词 · {item.multi ? '不定项 · 选出全部正确义项' : '单选'}
          {isNegative ? ' · 注意甄别' : ''}
        </div>
        <h1 className={`word ${item.word.includes(' ') ? 'is-phrase' : ''}`}>{item.word}</h1>
        {session.settings.showPhonetic && item.phonetic ? (
          <div className="word-phonetic">/{item.phonetic}/</div>
        ) : null}
        {revealed && result ? <Stamp result={result} /> : null}
      </div>

      <div className="options">
        {senses.map((option, i) => (
          <OptionCard
            key={option.id}
            option={option}
            letter={OPTION_LETTERS[i]}
            state={optionState(option, picks, revealed)}
            locked={revealed}
            revealed={revealed}
            onSelect={toggleOption}
          />
        ))}
      </div>

      <div className="meta-options">
        {noneOption ? (
          <OptionCard
            option={noneOption}
            letter="5"
            state={optionState(noneOption, picks, revealed)}
            locked={revealed}
            revealed={revealed}
            onSelect={toggleOption}
          />
        ) : null}
        {unknownOption ? (
          <OptionCard
            option={unknownOption}
            letter="0"
            state={optionState(unknownOption, picks, revealed)}
            locked={revealed}
            revealed={revealed}
            onSelect={toggleOption}
          />
        ) : null}
      </div>

      <div className="drill-feedback" aria-live="polite">
        {revealed && result ? (
          <>
            <span className={`badge ${RESULT_ROW_CLASS[result]}`} style={{ borderColor: 'currentColor' }}>
              {result === 'correct'
                ? '答对'
                : result === 'unknown'
                  ? '标记未掌握'
                  : result === 'skip'
                    ? '已跳过'
                    : '需要再看一眼'}
            </span>
            <span className="feedback-note">{RESULT_NOTE[result]}</span>
            {item.kind === 'negative' && item.answer.length ? (
              <span className="feedback-note feedback-answer">
                本题正确释义：
                <b>{item.answer.map(([pos, text]) => (pos ? `${pos} ${text}` : text)).join('；')}</b>
              </span>
            ) : null}
          </>
        ) : (
          <span className="feedback-note">
            {item.multi
              ? '本题有多个正确义项，全部选对才算过关。'
              : isNegative
                ? '四个释义中可能没有一个属于该词。'
                : '选出与该词对应的中文释义。'}
          </span>
        )}
      </div>

      <div className="drill-actions">
        {revealed ? (
          <button className="btn btn-primary" type="button" onClick={next}>
            下一题 <span className="kbd">Enter</span>
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            onClick={submit}
            disabled={!picks.length}
          >
            提交 <span className="kbd">Enter</span>
          </button>
        )}
        <button
          className="btn"
          type="button"
          onClick={back}
          disabled={!session.settings.allowBack}
          title="撤销上一题的作答并重做"
        >
          回退 <span className="kbd">←</span>
        </button>
        <button
          className="btn"
          type="button"
          onClick={skip}
          disabled={!session.settings.allowSkip}
          title="记录为未掌握并跳到下一题"
        >
          跳过 <span className="kbd">→</span>
        </button>
        <span className="spacer" />
        <span className="key-hint">
          <span className="kbd">1</span>–<span className="kbd">4</span> 选项
          <span className="kbd">5</span> 都不对
          <span className="kbd">0</span> 不知道
        </span>
      </div>
    </div>
  );
}
