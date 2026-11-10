import { beforeEach, describe, expect, it } from 'vitest';
import { clearAll, loadSnapshot, saveSession, saveSettings, saveStats } from '../../../src/store/persist';
import { DEFAULT_SETTINGS, emptyStat, type Session } from '../../../src/lib/types';

const session: Session = {
  id: 's1',
  dictId: 'cet4',
  queue: ['cancel'],
  index: 0,
  picks: [],
  item: null,
  events: [],
  startedAt: 1,
  settings: DEFAULT_SETTINGS,
  revealed: false,
  finished: false,
};

describe('persist（IndexedDB 不可用时降级为内存）', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('初始快照为空', async () => {
    expect(await loadSnapshot()).toEqual({});
  });

  it('设置 / 统计 / 会话可保存并读回', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, order: 'random', timeLimitSec: 30 });
    await saveStats({ 'cet4:cancel': { ...emptyStat(), seen: 1 } });
    await saveSession(session);

    const snapshot = await loadSnapshot();
    expect(snapshot.settings?.order).toBe('random');
    expect(snapshot.settings?.timeLimitSec).toBe(30);
    expect(snapshot.stats?.['cet4:cancel'].seen).toBe(1);
    expect(snapshot.session?.id).toBe('s1');
  });

  it('saveSession(null) 会移除会话', async () => {
    await saveSession(session);
    await saveSession(null);
    expect((await loadSnapshot()).session).toBeUndefined();
  });

  it('clearAll 清空全部数据', async () => {
    await saveSettings(DEFAULT_SETTINGS);
    await saveStats({ a: emptyStat() });
    await saveSession(session);
    await clearAll();
    expect(await loadSnapshot()).toEqual({});
  });
});
