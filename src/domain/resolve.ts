/**
 * `resolveTimeline` (D2 §11) — a lookup over the walk's steps.
 *
 * It returns **every** beat, in order, with a status. It never invents a beat the
 * walk did not visit; an `unreached` step carries no content (AC-DOM-14). Ghosts
 * are derived from the matched set, never stored, and a ghost's line is resolved
 * with its own `sets` applied so it reads as what would actually have been said.
 */

import type {
  BuiltAlternative,
  BuiltBeat,
  BuiltOption,
  Conversation,
  ResolveTimeline,
  ResolvedBeat,
  ResolvedLine,
  ResolvedOption,
  VarName,
  WalkStep,
} from './types.ts';
import { variantKey } from './variant-key.ts';
import { runWalk } from './walk.ts';

type Assignment = Record<VarName, string>;

function lineOf(
  c: Conversation,
  beat: BuiltBeat,
  alternative: BuiltAlternative,
  parentId: string,
  slotNames: readonly VarName[],
  assignment: Assignment,
): ResolvedLine {
  const key = variantKey(beat.id, parentId, slotNames, assignment);
  const record = c.lines[key];
  if (!record) {
    // Unreachable by construction (D7 §9): E_VARIANT_MISSING catches it at build
    // time, and this is the runtime guard.
    throw new Error(`E_VARIANT_MISSING: no record for variant key ${key}`);
  }
  return {
    alternativeId: alternative.id,
    variantKey: key,
    l1: record.l1,
    l2: record.l2,
    hint: beat.hint,
  };
}

function optionOf(
  c: Conversation,
  beat: BuiltBeat,
  alternative: BuiltAlternative,
  option: BuiltOption,
  assignment: Assignment,
  status: ResolvedBeat['status'],
  chosenKey: string | undefined,
): ResolvedOption {
  const withSets: Assignment = { ...assignment, ...option.sets };
  return {
    key: option.key,
    label: option.label,
    line: lineOf(c, beat, alternative, option.key, option.slotNames, withSets),
    sets: option.sets,
    chosen: chosenKey === option.key,
    ghost: status === 'resolved' && chosenKey !== option.key,
    previewable: true,
  };
}

function resolveStep(c: Conversation, step: WalkStep): ResolvedBeat {
  const beat = c.beats[step.beatId];
  if (!beat) throw new Error(`E_SCHEMA: no beat ${step.beatId}`);

  const base: ResolvedBeat = {
    beatId: beat.id,
    index: beat.index,
    speaker: beat.speaker,
    kind: beat.kind,
    status: step.status,
    hint: beat.hint,
  };

  if (step.status === 'unreached') return base;

  const alternative = beat.alternatives.find((a) => a.id === step.alternativeId);
  if (!alternative) throw new Error(`E_SCHEMA: no alternative ${String(step.alternativeId)}`);

  if (beat.kind === 'line') {
    return {
      ...base,
      line: lineOf(c, beat, alternative, alternative.id, alternative.slotNames, step.assignment),
    };
  }

  const options = (alternative.options ?? []).map((option) =>
    optionOf(c, beat, alternative, option, step.assignment, step.status, step.chosenKey),
  );
  return {
    ...base,
    options,
    chosenKey: step.chosenKey,
    autoPicked: step.autoPicked,
  };
}

export const resolveTimeline: ResolveTimeline = (c, s, o) =>
  runWalk(c, s.choices, 'session', o).steps.map((step) => resolveStep(c, step));
