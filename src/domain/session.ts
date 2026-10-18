/**
 * Session and operations (D2 §10).
 *
 * `reduce` is pure and total. A rejected op returns the session **unchanged**: it
 * does not throw and does not log. Rejection is observable only through
 * `reduceChecked` in `validate.ts`, which shares this single implementation so
 * the two can never diverge (amendment C2, AC-DOM-21).
 */

import type {
  BeatId,
  ChoiceKey,
  Conversation,
  DiagnosticCode,
  InitialSession,
  Reduce,
  Session,
  SessionOp,
  VarName,
} from './types.ts';
import { matchChoiceSet, runWalk } from './walk.ts';

function indexOf(c: Conversation, beatId: BeatId): number {
  return c.order.indexOf(beatId);
}

/** The assignment implied by the choices already made, before `beatId`. */
function assignmentAt(
  c: Conversation,
  beatId: BeatId,
  choices: Record<BeatId, ChoiceKey>,
): Record<VarName, string> | null {
  const step = runWalk(c, choices, 'session').steps.find((s) => s.beatId === beatId);
  if (!step || step.status === 'unreached') return null;
  return step.assignment;
}

/** The first beat that still needs a choice under `choices`, or null. */
export function firstPendingBeat(
  c: Conversation,
  choices: Record<BeatId, ChoiceKey>,
): BeatId | null {
  const step = runWalk(c, choices, 'session').steps.find((s) => s.status === 'pending');
  return step ? step.beatId : null;
}

export const initialSession: InitialSession = (c) => {
  const first = c.order[0] ?? '';
  const last = c.order[c.order.length - 1] ?? '';
  return {
    cursor: first,
    revealed: firstPendingBeat(c, {}) ?? last,
    choices: {},
  };
};

export type AppliedOp = { session: Session; codes: DiagnosticCode[] };

export function applyOp(c: Conversation, s: Session, op: SessionOp): AppliedOp {
  switch (op.type) {
    case 'reset':
      return { session: initialSession(c), codes: [] };

    case 'rewind': {
      const i = indexOf(c, s.cursor);
      if (i <= 0) return { session: s, codes: ['E_REWIND_AT_START'] };
      const cursor = c.order[i - 1] ?? s.cursor;
      // `revealed` is deliberately unchanged: progress stays visible.
      return { session: { ...s, cursor }, codes: [] };
    }

    case 'advance': {
      const i = indexOf(c, s.cursor);
      if (i < 0 || i >= c.order.length - 1) {
        return { session: s, codes: ['E_ADVANCE_AT_END'] };
      }
      const step = runWalk(c, s.choices, 'session').steps.find((x) => x.beatId === s.cursor);
      if (step && step.status === 'pending') {
        return { session: s, codes: ['E_ADVANCE_UNRESOLVED'] };
      }
      const next = c.order[i + 1] ?? s.cursor;
      const revealedIndex = Math.max(indexOf(c, s.revealed), i + 1);
      const revealed = c.order[revealedIndex] ?? s.revealed;
      return { session: { ...s, cursor: next, revealed }, codes: [] };
    }

    case 'choose': {
      const assignment = assignmentAt(c, op.beatId, s.choices);
      if (!assignment) return { session: s, codes: ['E_CHOOSE_NOT_CHOICE_BEAT'] };
      const alternative = matchChoiceSet(c, op.beatId, assignment);
      if (!alternative) return { session: s, codes: ['E_CHOOSE_NOT_CHOICE_BEAT'] };
      if (!alternative.options?.some((option) => option.key === op.key)) {
        return { session: s, codes: ['E_CHOOSE_INVALID_KEY'] };
      }

      const choices: Record<BeatId, ChoiceKey> = { ...s.choices, [op.beatId]: op.key };

      // Clear every downstream choice that the new assignment invalidates — or
      // that sits after the first beat to become pending. Iterate to a fixed
      // point because removing one choice can change a later beat's matched set.
      let changed = true;
      while (changed) {
        changed = false;
        const steps = runWalk(c, choices, 'session').steps;
        for (const beatId of c.order) {
          if (indexOf(c, beatId) <= indexOf(c, op.beatId)) continue;
          const chosen = choices[beatId];
          if (chosen === undefined) continue;
          const step = steps.find((x) => x.beatId === beatId);
          const stillValid =
            step !== undefined && step.status === 'resolved' && step.chosenKey === chosen;
          if (!stillValid) {
            delete choices[beatId];
            changed = true;
          }
        }
      }

      // Clamp `cursor` and `revealed` to the first now-pending beat. If nothing
      // is pending the conversation is fully resolved and no clamp is needed.
      const pending = firstPendingBeat(c, choices);
      let cursor = s.cursor;
      let revealed = s.revealed;
      if (pending !== null) {
        const limit = indexOf(c, pending);
        if (indexOf(c, cursor) > limit) cursor = pending;
        if (indexOf(c, revealed) > limit) revealed = pending;
      }
      return { session: { cursor, revealed, choices }, codes: [] };
    }
  }
}

export const reduce: Reduce = (c, s, op) => applyOp(c, s, op).session;
