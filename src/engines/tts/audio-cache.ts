/**
 * The audio cache decorator (D3 §7).
 *
 * Transparent: when `engine.capabilities.cache` is false it returns the engine
 * unchanged, so **M1 has no cache store populated at all**. The key discipline is
 * specified now so a future store cannot serve mismatched audio.
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
          play: () => playBlob(cached),
          stop: () => undefined,
        } satisfies Utterance;
      }

      const utterance = await engine.synth(req);
      const original = utterance.play.bind(utterance);
      return {
        ...utterance,
        async play() {
          await original();
        },
        stop() {
          utterance.stop();
        },
      };
    },
  };
};
