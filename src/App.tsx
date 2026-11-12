import { useEffect } from 'react';
import { useAppStore, todayStats } from './store/appStore';
import Toast from './components/Toast';
import Home from './screens/Home';
import Drill from './screens/Drill';
import Summary from './screens/Summary';
import Settings from './screens/Settings';
import DataBank from './screens/DataBank';

function Masthead() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const stats = useAppStore((s) => s.stats);
  const today = todayStats(stats);
  const navs: Array<{ key: 'home' | 'settings' | 'data'; label: string }> = [
    { key: 'home', label: '练习台' },
    { key: 'settings', label: '设置' },
    { key: 'data', label: '存档' },
  ];
  const active = screen === 'drill' || screen === 'summary' ? 'home' : screen;

  return (
    <header className="masthead">
      <button className="brand" onClick={() => setScreen('home')} type="button">
        <span className="brand-zh">单词排查器</span>
        <span className="brand-en">WordDrill</span>
      </button>
      <div className="mast-right">
        <div className="mast-stat" title="今日作答次数">
          <b>{today.attempts}</b>
          <span>今日</span>
        </div>
        <div className="mast-stat" title="今日正确率">
          <b>{today.attempts ? `${Math.round(today.rate * 100)}%` : '—'}</b>
          <span>正确率</span>
        </div>
        <div className="mast-stat" title="练过但尚未掌握的全部词数；同一个词连对 2 次才算掌握">
          <b>{today.unmastered}</b>
          <span>未掌握</span>
        </div>
        <nav className="mast-nav">
          {navs.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`nav-btn ${active === n.key ? 'is-active' : ''}`}
              onClick={() => setScreen(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  const booted = useAppStore((s) => s.booted);
  const bootError = useAppStore((s) => s.bootError);
  const screen = useAppStore((s) => s.screen);
  const boot = useAppStore((s) => s.boot);
  const savedAt = useAppStore((s) => s.savedAt);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [screen]);

  useEffect(() => {
    const flush = () => useAppStore.getState().touchSave();
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  if (!booted) {
    return (
      <div className="app-shell">
        <div className="center-screen">
          <div className="loading-card">
            <div className="spinner" />
            <div className="muted">正在打开词库…</div>
          </div>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="app-shell">
        <div className="center-screen">
          <div className="loading-card">
            <h2 style={{ marginTop: 0 }}>词库加载失败</h2>
            <p className="muted" style={{ maxWidth: 460, lineHeight: 1.7 }}>
              {bootError}
              <br />
              请在项目目录执行 <code>pnpm build:data</code> 生成
              <code> public/data</code>，然后刷新页面。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Masthead />
      {screen === 'home' && <Home />}
      {screen === 'drill' && <Drill />}
      {screen === 'summary' && <Summary />}
      {screen === 'settings' && <Settings />}
      {screen === 'data' && <DataBank />}
      <footer className="footer">
        <span>本地运行 · 数据仅保存在此浏览器</span>
        <span className="mono">
          {savedAt ? `已保存 ${new Date(savedAt).toLocaleTimeString()}` : '自动保存已开启'}
        </span>
      </footer>
      <Toast />
    </div>
  );
}
