import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { downloadText, todayStamp } from '../lib/download';
import { buildBundle, collectMistaken, exportUnmasteredTxt, parseBundle } from '../store/transfer';

type TxtFormat = 'word' | 'gloss' | 'posGloss';

export default function DataBank() {
  const settings = useAppStore((s) => s.settings);
  const stats = useAppStore((s) => s.stats);
  const dict = useAppStore((s) => s.dict);
  const dictMeta = useAppStore((s) => s.dictMeta);
  const showToast = useAppStore((s) => s.showToast);
  const importBundle = useAppStore((s) => s.importBundle);
  const clearEverything = useAppStore((s) => s.clearEverything);
  const clearDictProgress = useAppStore((s) => s.clearDictProgress);

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [txtFormat, setTxtFormat] = useState<TxtFormat>('word');
  const [txtSort, setTxtSort] = useState<'errors' | 'alpha'>('errors');
  const [confirmText, setConfirmText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportable = useMemo(
    () => (dict ? collectMistaken(dictMeta?.id, dict.words, stats).length : 0),
    [dict, dictMeta, stats],
  );

  const totals = useMemo(() => {
    let seen = 0;
    let mastered = 0;
    let unmastered = 0;
    for (const stat of Object.values(stats)) {
      if (stat.seen > 0) {
        seen += 1;
        if (stat.mastered) mastered += 1;
        else unmastered += 1;
      }
    }
    return { seen, mastered, unmastered, words: Object.keys(stats).length };
  }, [stats]);

  const exportJson = () => {
    const bundle = buildBundle(settings, stats);
    downloadText(
      `worddrill-存档-${todayStamp()}.json`,
      JSON.stringify(bundle, null, 2),
      'application/json',
    );
    showToast('存档已导出', 'ok');
  };

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseBundle(text);
    if (!parsed.ok) {
      showToast(parsed.error, 'error');
      return;
    }
    await importBundle(parsed.bundle, importMode);
    showToast(importMode === 'merge' ? '已合并导入' : '已覆盖导入', 'ok');
    if (fileRef.current) fileRef.current.value = '';
  };

  const exportTxt = async () => {
    if (!dict || !dictMeta) {
      showToast('请先在练习台选择一本词表', 'warn');
      return;
    }
    const text = exportUnmasteredTxt({
      dictId: dictMeta.id,
      words: dict.words,
      stats,
      format: txtFormat,
      sort: txtSort,
    });
    if (!text.trim()) {
      showToast('还没有选错过的词，暂无可导出的内容', 'warn');
      return;
    }
    downloadText(`未掌握-${dictMeta.title}-${todayStamp()}.txt`, text, 'text/plain');
    showToast('TXT 已导出', 'ok');
  };

  const canClear = confirmText.trim() === '清除';

  return (
    <div>
      <div className="page-head">
        <h2>存档与数据</h2>
        <p>数据只保存在本浏览器的 IndexedDB 中；换设备或清缓存前请先导出。</p>
      </div>

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">备份 / 迁移</h2>
          </div>
          <div className="panel-body stack">
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="setting-label">导出存档 JSON</div>
                <div className="setting-desc">包含全部设置与逐词学习记录。</div>
              </div>
              <button className="btn" type="button" onClick={() => void exportJson()}>
                导出
              </button>
            </div>

            <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
              <div className="setting-label" style={{ marginBottom: 8 }}>
                导入存档 JSON
              </div>
              <div className="inline">
                <div className="segmented" style={{ width: 200 }}>
                  <button
                    type="button"
                    className={`seg ${importMode === 'merge' ? 'is-active' : ''}`}
                    onClick={() => setImportMode('merge')}
                  >
                    逐词较新合并
                  </button>
                  <button
                    type="button"
                    className={`seg ${importMode === 'replace' ? 'is-active' : ''}`}
                    onClick={() => setImportMode('replace')}
                  >
                    整份覆盖
                  </button>
                </div>
                <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
                  选择文件…
                </button>
                <input
                  ref={fileRef}
                  className="file-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="hint">
                合并：同一个词取最近一次记录；覆盖：用导入文件的记录整体替换现有记录。
              </div>
            </div>

            <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
              <div className="setting-label">当前记录</div>
              <div className="hint" style={{ marginTop: 6 }}>
                已练 <b>{totals.seen}</b> 词 · 掌握 <b>{totals.mastered}</b> · 未掌握{' '}
                <b>{totals.unmastered}</b> · 记录 <b>{totals.words}</b> 条
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">导出未掌握 TXT</h2>
          </div>
          <div className="panel-body stack">
            <div>
              <div className="setting-label" style={{ marginBottom: 8 }}>
                内容格式
              </div>
              <div className="segmented">
                <button
                  type="button"
                  className={`seg ${txtFormat === 'word' ? 'is-active' : ''}`}
                  onClick={() => setTxtFormat('word')}
                >
                  仅单词
                </button>
                <button
                  type="button"
                  className={`seg ${txtFormat === 'gloss' ? 'is-active' : ''}`}
                  onClick={() => setTxtFormat('gloss')}
                >
                  词 + 中文
                </button>
                <button
                  type="button"
                  className={`seg ${txtFormat === 'posGloss' ? 'is-active' : ''}`}
                  onClick={() => setTxtFormat('posGloss')}
                >
                  词 + 词性 + 中文
                </button>
              </div>
            </div>

            <div>
              <div className="setting-label" style={{ marginBottom: 8 }}>
                排序
              </div>
              <div className="segmented">
                <button
                  type="button"
                  className={`seg ${txtSort === 'errors' ? 'is-active' : ''}`}
                  onClick={() => setTxtSort('errors')}
                >
                  错误多优先
                </button>
                <button
                  type="button"
                  className={`seg ${txtSort === 'alpha' ? 'is-active' : ''}`}
                  onClick={() => setTxtSort('alpha')}
                >
                  字母序
                </button>
              </div>
            </div>

            <div className="inline">
              <span className="setting-label">当前可导出</span>
              <b>{exportable}</b>
              <span className="setting-desc" style={{ marginTop: 0 }}>
                词
              </span>
            </div>

            <div className="hint">
              仅导出<b>选错过且尚未掌握</b>的词（错选 / 漏选 / 多选）；只标记过「不知道」、超时或跳过的词不计入。
              <br />
              范围为当前词表：{dictMeta?.title ?? '尚未选择（请先到练习台选词表）'}
            </div>
            <button className="btn" type="button" onClick={() => void exportTxt()} disabled={!dict}>
              导出 TXT
            </button>
          </div>
        </section>

        <section className="panel" style={{ borderColor: 'rgba(166,43,31,.35)' }}>
          <div className="panel-head">
            <h2 className="panel-title" style={{ color: 'var(--red)' }}>
              清除数据
            </h2>
          </div>
          <div className="panel-body stack">
            <div className="danger-zone">
              <h3>不可撤销</h3>
              <p className="setting-desc" style={{ marginTop: 0 }}>
                清除后学习记录、掌握状态与本轮进度都会消失。建议先导出 JSON 存档。
              </p>
              <div className="inline">
                <input
                  className="confirm-input"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="输入 清除"
                  aria-label="确认清除"
                />
                <button
                  className="btn btn-danger btn-small"
                  type="button"
                  disabled={!canClear}
                  onClick={() => {
                    void clearEverything();
                    setConfirmText('');
                    showToast('数据已清除', 'ok');
                  }}
                >
                  清除全部数据
                </button>
              </div>
            </div>

            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="setting-label">清除当前词表进度</div>
                <div className="setting-desc">
                  {dictMeta ? `仅删除「${dictMeta.title}」的逐词记录` : '尚未选择词表'}
                </div>
              </div>
              <button
                className="btn btn-small"
                type="button"
                disabled={!dictMeta}
                onClick={() => {
                  if (!dictMeta) return;
                  void clearDictProgress(dictMeta.id);
                  showToast('该词表进度已清除', 'ok');
                }}
              >
                清除进度
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
