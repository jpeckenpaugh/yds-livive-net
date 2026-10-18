/**
 * Source → structure (D2 §4, §7.1).
 *
 * The single walk operates on the *shape* of a conversation — beats, alternatives,
 * options and frozen read scopes — and never reads `l1`/`l2`. So both the source
 * validator and the bake enumerator derive one `Conversation` skeleton from a
 * `ConversationSource` and run the identical walk over it (D2 §5.1, AC-DOM-14).
 *
 * `lines` and `gloss` are empty here: rendering fills them. `meta` carries the
 * canonical versions so the walk's consumer never has to fabricate them.
 */

import { readScopeOf } from './template.ts';
import {
  SCHEMA_VERSION,
  SEGMENTATION_VERSION,
  type BeatId,
  type BuiltAlternative,
  type BuiltBeat,
  type BuiltOption,
  type ChoiceSet,
  type Conversation,
  type ConversationSource,
  type Line,
  type SourceBeat,
  type VarName,
} from './types.ts';

function optionOf(option: ChoiceSet['options'][number]): BuiltOption {
  return {
    key: option.key,
    label: option.label,
    icon: option.icon,
    sets: option.sets,
    slotNames: readScopeOf(option.template),
  };
}

function unionSlots(options: readonly BuiltOption[]): VarName[] {
  const seen: VarName[] = [];
  for (const option of options) {
    for (const name of option.slotNames) if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

function alternativesOf(beat: SourceBeat): BuiltAlternative[] {
  if (beat.choiceSets) {
    return beat.choiceSets.map((set) => {
      const options = set.options.map(optionOf);
      return {
        id: set.id,
        when: set.when,
        slotNames: unionSlots(options),
        options,
      };
    });
  }
  const lines: Line[] = beat.line ?? [];
  return lines.map((line) => ({
    id: line.id,
    when: line.when,
    slotNames: readScopeOf(line.template),
  }));
}

export function structureOf(source: ConversationSource): Conversation {
  const order: BeatId[] = [];
  const beats: Record<BeatId, BuiltBeat> = {};
  source.beats.forEach((beat, index) => {
    order.push(beat.id);
    beats[beat.id] = {
      id: beat.id,
      index,
      speaker: beat.speaker,
      kind: beat.choiceSets ? 'choice' : 'line',
      hint: beat.hint,
      alternatives: alternativesOf(beat),
    };
  });
  return {
    id: source.id,
    title: source.title,
    l1: source.l1,
    l2: source.l2,
    characters: source.characters,
    order,
    beats,
    lines: {},
    gloss: {},
    meta: {
      schemaVersion: SCHEMA_VERSION,
      segmentationVersion: SEGMENTATION_VERSION,
      generatedFrom: `${source.id}.source.json`,
      sourceDigest: '',
      reviewPolicy: 'fixture',
      translator: { en2romance: null, romance2en: null },
    },
  };
}
