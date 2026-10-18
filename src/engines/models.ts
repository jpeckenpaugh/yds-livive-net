/**
 * Storage: the `audio` and `models` IndexedDB stores, the `AudioCache` and
 * `ModelSource` implementations, and the `persist()` call (D3 §9, amendments
 * Z10/B2).
 *
 * The logic is written against a tiny `KeyValueStore` + `StorageManager` seam so
 * it is testable in Node (the `engines` project has no IndexedDB): the browser
 * gets the IndexedDB implementation, tests get `memoryStore()` / `fakeStorage()`.
 *
 * Two contracts live here and nowhere else:
 *   - `persist()` is requested **before the first byte** of the first download
 *     (D3 §9) — it has no chance of being granted otherwise;
 *   - `QuotaExceededError` is a distinct, non-fatal state: the download stops,
 *     the partial write is discarded, and a miss and an eviction are the same
 *     code path (re-fetch).
 */

import {
  AUDIO_CACHE_STORE,
  MODELS_CACHE_STORE,
  type AudioCache,
  type AudioCacheUsage,
  type CachedAudioMeta,
  type DownloadProgress,
  type ModelFileRef,
  type ModelSource,
} from './ports.ts';

/* ------------------------------------------------------------------ stores */

export type KeyValueStore = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
};

export type StorageManager = {
  persist(): Promise<boolean>;
  estimate(): Promise<{ usage?: number; quota?: number }>;
};

/** An in-memory `KeyValueStore` for tests. */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(map.get(key)),
    put: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    clear: () => {
      map.clear();
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...map.keys()]),
  };
}

/** A `StorageManager` fake: `persist` resolves to `granted`. */
export function fakeStorage(granted = true): StorageManager {
  return {
    persist: () => Promise.resolve(granted),
    estimate: () => Promise.resolve({ usage: 0, quota: 1_000_000_000 }),
  };
}

/** The browser's `navigator.storage`, or a no-op when it is absent. */
export function browserStorage(): StorageManager {
  const s = globalThis.navigator?.storage;
  return {
    persist: () => Promise.resolve(s?.persist?.() ?? false),
    estimate: () => Promise.resolve(s?.estimate?.() ?? {}),
  };
}

/** Open the app database and return its two stores. Browser-only. */
export function openDatabase(name = 'yds.audio.v1'): Promise<{
  audio: KeyValueStore;
  models: KeyValueStore;
}> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) db.createObjectStore(AUDIO_CACHE_STORE);
      if (!db.objectStoreNames.contains(MODELS_CACHE_STORE))
        db.createObjectStore(MODELS_CACHE_STORE);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onsuccess = () => {
      const db = request.result;
      const wrap = (storeName: string): KeyValueStore => ({
        get(key) {
          return new Promise((res, rej) => {
            const r = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error ?? new Error('IndexedDB request failed'));
          });
        },
        put(key, value) {
          return new Promise<void>((res, rej) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(value, key);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error ?? new Error('IndexedDB transaction failed'));
            tx.onabort = () => rej(tx.error ?? new Error('IndexedDB transaction failed'));
          });
        },
        delete(key) {
          return new Promise<void>((res, rej) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error ?? new Error('IndexedDB transaction failed'));
          });
        },
        clear() {
          return new Promise<void>((res, rej) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error ?? new Error('IndexedDB transaction failed'));
          });
        },
        keys() {
          return new Promise<string[]>((res, rej) => {
            const r = db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys();
            r.onsuccess = () => res(r.result.map(String));
            r.onerror = () => rej(r.error ?? new Error('IndexedDB request failed'));
          });
        },
      });
      resolve({ audio: wrap(AUDIO_CACHE_STORE), models: wrap(MODELS_CACHE_STORE) });
    };
  });
}

/* ------------------------------------------------------------------ errors */

/** A `storage-failed` error, the non-fatal quota/eviction state (D3 §9). */
export function storageError(
  message: string,
  action?: string,
): Error & { kind: 'storage-failed'; action?: string } {
  const error = new Error(message) as Error & { kind: 'storage-failed'; action?: string };
  error.kind = 'storage-failed';
  if (action) error.action = action;
  return error;
}

