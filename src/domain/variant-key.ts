/**
 * The canonical variant key (D2 §5.3, amended by A1).
 *
 *   [ beatId, parentId, ...slotNames.sort().map(n => `${n}=${assignment[n]}`) ].join('|')
 *
 * `parentId` is `Line.id` for a fixed-beat alternative and `Option.key` for an
 * option. It is required for every alternative: it is what makes the key
 * injective when an option's read scope is empty.
 *
 * `sort()` is the default lexicographic sort with NO comparator (UTF-16
 * code-unit order). Build and runtime must call the identical function, or every
 * lookup misses (AC-DOM-09).
 */

import type { BeatId, ChoiceKey, LineId, ValueKey, VarName, VariantKeyOf } from './types.ts';

export const variantKey: VariantKeyOf = (
  beatId: BeatId,
  parentId: LineId | ChoiceKey,
  slotNames: readonly VarName[],
  assignment: Record<VarName, ValueKey>,
): string => {
  const parts: string[] = [beatId, parentId];
  for (const name of [...slotNames].sort()) {
    // A read variable is guaranteed non-null on every reachable path (D2 §5.3
    // rule 4); the `null` fallback is defensive and unreachable by construction.
    parts.push(`${name}=${assignment[name] ?? 'null'}`);
  }
  return parts.join('|');
};
