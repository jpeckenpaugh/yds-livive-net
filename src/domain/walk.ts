/**
 * The walk — one algorithm, three projections (D2 §5.1).
 *
 * `resolveTimeline`, `deriveVariables` and `reachableVariants` are all projections
 * of this code; there is no second implementation of the timeline to drift
 * (AC-DOM-14). The walk emits **one step for every beat along every live path**:
 * a `pending` step is followed by `unreached` steps, never by an absence.
 */

import type {
  BeatId,
  BuiltAlternative,
  BuiltBeat,
  ChoiceKey,
  Conversation,
  DeriveVariables,
  MatchChoiceSet,
  ReachableAssignments,
  ReachableVariants,
  ResolveOptions,
  ValueKey,
  VarName,
  Walk,
  WalkStep,
  When,
} from './types.ts';

export type Assignment = Record<VarName, ValueKey>;

export type WalkMode = 'session' | 'exhaustive';

export function whenMatches(when: When | undefined, assignment: Assignment): boolean {
  if (!when) return true;
  for (const [name, value] of Object.entries(when)) {
    if (assignment[name] !== value) return false;
  }
  return true;
}

/** The unique alternative of `beat` matching `assignment` (fallback last). */
export function matchAlternative(
  beat: BuiltBeat,
  assignment: Assignment,
): BuiltAlternative | undefined {
  return beat.alternatives.find((alternative) => whenMatches(alternative.when, assignment));
}

type Live = { assignment: Assignment; stopped: boolean };

export type WalkResult = {
  steps: WalkStep[];
  /** Live assignments after the final beat. Exhaustive: terminal assignments. */
  terminals: Assignment[];
};

export function runWalk(
  c: Conversation,
  choices: Record<BeatId, ChoiceKey>,
  mode: WalkMode,
  opts?: ResolveOptions,
): WalkResult {
  const steps: WalkStep[] = [];
  let live: Live[] = [{ assignment: {}, stopped: false }];

  for (const beatId of c.order) {
    const beat = c.beats[beatId];
    if (!beat) continue;
    const next: Live[] = [];

    for (const current of live) {
      if (current.stopped) {
        steps.push({ beatId, status: 'unreached', assignment: {} });
        next.push(current);
        continue;
      }

      const alternative = matchAlternative(beat, current.assignment);
      if (!alternative) {
        // Unreachable for a valid conversation; the source validator reports
        // E_NO_MATCH. The walk degrades to an unreached step rather than crash.
        steps.push({ beatId, status: 'unreached', assignment: {} });
        next.push({ assignment: current.assignment, stopped: true });
        continue;
      }

      if (beat.kind === 'choice') {
        const options = alternative.options ?? [];
        const recorded = choices[beatId];
        const chosen = recorded === undefined ? undefined : options.find((o) => o.key === recorded);

        if (mode === 'exhaustive') {
          for (const option of options) {
            steps.push({
              beatId,
              status: 'resolved',
              alternativeId: alternative.id,
              assignment: current.assignment,
              chosenKey: option.key,
            });
            next.push({ assignment: { ...current.assignment, ...option.sets }, stopped: false });
          }
          continue;
        }

        if (chosen) {
          steps.push({
            beatId,
            status: 'resolved',
            alternativeId: alternative.id,
            assignment: current.assignment,
            chosenKey: chosen.key,
          });
          next.push({ assignment: { ...current.assignment, ...chosen.sets }, stopped: false });
          continue;
        }

        if (opts?.autoPick) {
          const first = options[0];
          if (first) {
            steps.push({
              beatId,
              status: 'resolved',
              alternativeId: alternative.id,
              assignment: current.assignment,
              chosenKey: first.key,
              autoPicked: true,
            });
            next.push({ assignment: { ...current.assignment, ...first.sets }, stopped: false });
            continue;
          }
        }

        steps.push({
          beatId,
          status: 'pending',
          alternativeId: alternative.id,
          assignment: current.assignment,
        });
        next.push({ assignment: current.assignment, stopped: true });
        continue;
      }

      steps.push({
        beatId,
        status: 'resolved',
        alternativeId: alternative.id,
        assignment: current.assignment,
      });
      next.push({ assignment: current.assignment, stopped: false });
    }

    live = next;
  }

  return { steps, terminals: live.map((entry) => entry.assignment) };
}

/** One session, recorded choices (the app's mode; no autoPick unless asked). */
export const walk: Walk = (c, choices, opts) => runWalk(c, choices, 'session', opts).steps;

/** EXHAUSTIVE — every option taken at every choice beat (bake + validation). */
export const reachableVariants: ReachableVariants = (c) => runWalk(c, {}, 'exhaustive').steps;

/** The terminal assignments of the exhaustive walk. */
export const reachableAssignments: ReachableAssignments = (c) =>
  runWalk(c, {}, 'exhaustive').terminals;

export const deriveVariables: DeriveVariables = (c, s) =>
  runWalk(c, s.choices, 'session').terminals[0] ?? {};

export const matchChoiceSet: MatchChoiceSet = (c, beatId, assignment) => {
  const beat = c.beats[beatId];
  if (!beat || beat.kind !== 'choice') return null;
  const alternative = matchAlternative(beat, assignment);
  if (!alternative || !alternative.options) return null;
  return alternative;
};