function isQuotaExceeded(error: unknown): boolean {
  const name = (error as { name?: string } | undefined)?.name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/* ------------------------------------------------------------------ audio cache */

export function createAudioCache(store: KeyValueStore): AudioCache {
  return {
    async has(key) {
      return (await store.get(key)) !== undefined;
    },
    async get(key) {
      const value = await store.get(key);
      return value instanceof Blob ? value : null;
    },
    async put(key, audio: Blob, meta: CachedAudioMeta) {
      try {
        await store.put(key, audio);
        await store.put(`${key}\u0000meta`, meta);
      } catch (error) {
        if (isQuotaExceeded(error)) {
          await store.delete(key).catch(() => undefined);
          throw storageError('audio cache is full', 'delete cached audio');
        }
        throw error;
      }
    },
    async clear() {
      await store.clear();
    },
    async usage(): Promise<AudioCacheUsage> {
      const keys = await store.keys();
      let bytes = 0;
      let entries = 0;
      for (const key of keys) {
        if (key.endsWith('\u0000meta')) continue;
        const value = await store.get(key);
        if (value instanceof Blob) {
          entries += 1;
          bytes += value.size;
        }
      }
      return { bytes, entries };
    },
  };
}

/* ------------------------------------------------------------------ model source */

export type FetchFile = (url: string) => Promise<ArrayBuffer>;

/** The default fetch: a plain GET, rejecting on a non-2xx status. */
export const httpFetchFile: FetchFile = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`);
  return response.arrayBuffer();
};

export function modelFileKey(ref: ModelFileRef): string {
  return `${ref.repoId}@${ref.revision}/${ref.path}`;
}

/** `https://huggingface.co/<repo>/resolve/<revision>/<path>` — the pinned revision. */
export function modelFileUrl(ref: ModelFileRef): string {
  return `https://huggingface.co/${ref.repoId}/resolve/${ref.revision}/${ref.path}`;
}

export type CreateModelSourceOptions = {
  store: KeyValueStore;
  storage: StorageManager;
  fetchFile?: FetchFile;
  /** Plan file sizes, so progress can report a total without a HEAD per file. */
  sizes?: ReadonlyMap<string, number>;
};

/**
 * The `models` store + fetch seam (D3 §9). One instance serves one selected
 * packaging's plan.
 */
export function createModelSource(options: CreateModelSourceOptions): ModelSource {
  const { store, storage } = options;
  const fetchFile = options.fetchFile ?? httpFetchFile;
  let persisted: Promise<boolean> | null = null;

  /** `persist()` is requested once, before the first fetch (D3 §9, AC-ENG-15). */
  function ensurePersisted(): Promise<boolean> {
    persisted ??= storage.persist();
    return persisted;
  }

  return {
    async isReady(plan) {
      for (const ref of plan) {
        if ((await store.get(modelFileKey(ref))) === undefined) return false;
      }
      return true;
    },

    async ensure(plan, onProgress) {
      const total = plan.reduce((sum, ref) => sum + (options.sizes?.get(ref.path) ?? 0), 0);
      let received = 0;
      let anyMissing = false;
      for (const ref of plan) {
        if ((await store.get(modelFileKey(ref))) === undefined) anyMissing = true;
      }
      if (!anyMissing) return;
      // Before the first byte of the first download.
      await ensurePersisted();

      for (const ref of plan) {
        const key = modelFileKey(ref);
        const cached = await store.get(key);
        if (cached !== undefined) {
          received += (cached as ArrayBuffer).byteLength;
          onProgress?.({ totalBytes: total || null, receivedBytes: received, current: ref.path });
          continue;
        }
        onProgress?.({ totalBytes: total || null, receivedBytes: received, current: ref.path });
        let buffer: ArrayBuffer;
        try {
          buffer = await fetchFile(modelFileUrl(ref));
        } catch (error) {
          // A failed fetch leaves nothing half-written.
          await store.delete(key).catch(() => undefined);
          throw storageError(
            `could not download ${ref.path}: ${(error as Error).message}`,
            'check your connection and try again',
          );
        }
        try {
          await store.put(key, buffer);
        } catch (error) {
          await store.delete(key).catch(() => undefined);
          if (isQuotaExceeded(error)) {
            throw storageError(
              `not enough space for the audio engine (${Math.round(total / 1048576)} MB needed)`,
              'delete cached audio',
            );
          }
          throw error;
        }
        received += buffer.byteLength;
        onProgress?.({ totalBytes: total || null, receivedBytes: received, current: ref.path });
      }
    },

    async read(ref) {
      const value = await store.get(modelFileKey(ref));
      if (value === undefined) {
        // Evicted or never downloaded: identical, re-fetch (D3 §9).
        throw storageError(`model file ${ref.path} is not cached`, 'download the audio engine');
      }
      return value as ArrayBuffer;
    },

    async clear() {
      await store.clear();
      persisted = null;
    },

    async usage() {
      const keys = await store.keys();
      let bytes = 0;
      for (const key of keys) {
        const value = await store.get(key);
        if (value instanceof ArrayBuffer) bytes += value.byteLength;
      }
      return { bytes, entries: keys.length };
    },
  };
}

export type { DownloadProgress };
