import { describe, expect, it } from 'vitest';
import {
  createModelSource,
  memoryStore,
  type KeyValueStore,
  type StorageManager,
} from '../../src/engines/models.ts';
import type { ModelFileRef } from '../../src/engines/ports.ts';

const plan: ModelFileRef[] = [
  { repoId: 'org/model', revision: 'abc', path: 'a.onnx' },
  { repoId: 'org/model', revision: 'abc', path: 'b.onnx' },
];

/** A store whose `put` throws a quota error after `n` successful writes. */
function quotaStore(after: number): KeyValueStore {
  const inner = memoryStore();
  let writes = 0;
  return {
    ...inner,
    async put(key, value) {
      if (writes >= after) {
        const error = new Error('quota') as Error & { name: string };
        error.name = 'QuotaExceededError';
        throw error;
      }
      writes += 1;
      return inner.put(key, value);
    },
  };
}

function orderedStorage(events: string[]): StorageManager {
  return {
    async persist() {
      events.push('persist');
      return true;
    },
    async estimate() {
      return {};
    },
  };
}

describe('model source (D3 §9, AC-ENG-15)', () => {
  it('requests persist() before the first byte of the first download', async () => {
    const events: string[] = [];
    const models = createModelSource({
      store: memoryStore(),
      storage: orderedStorage(events),
      fetchFile: async (url) => {
        events.push(`fetch:${url.split('/').pop()}`);
        return new ArrayBuffer(8);
      },
    });
    await models.ensure(plan);
    expect(events[0]).toBe('persist');
    expect(events[1]?.startsWith('fetch:')).toBe(true);
  });

  it('reports a byte total and a per-file progress line', async () => {
    const progress: number[] = [];
    const models = createModelSource({
      store: memoryStore(),
      storage: orderedStorage([]),
      fetchFile: async () => new ArrayBuffer(10),
      sizes: new Map([
        ['a.onnx', 10],
        ['b.onnx', 10],
      ]),
    });
    await models.ensure(plan, (p) => progress.push(p.receivedBytes));
    expect(progress.at(-1)).toBe(20);
  });

  it('a QuotaExceededError stops the download and leaves nothing half-written', async () => {
    const store = quotaStore(0);
    const models = createModelSource({
      store,
      storage: orderedStorage([]),
      fetchFile: async () => new ArrayBuffer(8),
    });
    await expect(models.ensure(plan)).rejects.toMatchObject({ kind: 'storage-failed' });
    expect(await store.keys()).toEqual([]);
  });

  it('a failed fetch leaves nothing half-written', async () => {
    const store = memoryStore();
    const models = createModelSource({
      store,
      storage: orderedStorage([]),
      fetchFile: async () => {
        throw new Error('offline');
      },
    });
    await expect(models.ensure(plan)).rejects.toMatchObject({ kind: 'storage-failed' });
    expect(await store.keys()).toEqual([]);
  });

  it('a missing file reads as an eviction: re-fetch, never crash', async () => {
    const models = createModelSource({
      store: memoryStore(),
      storage: orderedStorage([]),
      fetchFile: async () => new ArrayBuffer(8),
    });
    expect(await models.isReady(plan)).toBe(false);
    await expect(models.read(plan[0]!)).rejects.toMatchObject({ kind: 'storage-failed' });
    await models.ensure(plan);
    expect(await models.isReady(plan)).toBe(true);
    expect((await models.read(plan[0]!)).byteLength).toBe(8);
  });
});
