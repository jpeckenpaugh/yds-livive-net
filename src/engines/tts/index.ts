/**
 * The engine factory (D7 §4, D3 §5).
 *
 * `createTtsEngine` is the only engine constructor and the only reader of
 * `__TTS_ENGINE__`. The M3 swap is `TTS_ENGINE=supertonic-sherpa npm run build`
 * plus one adapter and one registry entry — no component, domain module or store
 * changes (D7 §6).
 *
 * The Supertonic adapter is **lazily imported** and the branch is chosen by the
 * build-time constant, so an M1 build (`__TTS_ENGINE__ === 'speech-synthesis'`)
 * contains no sherpa code, no worker, and no `sherpa` string at all (AC-ENG-10,
 * D5 §6.3). The dynamic import is in the dead arm of a statically-decidable
 * conditional, so it is removed by dead-code elimination, chunk included.
 */

import type {
  CreateTtsEngine,
  CreateTtsEngineOptions,
  EngineId,
  TtsCapabilities,
  TtsEngine,
} from '../ports.ts';
import { VOICE_IDS } from '../ports.ts';
import { registryEntry } from '../registry.browser.ts';
import { createSpeechSynthesisEngine } from './speech-synthesis.ts';

/** The build-selected engine. Read from `__TTS_ENGINE__` exactly once. */
export const selectedEngineId: EngineId = __TTS_ENGINE__;

/** Supertonic's declared capabilities (D3 §4.1, §6.5). */
const SHERPA_CAPABILITIES: TtsCapabilities = {
  prefetch: true,
  cache: true,
  duration: true,
  offline: true,
  preservesVoiceIdentityAcrossLangs: true,
};

/**
 * A lazy Supertonic engine: capabilities, revision and `resolveVoice` are
 * available synchronously (the UI reads capabilities before `init()`), while the
 * heavy adapter — worker, wasm, model bytes — loads on `init()`.
 */
function createLazySherpaEngine(options: CreateTtsEngineOptions): TtsEngine {
  const entry = registryEntry('tts');
  const revision = entry ? `${entry.id}@${entry.revision}` : 'supertonic-sherpa';
  let real: TtsEngine | null = null;
  let loading: Promise<TtsEngine> | null = null;

  const load = (): Promise<TtsEngine> => {
    if (!options.models) {
      return Promise.reject(new Error('supertonic-sherpa requires CreateTtsEngineOptions.models'));
    }
    loading ??= import('./sherpa.ts').then((module) =>
      module.createSherpaEngine({ overrides: options.overrides, models: options.models! }),
    );
    return loading;
  };

  return {
    id: 'supertonic-sherpa',
    revision,
    capabilities: SHERPA_CAPABILITIES,
    async init() {
      real = await load();
      await real.init();
    },
    async voices(lang) {
      return (await load()).voices(lang);
    },
    resolveVoice(characterId, voiceId, lang) {
      if (real) return real.resolveVoice(characterId, voiceId, lang);
      // Supertonic styles are language-agnostic, so the authored voice is the
      // handle; an unknown override falls back to it.
      const override = options.overrides[characterId]?.[lang];
      if (override && (VOICE_IDS as readonly string[]).includes(override)) return override;
      return voiceId;
    },
    async synth(req) {
      return (await load()).synth(req);
    },
    dispose() {
      real?.dispose();
    },
  };
}

const speechOnlyFactory: CreateTtsEngine = (options) => {
  if (options.engine !== 'speech-synthesis') {
    throw new Error(`engine ${options.engine} is not available in this build`);
  }
  return createSpeechSynthesisEngine(options);
};

const supertonicFactory: CreateTtsEngine = (options) => {
  if (options.engine === 'supertonic-sherpa') return createLazySherpaEngine(options);
  return speechOnlyFactory(options);
};

export const createTtsEngine: CreateTtsEngine =
  __TTS_ENGINE__ === 'speech-synthesis' ? speechOnlyFactory : supertonicFactory;

export { createSpeechSynthesisEngine } from './speech-synthesis.ts';
export { withAudioCache } from './audio-cache.ts';
export { createPlaybackController } from './playback.ts';
export { utteranceKey, stableKey, preferredAlgorithm, fnv1a64Hex } from './stable-key.ts';
