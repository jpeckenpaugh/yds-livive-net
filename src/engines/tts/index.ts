/**
 * The engine factory (D7 §4, D3 §5).
 *
 * `createTtsEngine` is the only engine constructor and the only reader of
 * `__TTS_ENGINE__`. The M2 swap is `TTS_ENGINE=supertonic-* npm run build` plus
 * one adapter and one registry entry — no component, domain module or store
 * changes (D7 §6).
 */

import type { CreateTtsEngine, EngineId } from '../ports.ts';
import { createSpeechSynthesisEngine } from './speech-synthesis.ts';

/** The build-selected engine. Read from `__TTS_ENGINE__` exactly once. */
export const selectedEngineId: EngineId = __TTS_ENGINE__;

export const createTtsEngine: CreateTtsEngine = (options) => {
  switch (options.engine) {
    case 'speech-synthesis':
      return createSpeechSynthesisEngine(options);
    default:
      // M1 ships no Supertonic adapter; selecting one at build time is an M3 act.
      throw new Error(`engine ${options.engine} is not available in M1`);
  }
};

export { createSpeechSynthesisEngine } from './speech-synthesis.ts';
export { withAudioCache } from './audio-cache.ts';
export { createPlaybackController } from './playback.ts';
export { utteranceKey, stableKey, preferredAlgorithm, fnv1a64Hex } from './stable-key.ts';
