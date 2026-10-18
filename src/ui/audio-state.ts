/**
 * The audio-availability state machine (D4 §9).
 *
 * "G1 is a state machine, not a message." One derived state, recomputed whenever
 * engine capabilities change, `voiceschanged` fires, or `playAnyway` changes.
 * The app never sets `playAnyway` itself — only an explicit user action does.
 *
 * This module returns **message identities and parameters, never prose** (D4
 * §18.3). It used to hand back finished English sentences, which no translation
 * layer can reach, and which baked the language name into the sentence — but the
 * name is grammar, not a noun, and has to be inflected by the catalog that
 * renders it.
 */

import type { Lang } from '../domain/types.ts';

export type AudioStateName = 'voice-ok' | 'no-l2-voice' | 'play-anyway' | 'engine-absent';

export type AudioNoticeId = 'no-l2-voice' | 'engine-absent' | 'play-anyway';
export type AudioActionId = 'play-anyway';

export type AudioState = {
  name: AudioStateName;
  /** Whether an L2 utterance can be produced at all. */
  l2Available: boolean;
  l1Available: boolean;
  /** Preview controls are disabled with a reason when false. */
  canPreview: boolean;
  /** Which notice to render, and the language it names. Resolved by the catalog. */
  notice?: { id: AudioNoticeId; lang?: Lang };
  /** The actionable escape hatch, when one exists. */
  action?: AudioActionId;
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
      notice: { id: 'engine-absent' },
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
      notice: { id: 'play-anyway' },
    };
  }
  return {
    name: 'no-l2-voice',
    l2Available: false,
    l1Available: input.l1Voice !== null,
    canPreview: false,
    notice: { id: 'no-l2-voice', lang: input.l2 },
    action: 'play-anyway',
  };
}
