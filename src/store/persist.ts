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
  const [settings, stats, session] = await Promise.all([
    readKey<Settings>(SETTINGS_KEY),
    readKey<Stats>(STATS_KEY),
    readKey<Session>(SESSION_KEY),
  ]);
  const snapshot: Partial<PersistedSnapshot> = {};
  if (settings) snapshot.settings = settings;
  if (stats) snapshot.stats = stats;
  if (session) snapshot.session = session;
  return snapshot;
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
