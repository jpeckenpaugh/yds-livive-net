import { afterEach, describe, expect, it } from 'vitest';
import { resolveTimeline } from '../../src/domain/resolve.ts';
import { initialSession, reduce } from '../../src/domain/session.ts';
import { matchChoiceSet, runWalk } from '../../src/domain/walk.ts';
import type { BeatId, ChoiceKey, Conversation } from '../../src/domain/types.ts';
import {
  estimateDurationMs,
  splitForSpeech,
  createSpeechSynthesisEngine,
} from '../../src/engines/tts/speech-synthesis.ts';
import { utteranceKey } from '../../src/engines/tts/stable-key.ts';
import { withAudioCache } from '../../src/engines/tts/audio-cache.ts';
import { Scheduler } from '../../src/ui/scheduler.ts';
import { DEFAULT_PREFS } from '../../src/ui/store.ts';
import { visibility } from '../../src/domain/visibility.ts';
import { MAX_UTTERANCE_MS } from '../../src/engines/ports.ts';
import { fixtureConversation } from '../helpers/sources.ts';
import { createFakeEngine } from '../helpers/fake-engine.ts';
import {
  installSpeechSynthesisMock,
  type SpeechSynthesisMock,
} from '../helpers/speech-synthesis-mock.ts';

const EN_VOICES = [
  { name: 'Samantha', lang: 'en-US', local: true },
  { name: 'Daniel', lang: 'en-GB', local: true },
];
const ES_VOICES = [{ name: 'Mónica', lang: 'es-ES', local: true }];

let mock: SpeechSynthesisMock | null = null;

