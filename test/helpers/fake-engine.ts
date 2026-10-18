/**
 * A deterministic in-process fake engine (D3 §4.6, AC-ENG-09).
 *
 * The conformance suite runs against three targets: this fake, the mocked
 * `speechSynthesis`, and (unchanged at M2) the Supertonic adapter. Capabilities
 * are declared here too, so a test can flip one and assert the gating.
 */

import type { TtsEngine } from '../../src/engines/ports.ts';
import { utteranceKey } from '../../src/engines/tts/stable-key.ts';

export type FakeEngine = TtsEngine & { readonly spoken: string[] };

export function createFakeEngine(
  overrides: Partial<TtsEngine['capabilities']> = {},
  options: { voices?: string[]; revision?: string } = {},
): FakeEngine {
  const spoken: string[] = [];
  const languages = options.voices ?? ['en', 'es'];
  const revision = options.revision ?? 'fake-1';
  const resolveVoice = (_characterId: string, voiceId: string, lang: string): string | null =>
    languages.includes(lang) ? `${lang}-${voiceId}` : null;
  return {
    id: 'speech-synthesis',
    revision,
    spoken,
    capabilities: {
      prefetch: false,
      cache: false,
      duration: false,
      offline: true,
      preservesVoiceIdentityAcrossLangs: false,
      ...overrides,
    },
    async init() {
      return undefined;
    },
    async voices(lang) {
      return languages.includes(lang)
        ? [{ handle: `${lang}-fake`, lang, name: `${lang}-fake`, local: true }]
        : [];
    },
    resolveVoice,
    async synth(req) {
      const handle = resolveVoice(req.characterId, req.voiceId, req.lang);
      if (handle === null) {
        const error = new Error(`no voice for ${req.lang}`) as Error & { kind: string };
        error.kind = 'no-voice-for-language';
        throw error;
      }
      spoken.push(req.text);
      return {
        kind: 'native',
        key: await utteranceKey({
          engineId: 'speech-synthesis',
          engineRevision: revision,
          voiceId: req.voiceId,
          lang: req.lang,
          speed: req.speed,
          text: req.text,
        }),
        durationMs: null,
        async play() {
          return undefined;
        },
        stop() {
          return undefined;
        },
      };
    },
    dispose() {
      return undefined;
    },
  };
}
