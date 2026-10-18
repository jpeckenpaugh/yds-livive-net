/**
 * The audio cache decorator (D3 §7, amendments Z10/B1).
 *
 * Transparent: when `engine.capabilities.cache` is false it returns the engine
 * unchanged, so **M1 has no cache store populated at all**.
 *
 * On a **miss** it now writes the produced audio to the store — it reads
 * `utterance.blob`, present because the engine returned a `kind: 'buffer'`
 * utterance — under the key it already computed. Before amendment B1 the
 * decorator could only ever read, which is why the cache was unpopulatable.
 * On a **hit** it returns a `buffer` utterance that plays the cached Blob.
 */

import type { AudioCache, TtsEngine, Utterance, WithAudioCache } from '../ports.ts';
import { utteranceKey } from './stable-key.ts';

function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(finish);
  });
}

export const withAudioCache: WithAudioCache = (engine: TtsEngine, cache: AudioCache): TtsEngine => {
  if (!engine.capabilities.cache) return engine;

  return {
    ...engine,
    async synth(req) {
      const key = await utteranceKey({
        engineId: engine.id,
        engineRevision: engine.revision,
        voiceId: req.voiceId,
        lang: req.lang,
        speed: req.speed,
        text: req.text,
      });

      const cached = await cache.get(key);
      if (cached) {
        return {
          kind: 'buffer',
          key,
          durationMs: null,
          blob: cached,
          play: () => playBlob(cached),
          stop: () => undefined,
        } satisfies Utterance;
      }

      const utterance = await engine.synth(req);
      const blob = utterance.blob;
      if (blob && utterance.kind === 'buffer') {
        // Best-effort: a full cache must not fail the utterance that was already
        // synthesised (D3 §7.6 — a miss and an eviction are the same path).
        await cache
          .put(key, blob, {
            bytes: blob.size,
            engineId: engine.id,
            engineRevision: engine.revision,
            voiceId: req.voiceId,
            lang: req.lang,
            speed: req.speed,
            createdAt: Date.now(),
          })
          .catch(() => undefined);
      }
      return utterance;
    },
  };
};
