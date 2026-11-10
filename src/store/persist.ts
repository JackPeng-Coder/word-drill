import { clear, createStore, del, get, set } from 'idb-keyval';
import type { Session, Settings, Stats } from '../lib/types';

export interface PersistedSnapshot {
  settings: Settings;
  stats: Stats;
  session: Session | null;
}

const SETTINGS_KEY = 'worddrill:settings';
const STATS_KEY = 'worddrill:stats';
const SESSION_KEY = 'worddrill:session';

/** 设置的同步镜像：IndexedDB 写入是异步的，刚改完就刷新会丢 */
const SETTINGS_MIRROR = 'worddrill:settings:mirror';

/** 独立库，避免与页面其它 IndexedDB 数据混在一起 */
const store = createStore('worddrill', 'kv');

/** IndexedDB 不可用时的内存降级 */
const memory = new Map<string, unknown>();
let idbUsable = true;

async function readKey<T>(key: string): Promise<T | undefined> {
  if (idbUsable) {
    try {
      return await get<T>(key, store);
    } catch {
      idbUsable = false;
    }
  }
  return memory.get(key) as T | undefined;
}

async function writeKey(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  if (!idbUsable) return;
  try {
    await set(key, value, store);
  } catch {
    idbUsable = false;
  }
}

async function deleteKey(key: string): Promise<void> {
  memory.delete(key);
  if (!idbUsable) return;
  try {
    await del(key, store);
  } catch {
    idbUsable = false;
  }
}

export async function loadSnapshot(): Promise<Partial<PersistedSnapshot>> {
  const [settingsFromIdb, stats, session] = await Promise.all([
    readKey<Settings>(SETTINGS_KEY),
    readKey<Stats>(STATS_KEY),
    readKey<Session>(SESSION_KEY),
  ]);
  let settings = settingsFromIdb;
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_MIRROR);
    if (raw) settings = JSON.parse(raw) as Settings;
  } catch {
    /* 忽略镜像读取失败 */
  }
  const snapshot: Partial<PersistedSnapshot> = {};
  if (settings) snapshot.settings = settings;
  if (stats) snapshot.stats = stats;
  if (session) snapshot.session = session;
  return snapshot;
}

/** 同步写入设置（localStorage 镜像）+ 异步写 IndexedDB */
export function saveSettingsNow(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_MIRROR, JSON.stringify(settings));
  } catch {
    /* 忽略 */
  }
  void saveSettings(settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeKey(SETTINGS_KEY, settings);
}

export async function saveStats(stats: Stats): Promise<void> {
  await writeKey(STATS_KEY, stats);
}

export async function saveSession(session: Session | null): Promise<void> {
  if (session) await writeKey(SESSION_KEY, session);
  else await deleteKey(SESSION_KEY);
}

export async function clearAll(): Promise<void> {
  memory.clear();
  try {
    globalThis.localStorage?.removeItem(SETTINGS_MIRROR);
  } catch {
    /* 忽略 */
  }
  if (!idbUsable) return;
  try {
    await Promise.all([del(SETTINGS_KEY, store), del(STATS_KEY, store), del(SESSION_KEY, store)]);
  } catch {
    idbUsable = false;
    try {
      await clear(store);
    } catch {
      /* 忽略 */
    }
  }
}
