import { describe, expect, it } from 'vitest';
import { m3Registry } from '../../src/engines/registry.browser.ts';
import {
  createSherpaEngine,
  describeChain,
  voiceStyleIndex,
} from '../../src/engines/tts/sherpa.ts';
import { createFakeRuntime, type SherpaRuntime } from '../../src/engines/tts/sherpa-runtime.ts';
import { createModelSource, fakeStorage, memoryStore } from '../../src/engines/models.ts';
import type { ModelSource } from '../../src/engines/ports.ts';

/** A `ModelSource` whose fetch never touches the network. */
function fakeModels(fail = false): ModelSource {
  return createModelSource({
    store: memoryStore(),
    storage: fakeStorage(),
    fetchFile: async () => {
      if (fail) throw new Error('offline');
      return new ArrayBuffer(16);
    },
    sizes: new Map(m3Registry.flatMap((e) => e.files.map((f) => [f.path, f.bytes] as const))),
  });
}

const entries = m3Registry;

describe('M3 sherpa adapter (D3 §6, AC-ENG-13/22)', () => {
  it('declares the M3 capabilities: prefetch, cache, duration, offline, identity', () => {
    const engine = createSherpaEngine({
      overrides: {},
      models: fakeModels(),
      runtime: createFakeRuntime(),
      entries,
    });
    expect(engine.capabilities).toEqual({
      prefetch: true,
      cache: true,
      duration: true,
      offline: true,
      preservesVoiceIdentityAcrossLangs: true,
    });
    expect(engine.id).toBe('supertonic-sherpa');
    expect(engine.revision).toContain('supertonic-int8-sherpa-v2@');
  });

  it('voices(lang) narrows a language-agnostic set of ten', async () => {
    const engine = createSherpaEngine({
      overrides: {},
      models: fakeModels(),
      runtime: createFakeRuntime(),
      entries,
    });
    const es = await engine.voices('es');
    expect(es.map((v) => v.handle)).toEqual([
      'M1',
      'M2',
      'M3',
      'M4',
      'M5',
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
    ]);
    // The same styles appear under every language it speaks (D3 §6.6).
    expect((await engine.voices('en')).length).toBe(10);
    // A language it cannot speak yields nothing.
    expect(await engine.voices('de')).toEqual([]);
  });

  it('AC-ENG-22: two characters sharing a VoiceId receive their own overrides', () => {
    const engine = createSherpaEngine({
      overrides: { ron: { es: 'F1' }, bobby: { es: 'M4' } },
      models: fakeModels(),
      runtime: createFakeRuntime(),
      entries,
    });
    expect(engine.resolveVoice('ron', 'M2', 'es')).toBe('F1');
    expect(engine.resolveVoice('bobby', 'M2', 'es')).toBe('M4');
    // No override: the authored voice is the handle (styles are language-agnostic).
    expect(engine.resolveVoice('ron', 'M2', 'en')).toBe('M2');
    // An unsupported language resolves to null (the G1 path).
    expect(engine.resolveVoice('ron', 'M2', 'de')).toBeNull();
  });

  it('synth returns a buffer utterance with a WAV blob and a real duration', async () => {
    const runtime = createFakeRuntime({ numSpeakers: 10, sampleRate: 44100 });
    const engine = createSherpaEngine({ overrides: {}, models: fakeModels(), runtime, entries });
    const utterance = await engine.synth({
      text: 'Buenos días, ¿qué tal?',
      characterId: 'ron',
      voiceId: 'M2',
      lang: 'es',
      speed: 1,
    });
    expect(utterance.kind).toBe('buffer');
    expect(utterance.durationMs).toBeGreaterThan(0);
    expect(utterance.blob).toBeInstanceOf(Blob);
    expect(utterance.blob?.type).toBe('audio/wav');
    expect(utterance.key).toMatch(/^sha256:/);
    // The style index maps the authored voice onto the sherpa speaker id.
    expect(runtime.calls).toEqual([
      { text: 'Buenos días, ¿qué tal?', sid: voiceStyleIndex('M2'), speed: 1 },
    ]);
  });

  it('AC-ENG-13: init failure names the registry entry and the attempted chain', async () => {
    const failing: SherpaRuntime = {
      init: async () => {
        throw new Error('no shader-f16');
      },
      generate: async () => ({ samples: new Float32Array(4), sampleRate: 44100 }),
      dispose: () => undefined,
    };
    const engine = createSherpaEngine({
      overrides: {},
      models: fakeModels(),
      runtime: failing,
      entries,
    });
    const entry = entries.find((e) => e.purpose === 'tts');
    await expect(engine.init()).rejects.toThrow(/supertonic-int8-sherpa-v2/);
    await expect(engine.init()).rejects.toThrow(/wasm\+int8/);
    expect(entry && describeChain(entry)).toBe('wasm+int8');
  });

  it('dispose() disposes the runtime exactly once', () => {
    const runtime = createFakeRuntime();
    const engine = createSherpaEngine({ overrides: {}, models: fakeModels(), runtime, entries });
    engine.dispose();
    engine.dispose();
    expect(runtime.disposed).toBe(true);
  });
});
