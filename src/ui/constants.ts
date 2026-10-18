/**
 * All timing constants (D4 §6.3). D4 is their only home; D2 deliberately holds
 * none of them.
 */

/** Between the L2 and L1 utterances of one beat (PM Q8). */
export const GAP_L2_TO_L1_MS = 400;
/** After a beat's last utterance finishes, before an auto-advance. */
export const GAP_POST_BEAT_MS = 300;
/** After a chosen response line finishes, before advancing. */
export const GAP_AFTER_CHOICE_MS = 300;
/** The chosen line's animate-in; `0` under `prefers-reduced-motion`. */
export const ANIMATE_IN_MS = 180;
/** M2 only; a declared no-op in M1. */
export const PREFETCH_AHEAD_BEATS = 1;
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 1.5;
/** WCAG 2.2 SC 2.5.8. */
export const MIN_TARGET_PX = 24;
/** Focus restoration is synchronous; listed to say it is not animated. */
export const FOCUS_RESTORE_MS = 0;