function clearMock(): void {
  mock = null;
  delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  delete (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
}

function allSessions(c: Conversation): Array<Record<BeatId, ChoiceKey>> {
  const results: Array<Record<BeatId, ChoiceKey>> = [];
  const recurse = (choices: Record<BeatId, ChoiceKey>): void => {
    const pending = runWalk(c, choices, 'session').steps.find((step) => step.status === 'pending');
    if (!pending) {
      results.push(choices);
      return;
    }
    const alternative = matchChoiceSet(c, pending.beatId, pending.assignment);
    for (const option of alternative?.options ?? [])
      recurse({ ...choices, [pending.beatId]: option.key });
  };
  recurse({});
  return results;
}

afterEach(clearMock);

describe('M1 speechSynthesis adapter — the four R5 landmines (AC-ENG-08)', () => {
  it('C1/AC-ENG-02: capabilities are declared data matching D3 §4.1', () => {
    mock = installSpeechSynthesisMock({ voices: [...EN_VOICES, ...ES_VOICES] });
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    expect(engine.capabilities).toEqual({
      prefetch: false,
      cache: false,
      duration: false,
      offline: true,
      preservesVoiceIdentityAcrossLangs: false,
    });
  });

  it('C2: init resolves when the API is absent and voices() returns []', async () => {
    clearMock();
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    await expect(engine.init()).resolves.toBeUndefined();
    expect(await engine.voices('es')).toEqual([]);
    await expect(
      engine.synth({ text: 'Hola', characterId: 'ron', voiceId: 'M2', lang: 'es', speed: 1 }),
    ).rejects.toMatchObject({ kind: 'no-voice-for-language' });
  });

  it('C3: a late voiceschanged is visible without a reload', async () => {
    mock = installSpeechSynthesisMock({ voices: [], lateVoices: ES_VOICES });
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    expect(await engine.voices('es')).toEqual([]);
    await engine.init();
    mock.emitVoicesChanged();
    expect((await engine.voices('es')).length).toBe(1);
  });

  it('C4/C7: stop is idempotent, a stopped play resolves, and a second play cancels the first', async () => {
    mock = installSpeechSynthesisMock({ voices: [...EN_VOICES, ...ES_VOICES] });
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    const first = await engine.synth({
      text: 'Hola',
      characterId: 'ron',
      voiceId: 'M2',
      lang: 'es',
      speed: 1,
    });
    const playing = first.play();
    first.stop();
    first.stop(); // idempotent
    await expect(playing).resolves.toBeUndefined();

    const second = await engine.synth({
      text: 'Adiós',
      characterId: 'ron',
      voiceId: 'M2',
      lang: 'es',
      speed: 1,
    });
    await expect(second.play()).resolves.toBeUndefined();
    expect(mock.spoken).toContain('Adiós');
  });

  it('C5: a line past MAX_UTTERANCE_MS splits at sentence boundaries and behaves as one utterance', async () => {
    mock = installSpeechSynthesisMock({ voices: [...EN_VOICES, ...ES_VOICES] });
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    const long = `${'Hola mundo. '.repeat(40)}Fin.`;
    expect(estimateDurationMs(long)).toBeGreaterThan(MAX_UTTERANCE_MS);
    const parts = splitForSpeech(long, 'es');
    expect(parts.length).toBeGreaterThan(1);
    const utterance = await engine.synth({
      text: long,
      characterId: 'ron',
      voiceId: 'M2',
      lang: 'es',
      speed: 1,
    });
    await expect(utterance.play()).resolves.toBeUndefined();
    utterance.stop();
    expect(mock.spoken.join(' ')).toContain('Hola mundo.');
  });

  it('C6: native utterances report no duration and no cache/prefetch', async () => {
    mock = installSpeechSynthesisMock({ voices: [...EN_VOICES, ...ES_VOICES] });
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    const utterance = await engine.synth({
      text: 'Hola',
      characterId: 'ron',
      voiceId: 'M2',
      lang: 'es',
      speed: 1,
    });
    expect(utterance.kind).toBe('native');
    expect(utterance.durationMs).toBeNull();
    expect(engine.capabilities.cache).toBe(false);
    expect(engine.capabilities.prefetch).toBe(false);
  });

  it('C8/AC-ENG-07: no L2 voice means resolveVoice is null and synth rejects; L1 still works', async () => {
    mock = installSpeechSynthesisMock({ voices: EN_VOICES });
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    expect(engine.resolveVoice('ron', 'M2', 'es')).toBeNull();
    expect(engine.resolveVoice('ron', 'M2', 'en')).not.toBeNull();
    await expect(
      engine.synth({ text: 'Hola', characterId: 'ron', voiceId: 'M2', lang: 'es', speed: 1 }),
    ).rejects.toMatchObject({ kind: 'no-voice-for-language' });
  });

  it('AC-ENG-22: two characters sharing a VoiceId receive their own overrides', () => {
    mock = installSpeechSynthesisMock({ voices: [...EN_VOICES, ...ES_VOICES] });
    const engine = createSpeechSynthesisEngine({
      overrides: { ron: { es: 'Mónica' }, bobby: { es: 'Samantha' } },
    });
    expect(engine.resolveVoice('ron', 'M2', 'es')).toBe('Mónica');
    expect(engine.resolveVoice('bobby', 'M2', 'es')).toBe('Samantha');
  });

  it('AC-ENG-22: a stale override falls through to the heuristic rather than failing', () => {
    mock = installSpeechSynthesisMock({ voices: ES_VOICES });
    const engine = createSpeechSynthesisEngine({ overrides: { ron: { es: 'VoiceThatIsGone' } } });
    expect(engine.resolveVoice('ron', 'M2', 'es')).toBe('Mónica');
  });
});

describe('conformance suite (AC-ENG-09)', () => {
  it('C1/C11: the fake engine declares the same capabilities and passes the core assertions', async () => {
    const engine = createFakeEngine();
    await engine.init();
    expect((await engine.voices('es')).length).toBe(1);
    expect(engine.resolveVoice('ron', 'M2', 'es')).toBe('es-M2');
    const utterance = await engine.synth({
      text: 'Hola',
      characterId: 'ron',
      voiceId: 'M2',
      lang: 'es',
      speed: 1,
    });
    expect(utterance.kind).toBe('native');
    expect(engine.capabilities).toEqual({
      prefetch: false,
      cache: false,
      duration: false,
      offline: true,
      preservesVoiceIdentityAcrossLangs: false,
    });
  });

  it('C10/AC-ENG-03: identical tuples are interchangeable and different tuples never collide', async () => {
    const base = {
      engineId: 'speech-synthesis' as const,
      engineRevision: 'r1',
      voiceId: 'M2' as const,
      lang: 'es',
      speed: 1,
      text: 'Hola',
    };
    const a = await utteranceKey(base);
    const b = await utteranceKey({ ...base });
    expect(a).toBe(b);
    for (const changed of [
      { ...base, engineRevision: 'r2' },
      { ...base, voiceId: 'M4' as const },
      { ...base, lang: 'en' },
      { ...base, speed: 1.5 },
      { ...base, text: 'Adiós' },
    ]) {
      expect(await utteranceKey(changed)).not.toBe(a);
    }
    expect(a).toMatch(/^sha256:/);
  });

  it('AC-ENG-05: cache keys include engineId and engineRevision, and the decorator is a no-op without cache', async () => {
    const base = {
      engineRevision: 'r1',
      voiceId: 'M2' as const,
      lang: 'es',
      speed: 1,
      text: 'Hola',
    };
    const a = await utteranceKey({ ...base, engineId: 'speech-synthesis' });
    const b = await utteranceKey({ ...base, engineId: 'supertonic-transformers' });
    const c = await utteranceKey({ ...base, engineId: 'speech-synthesis', engineRevision: 'r2' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);

    const engine = createFakeEngine();
    const cache = {
      has: async () => false,
      get: async () => null,
      put: async () => undefined,
      clear: async () => undefined,
      usage: async () => ({ bytes: 0, entries: 0 }),
    };
    // `capabilities.cache === false`, so the decorator returns the engine unchanged.
    expect(withAudioCache(engine, cache)).toBe(engine);
  });

  it('C9/AC-ENG-04: no template reaches an engine across every variant × reachable session', () => {
    const c = fixtureConversation();
    const sessions = allSessions(c);
    expect(sessions.length).toBe(16);
    for (const choices of sessions) {
      const beats = resolveTimeline(c, { ...initialSession(c), choices }, { autoPick: true });
      for (const beat of beats) {
        const strings = [beat.hint, beat.line?.l1, beat.line?.l2];
        for (const option of beat.options ?? []) {
          strings.push(option.label.l1, option.label.l2, option.line.l1, option.line.l2);
        }
        for (const value of strings) {
          if (value === undefined) continue;
          expect(value).not.toMatch(/[{}$]/);
        }
      }
    }
  });
});

describe('session helpers used above', () => {
  it('reduce is used to build a session', () => {
    const c = fixtureConversation();
    const session = reduce(c, initialSession(c), { type: 'choose', beatId: 'b2', key: 'dinner' });
    expect(session.choices).toEqual({ b2: 'dinner' });
  });
});

describe('G1 escape hatch (AC-ENG-07)', () => {
  it('with playAnyway on, an L2 line with no L2 voice is spoken by the default voice', async () => {
    const engine = createFakeEngine({}, { voices: ['en'] });
    const c = fixtureConversation();
    const beat = resolveTimeline(c, initialSession(c)).find(
      (candidate) => candidate.beatId === 'b1',
    );
    if (!beat?.line) throw new Error('no b1 line');
    const scheduler = new Scheduler({
      engine,
      conversation: c,
      getPrefs: () => ({ ...DEFAULT_PREFS, playAnyway: true }),
    });
    const outcome = await scheduler.playBeat(beat, visibility({ ...DEFAULT_PREFS, hear: 'l2' }));
    expect(outcome).toBe('finished');
    expect(engine.spoken).toEqual([beat.line.l2]);
  });

  it('with playAnyway off, the same line is unavailable', async () => {
    const engine = createFakeEngine({}, { voices: ['en'] });
    const c = fixtureConversation();
    const beat = resolveTimeline(c, initialSession(c)).find(
      (candidate) => candidate.beatId === 'b1',
    );
    if (!beat?.line) throw new Error('no b1 line');
    const scheduler = new Scheduler({ engine, conversation: c, getPrefs: () => DEFAULT_PREFS });
    const outcome = await scheduler.playBeat(beat, visibility({ ...DEFAULT_PREFS, hear: 'l2' }));
    expect(outcome).toBe('unavailable');
    expect(engine.spoken).toEqual([]);
  });
});
