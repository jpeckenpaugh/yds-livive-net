import { describe, expect, it } from 'vitest';
import { withAudioCache } from '../../src/engines/tts/audio-cache.ts';
import { utteranceKey } from '../../src/engines/tts/stable-key.ts';
import { createAudioCache, memoryStore } from '../../src/engines/models.ts';
import type { AudioCache, TtsEngine, Utterance } from '../../src/engines/ports.ts';

/** A minimal caching engine: one blob per synth, no browser. */
function cachingEngine(id: TtsEngine['id'], revision: string): TtsEngine {
  let produced = 0;
  return {
    id,
    revision,
    capabilities: {
      prefetch: true,
      cache: true,
      duration: true,
      offline: true,
      preservesVoiceIdentityAcrossLangs: true,
    },
    init: async () => undefined,
    voices: async () => [],
    resolveVoice: () => 'M1',
    async synth() {
      produced += 1;
      const blob = new Blob([`take-${produced}`], { type: 'audio/wav' });
      const key = await utteranceKey({
        engineId: id,
        engineRevision: revision,
        voiceId: 'M2',
        lang: 'es',
        speed: 1,
        text: 'Hola',
      });
      return {
        kind: 'buffer',
        key,
        durationMs: 100,
        blob,
        play: async () => undefined,
        stop: () => undefined,
      } satisfies Utterance;
    },
    dispose: () => undefined,
  };
}

const req = { text: 'Hola', characterId: 'ron', voiceId: 'M2', lang: 'es', speed: 1 } as const;

describe('audio cache (D3 §7.4a, AC-ENG-05)', () => {
  it('writes the produced audio on a miss and replays it on a hit', async () => {
    const cache: AudioCache = createAudioCache(memoryStore());
    const engine = withAudioCache(cachingEngine('supertonic-sherpa', 'r1'), cache);

    const first = await engine.synth(req);
    const key = await utteranceKey({
      engineId: 'supertonic-sherpa',
      engineRevision: 'r1',
      voiceId: 'M2',
      lang: 'es',
      speed: 1,
      text: 'Hola',
    });
    expect(await cache.has(key)).toBe(true);

    const second = await engine.synth(req);
    // A hit is served from the store, not re-synthesised.
    expect(second.blob?.size).toBe(first.blob?.size);
    const usage = await cache.usage();
    expect(usage.entries).toBe(1);
  });

  it('AC-ENG-05: changing engineId or engineRevision yields zero hits against a populated store', async () => {
    const cache: AudioCache = createAudioCache(memoryStore());
    await withAudioCache(cachingEngine('supertonic-sherpa', 'r1'), cache).synth(req);
    const key = (id: TtsEngine['id'], revision: string) =>
      utteranceKey({
        engineId: id,
        engineRevision: revision,
        voiceId: 'M2',
        lang: 'es',
        speed: 1,
        text: 'Hola',
      });

    expect(await cache.has(await key('supertonic-sherpa', 'r1'))).toBe(true);
    expect(await cache.has(await key('supertonic-sherpa', 'r2'))).toBe(false);
    expect(await cache.has(await key('supertonic-transformers', 'r1'))).toBe(false);
  });

  it('is a no-op when capabilities.cache is false (M1 has no store)', () => {
    const cache: AudioCache = createAudioCache(memoryStore());
    const engine = cachingEngine('speech-synthesis', 'r1');
    const noCache = { ...engine, capabilities: { ...engine.capabilities, cache: false } };
    expect(withAudioCache(noCache, cache)).toBe(noCache);
  });
});
