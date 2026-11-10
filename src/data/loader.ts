import { get, set } from 'idb-keyval';
import type { DictFile, DictMeta, Manifest, PoolFile } from '../lib/types';

const BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`加载失败（${res.status}）：${path}`);
  return (await res.json()) as T;
}

let manifestPromise: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = getJson<Manifest>(`${BASE}manifest.json`).catch((err) => {
      manifestPromise = null;
      throw err;
    });
  }
  return manifestPromise;
}

const dictCache = new Map<string, Promise<DictFile>>();

export function loadDict(meta: DictMeta, manifest?: Manifest): Promise<DictFile> {
  const cached = dictCache.get(meta.id);
  if (cached) return cached;
  let file = meta.file;
  if (!file && meta.aliasOf && manifest) {
    const target = manifest.dicts.find((d) => d.id === meta.aliasOf);
    file = target?.file ?? null;
  }
  if (!file) return Promise.reject(new Error(`词表 ${meta.title} 无可加载文件`));
  const p = getJson<DictFile>(`${BASE}${file}`).catch((err) => {
    dictCache.delete(meta.id);
    throw err;
  });
  dictCache.set(meta.id, p);
  return p;
}

/** 音标清理：去掉首尾引号与多余空格 */
export function cleanPhonetic(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/^[\s'"]+|[\s'"]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ *
 * 干扰词池：首次下载后写入 IndexedDB，避免每次刷新重复拉取
 * ------------------------------------------------------------------ */

const POOL_CACHE_KEY = 'worddrill:pool:';

export async function loadPool(version: number): Promise<PoolFile> {
  const key = `${POOL_CACHE_KEY}${version}`;
  try {
    const cached = await get<PoolFile>(key);
    if (cached && cached.version === version) return cached;
  } catch {
    /* IndexedDB 不可用则直接下载 */
  }
  const pool = await getJson<PoolFile>(`${BASE}pool.json`);
  try {
    await set(key, pool);
  } catch {
    /* 忽略缓存失败 */
  }
  return pool;
}

