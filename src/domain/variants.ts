/**
 * Variant specs — the exhaustive walk's resolved variants (D2 §5.1, §5.3).
 *
 * Shared by the validator and `bake` so both compute the key set identically.
 */

import type {
  BeatId,
  BuiltAlternative,
  BuiltBeat,
  ChoiceKey,
  ChoiceSetId,
  Conversation,
  LineId,
  ValueKey,
  VarName,
  WalkStep,
} from './types.ts';
import { variantKey } from './variant-key.ts';
import { runWalk } from './walk.ts';

export type VariantSpec = {
  beatId: BeatId;
  alternativeId: LineId | ChoiceSetId;
  /** Present iff this variant is an option's response line. */
  optionKey?: ChoiceKey;
  variantKey: string;
  /** The assignment used for the key (for an option, its own `sets` applied). */
  assignment: Record<VarName, ValueKey>;
  slotNames: VarName[];
};

function alternativeOf(step: WalkStep, beat: BuiltBeat | undefined): BuiltAlternative | null {
  if (!beat || !step.alternativeId) return null;
  return beat.alternatives.find((a) => a.id === step.alternativeId) ?? null;
}

export function variantSpecsOf(c: Conversation): VariantSpec[] {
  const specs: VariantSpec[] = [];
  for (const step of runWalk(c, {}, 'exhaustive').steps) {
    if (step.status !== 'resolved') continue;
    const beat = c.beats[step.beatId];
    const alternative = alternativeOf(step, beat);
    if (!beat || !alternative) continue;

    if (beat.kind === 'choice') {
      const option = alternative.options?.find((o) => o.key === step.chosenKey);
      if (!option) continue;
      const assignment: Record<VarName, ValueKey> = { ...step.assignment, ...option.sets };
      specs.push({
        beatId: beat.id,
        alternativeId: alternative.id,
        optionKey: option.key,
        variantKey: variantKey(beat.id, option.key, option.slotNames, assignment),
        assignment,
        slotNames: option.slotNames,
      });
    } else {
      specs.push({
        beatId: beat.id,
        alternativeId: alternative.id,
        variantKey: variantKey(beat.id, alternative.id, alternative.slotNames, step.assignment),
        assignment: step.assignment,
        slotNames: alternative.slotNames,
      });
    }
  }
  return specs;
}
