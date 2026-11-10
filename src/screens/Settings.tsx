import { useAppStore } from '../store/appStore';
import type { OrderMode, Scope } from '../lib/types';
import { SETTINGS_LIMITS } from '../lib/types';

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-label">{label}</div>
        {desc ? <div className="setting-desc">{desc}</div> : null}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

const TIME_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0, label: '关' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 20, label: '20s' },
  { value: 30, label: '30s' },
];

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unmastered', label: '未掌握' },
  { value: 'new', label: '新词' },
  { value: 'wrongFirst', label: '错词优先' },
];

const ORDERS: Array<{ value: OrderMode; label: string }> = [
  { value: 'sequential', label: '顺序' },
  { value: 'random', label: '随机' },
];

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const reset = useAppStore((s) => s.resetSettings);
  const setScreen = useAppStore((s) => s.setScreen);

  const clampTime = (value: number) => {
    const { min, max } = SETTINGS_LIMITS.timeLimitSec;
    return Math.min(max, Math.max(min, Math.round(value) || 0));
  };

  return (
    <div>
      <div className="page-head">
        <h2>设置</h2>
        <p>所有改动即时生效，并自动保存到本浏览器。</p>
      </div>

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">出题节奏</h2>
          </div>
          <div>
            <Row
              label="每题限时"
              desc="超时自动判为未掌握；切到后台会暂停计时。"
            >
              <div className="inline">
                {TIME_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`seg ${settings.timeLimitSec === p.value ? 'is-active' : ''}`}
                    style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '6px 10px' }}
                    onClick={() => update({ timeLimitSec: p.value })}
                  >
                    {p.label}
                  </button>
                ))}
                <input
                  className="num-input"
                  type="number"
                  min={0}
                  max={300}
                  value={settings.timeLimitSec}
                  aria-label="自定义限时秒数"
                  onChange={(e) => update({ timeLimitSec: clampTime(Number(e.target.value)) })}
                />
              </div>
            </Row>

            <Row label="每轮题数" desc="一轮结束后可只练错词或重开一轮。">
              <div className="inline">
                {[20, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`seg ${settings.roundSize === n ? 'is-active' : ''}`}
                    style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '6px 10px' }}
                    onClick={() => update({ roundSize: n })}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className={`seg ${settings.roundSize === 'all' ? 'is-active' : ''}`}
                  style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '6px 10px' }}
                  onClick={() => update({ roundSize: 'all' })}
                >
                  全部
                </button>
              </div>
            </Row>

            <Row
              label="「以上都不对」出现率"
              desc="该比例的题目中，四个释义选项全错，唯一正确答案是「以上都不对」。"
            >
              <div className="inline">
                <input
                  className="range"
                  type="range"
                  min={SETTINGS_LIMITS.noneRate.min * 100}
                  max={SETTINGS_LIMITS.noneRate.max * 100}
                  step={SETTINGS_LIMITS.noneRate.step * 100}
                  value={Math.round(settings.noneRate * 100)}
                  onChange={(e) => update({ noneRate: Number(e.target.value) / 100 })}
                  aria-label="以上都不对出现率"
                />
                <span className="mono" style={{ fontSize: 12, width: 38, textAlign: 'right' }}>
                  {Math.round(settings.noneRate * 100)}%
                </span>
              </div>
            </Row>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">出题规则</h2>
          </div>
          <div>
            <Row
              label="多义项不定项"
              desc="单词有 2 个以上义项时，正确项可能有多个，需全部选中。"
            >
              <Switch
                label="多义项不定项"
                checked={settings.multiSense}
                onChange={(v) => update({ multiSense: v })}
              />
            </Row>

            <Row label="考察顺序" desc="顺序按词表原序；随机每轮重新洗牌。">
              <div className="segmented" style={{ width: 150 }}>
                {ORDERS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`seg ${settings.order === o.value ? 'is-active' : ''}`}
                    onClick={() => update({ order: o.value })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="练习范围" desc="以当前选中词表为范围。">
              <div className="segmented" style={{ width: 240 }}>
                {SCOPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`seg ${settings.scope === s.value ? 'is-active' : ''}`}
                    onClick={() => update({ scope: s.value })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Row>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">交互与显示</h2>
          </div>
          <div>
            <Row label="显示音标" desc="词库中带音标时展示。">
              <Switch
                label="显示音标"
                checked={settings.showPhonetic}
                onChange={(v) => update({ showPhonetic: v })}
              />
            </Row>
            <Row label="单选单击即提交" desc="关闭后需要用 Enter 或「提交」按钮确认。">
              <Switch
                label="单选单击即提交"
                checked={settings.instantSubmit}
                onChange={(v) => update({ instantSubmit: v })}
              />
            </Row>
            <Row label="答对自动下一题" desc="答错或超时会停留，方便看清正确释义。">
              <Switch
                label="答对自动下一题"
                checked={settings.autoNextOnCorrect}
                onChange={(v) => update({ autoNextOnCorrect: v })}
              />
            </Row>
            <Row label="允许回退" desc="回退会撤销上一题统计，并恢复同一组选项。">
              <Switch
                label="允许回退"
                checked={settings.allowBack}
                onChange={(v) => update({ allowBack: v })}
              />
            </Row>
            <Row label="允许跳过" desc="跳过的词计入未掌握。">
              <Switch
                label="允许跳过"
                checked={settings.allowSkip}
                onChange={(v) => update({ allowSkip: v })}
              />
            </Row>
            <Row label="音效" desc="盖章式提示音，默认关闭。">
              <Switch
                label="音效"
                checked={settings.sound}
                onChange={(v) => update({ sound: v })}
              />
            </Row>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">存档</h2>
          </div>
          <div className="panel-body stack">
            <p className="expl" style={{ margin: 0 }}>
              设置与学习记录会自动保存。你可以导出 JSON 存档备份，或导出未掌握词表到 TXT 做别的复习。
            </p>
            <div className="inline">
              <button className="btn" type="button" onClick={() => setScreen('data')}>
                打开存档页
              </button>
              <button className="btn btn-ghost" type="button" onClick={reset}>
                恢复默认设置
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
