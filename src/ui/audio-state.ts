/**
 * The audio-availability state machine (D4 §9).
 *
 * "G1 is a state machine, not a message." One derived state, recomputed whenever
 * engine capabilities change, `voiceschanged` fires, or `playAnyway` changes.
 * The app never sets `playAnyway` itself — only an explicit user action does.
 */

import type { Lang } from '../domain/types.ts';

export type AudioStateName = 'voice-ok' | 'no-l2-voice' | 'play-anyway' | 'engine-absent';

export type AudioState = {
  name: AudioStateName;
  /** Whether an L2 utterance can be produced at all. */
  l2Available: boolean;
  l1Available: boolean;
  /** Preview controls are disabled with a reason when false. */
  canPreview: boolean;
  /** Notice text, when a notice is shown. Names the language, not the vendor. */
  notice?: string;
  /** The actionable escape hatch, when one exists. */
  action?: string;
};

export type AudioStateInput = {
  hasApi: boolean;
  /** `resolveVoice(character, voice, l2)` — null when no voice can serve L2. */
  l2Voice: string | null;
  l1Voice: string | null;
  playAnyway: boolean;
  l2: Lang;
  engineInitFailed?: boolean;
};

export function audioState(input: AudioStateInput): AudioState {
  const absent = !input.hasApi || input.engineInitFailed === true;
  if (absent) {
    return {
      name: 'engine-absent',
      l2Available: false,
      l1Available: false,
      canPreview: false,
      notice: 'Audio is unavailable on this device. The transcript still works.',
    };
  }
  if (input.l2Voice !== null) {
    return {
      name: 'voice-ok',
      l2Available: true,
      l1Available: input.l1Voice !== null,
      canPreview: true,
    };
  }
  if (input.playAnyway) {
    return {
      name: 'play-anyway',
      l2Available: true,
      l1Available: input.l1Voice !== null,
      canPreview: true,
      notice: 'The spoken language is being played with a different voice.',
    };
  }
  return {
    name: 'no-l2-voice',
    l2Available: false,
    l1Available: input.l1Voice !== null,
    canPreview: false,
    notice: 'No Spanish voice is installed on this device.',
    action: 'Play anyway with the default voice',
  };
}
