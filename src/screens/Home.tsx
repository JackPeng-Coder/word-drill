import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { DictMeta, OrderMode, Scope } from '../lib/types';

const SCOPE_LABELS: Record<Scope, string> = {
  all: '全部',
  unmastered: '未掌握',
  new: '新词',
  wrongFirst: '错词优先',
};

const SCOPE_HINTS: Record<Scope, string> = {
  all: '按词表范围出题',
  unmastered: '只练练过但尚未掌握的',
  new: '只练从未作答过的',
  wrongFirst: '错得越多越靠前',
};

const ROUND_OPTIONS: Array<{ value: number | 'all'; label: string }> = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 'all', label: '全部' },
];

interface Progress {
  seen: number;
  mastered: number;
  errors: number;
}

function DictRow({
  dict,
  selected,
  progress,
  onSelect,
}: {
  dict: DictMeta;
  selected: boolean;
  progress?: Progress;
  onSelect: (dict: DictMeta) => void;
}) {
  const seen = progress?.seen ?? 0;
  const pct = dict.count ? Math.min(100, Math.round((seen / dict.count) * 100)) : 0;
  return (
    <button
      type="button"
      className={`dict-row ${selected ? 'is-selected' : ''} ${dict.aliasOf ? 'is-alias' : ''}`}
      onClick={() => onSelect(dict)}
      disabled={false}
      title={dict.aliasOf ? `与「${dict.aliasOf}」词表内容重复，已合并` : `${dict.title} · ${dict.count} 词`}
    >
      <div className="dict-main">
        <div className="dict-title-row">
          <span className="dict-title">{dict.title}</span>
          {dict.featured ? <span className="badge badge-gold">精选</span> : null}
          {dict.aliasOf ? <span className="badge">重复</span> : null}
        </div>
        <div className="dict-meta">
          <span>{dict.count.toLocaleString()} 词</span>
          <span>{dict.senses.toLocaleString()} 义项</span>
          <span>词性 {Math.round((dict.posRate || 0) * 100)}%</span>
        </div>
      </div>
      <div className="dict-progress">
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="pct">
          {seen}/{dict.count}
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const manifest = useAppStore((s) => s.manifest);
  const stats = useAppStore((s) => s.stats);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const selectDict = useAppStore((s) => s.selectDict);
  const selectedDictId = useAppStore((s) => s.selectedDictId);
  const dictMeta = useAppStore((s) => s.dictMeta);
  const dict = useAppStore((s) => s.dict);
  const dictLoading = useAppStore((s) => s.dictLoading);
  const dictError = useAppStore((s) => s.dictError);
  const pool = useAppStore((s) => s.pool);
  const poolLoading = useAppStore((s) => s.poolLoading);
  const poolError = useAppStore((s) => s.poolError);
  const session = useAppStore((s) => s.session);
  const startSession = useAppStore((s) => s.startSession);
  const resumeSession = useAppStore((s) => s.resumeSession);
  const setScreen = useAppStore((s) => s.setScreen);
  const showToast = useAppStore((s) => s.showToast);

  const [tab, setTab] = useState<'featured' | 'all'>('featured');
  const [query, setQuery] = useState('');

  const progressMap = useMemo(() => {
    const map: Record<string, Progress> = {};
    for (const [key, stat] of Object.entries(stats)) {
      const dictId = key.slice(0, key.indexOf(':'));
      if (!dictId) continue;
      const p = (map[dictId] ??= { seen: 0, mastered: 0, errors: 0 });
      if (stat.seen > 0) p.seen += 1;
      if (stat.mastered) p.mastered += 1;
      p.errors += stat.wrong + stat.missed + stat.over + stat.unknown + stat.timeouts;
    }
    return map;
  }, [stats]);

  const dicts = manifest?.dicts ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dicts.filter((d) => {
      if (tab === 'featured' && !d.featured) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
      );
    });
  }, [dicts, tab, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, DictMeta[]>();
    for (const d of filtered) {
      const list = map.get(d.category) ?? [];
      list.push(d);
      map.set(d.category, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const selectedMeta =
    dictMeta ?? dicts.find((d) => d.id === selectedDictId) ?? null;
  const selectedProgress = selectedMeta ? progressMap[selectedMeta.id] : undefined;

  const scopeCount = useMemo(() => {
    if (!selectedMeta) return 0;
    const p = selectedProgress ?? { seen: 0, mastered: 0, errors: 0 };
    switch (settings.scope) {
      case 'unmastered':
        return Math.max(0, p.seen - p.mastered);
      case 'new':
        return Math.max(0, selectedMeta.count - p.seen);
      default:
        return selectedMeta.count;
    }
  }, [selectedMeta, selectedProgress, settings.scope]);

  const roundCount =
    settings.roundSize === 'all' ? scopeCount : Math.min(settings.roundSize, scopeCount);

  const canStart = Boolean(selectedMeta && dict && !dictLoading && pool);

  const handleSelect = (meta: DictMeta) => {
    if (meta.aliasOf) {
      const target = dicts.find((d) => d.id === meta.aliasOf);
      showToast(`该词表与「${target?.title ?? meta.aliasOf}」重复，已合并`, 'info');
      return;
    }
    void selectDict(meta.id);
  };

  const setOrder = (order: OrderMode) => updateSettings({ order });

  return (
    <div>
      {session && !session.finished ? (
        <div className="resume-card">
          <div>
            <div className="resume-title">继续上次练习</div>
            <div className="resume-sub">
              {session.queue.length} 题 · 进行到第 {session.index + 1} 题 · 词表{' '}
              {dicts.find((d) => d.id === session.dictId)?.title ?? session.dictId}
            </div>
          </div>
          <button className="btn btn-primary btn-small" type="button" onClick={() => void resumeSession()}>
            继续
          </button>
        </div>
      ) : session?.finished ? (
        <div className="resume-card">
          <div>
            <div className="resume-title">上一轮已完成</div>
            <div className="resume-sub">共 {session.events.length} 题，可以回看结算或开始新一轮。</div>
          </div>
          <div className="inline">
            <button className="btn btn-small" type="button" onClick={() => setScreen('summary')}>
              看结算
            </button>
          </div>
        </div>
      ) : null}

      <div className="home-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">词表库</h2>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              共 {dicts.filter((d) => !d.aliasOf).length} 本
            </span>
          </div>
          <div className="dict-toolbar">
            <div className="tabs">
              <button
                type="button"
                className={`tab ${tab === 'featured' ? 'is-active' : ''}`}
                onClick={() => setTab('featured')}
              >
                精选
              </button>
              <button
                type="button"
                className={`tab ${tab === 'all' ? 'is-active' : ''}`}
                onClick={() => setTab('all')}
              >
                全部
              </button>
            </div>
            <input
              className="search"
              placeholder="搜索词表名 / 文件名 / 分类…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="dict-scroll">
            {grouped.length === 0 ? (
              <div className="empty">没有匹配的词表</div>
            ) : (
              grouped.map(([category, list]) => (
                <div key={category}>
                  <div className="dict-group-title">{category}</div>
                  {list.map((d) => (
                    <DictRow
                      key={d.id}
                      dict={d}
                      selected={d.id === selectedDictId}
                      progress={progressMap[d.id]}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="side">
          <section className="panel start-block">
            <h2 className="panel-title" style={{ marginBottom: 12 }}>
              本轮设置
            </h2>

            <div className="field">
              <div className="field-label">
                <span>当前词表</span>
                {selectedMeta?.featured ? <span className="badge badge-gold">精选</span> : null}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.02em' }}>
                {selectedMeta ? selectedMeta.title : '尚未选择'}
              </div>
              <div className="hint">
                {selectedMeta
                  ? `${selectedMeta.count.toLocaleString()} 词 · 已练 ${selectedProgress?.seen ?? 0} · 掌握 ${
                      selectedProgress?.mastered ?? 0
                    }`
                  : '在左侧词表库中点选一本词表'}
              </div>
              {dictLoading ? <div className="hint">词表加载中…</div> : null}
              {dictError ? (
                <div className="hint" style={{ color: 'var(--red)' }}>
                  {dictError}
                </div>
              ) : null}
            </div>

            <div className="field">
              <div className="field-label">
                <span>练习范围</span>
                <span className="mono">{SCOPE_HINTS[settings.scope]}</span>
              </div>
              <div className="segmented">
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    className={`seg ${settings.scope === scope ? 'is-active' : ''}`}
                    onClick={() => updateSettings({ scope })}
                  >
                    {SCOPE_LABELS[scope]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="field-label">
                <span>考察顺序</span>
                <span className="mono">{settings.order === 'random' ? '随机' : '顺序'}</span>
              </div>
              <div className="segmented">
                <button
                  type="button"
                  className={`seg ${settings.order === 'sequential' ? 'is-active' : ''}`}
                  onClick={() => setOrder('sequential')}
                >
                  顺序
                </button>
                <button
                  type="button"
                  className={`seg ${settings.order === 'random' ? 'is-active' : ''}`}
                  onClick={() => setOrder('random')}
                >
                  随机
                </button>
              </div>
              <div className="hint">
                {settings.order === 'random'
                  ? '每轮重新打乱顺序，避免按位置记忆。'
                  : '按词表原始顺序出题，进度可预期。'}
              </div>
            </div>

            <div className="field">
              <div className="field-label">
                <span>每轮题数</span>
                <span className="mono">{settings.roundSize === 'all' ? '全部' : `${settings.roundSize} 题`}</span>
              </div>
              <div className="segmented">
                {ROUND_OPTIONS.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    className={`seg ${settings.roundSize === opt.value ? 'is-active' : ''}`}
                    onClick={() => updateSettings({ roundSize: opt.value })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="start-count">
              <b>{roundCount}</b>
              <span>题 · 可练 {scopeCount}</span>
            </div>

            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={!canStart || roundCount === 0}
              onClick={() => void startSession()}
            >
              开始排查
            </button>

            {poolLoading ? <div className="hint">干扰词池加载中…</div> : null}
            {poolError ? (
              <div className="hint" style={{ color: 'var(--red)' }}>
                {poolError}
              </div>
            ) : null}
            {!selectedMeta ? <div className="hint">先选择一本词表，再开始。</div> : null}
            {selectedMeta && roundCount === 0 ? (
              <div className="hint">该范围暂时没有可练习的词，换个范围试试。</div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-body" style={{ padding: '14px 18px' }}>
              <div className="hint" style={{ marginTop: 0 }}>
                <b style={{ color: 'var(--ink-2)' }}>怎么判色</b>
                <br />
                绿 = 全对 · 黄 = 漏选 · 蓝 = 多选 · 红 = 错选
                <br />
                「不知道」记为未掌握，不算答错。
                <br />
                答对一次即视为掌握；之后答错会打回未掌握。
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
