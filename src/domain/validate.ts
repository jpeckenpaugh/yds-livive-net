/**
 * Validation, and the dev-only assertion wrapper (D2 §10, §14).
 *
 * This module is **excluded from the app scan root** (`tools/scan-excludes.json`):
 * nothing shipped imports it, so the six dev session codes are triggerable in
 * tests without the wrapper ever reaching the production bundle. `reduceChecked`
 * shares `applyOp` with `reduce` (in `session.ts`) so the two cannot diverge.
 */

import { diagnostic } from './diagnostics.ts';
import { segmentL2 } from './segment.ts';
import { applyOp } from './session.ts';
import { structureOf } from './structure.ts';
import { parseTemplate } from './template.ts';
import { runWalk, whenMatches } from './walk.ts';
import { variantSpecsOf } from './variants.ts';
import {
  MAX_ASSIGNMENTS,
  MAX_OPTIONS,
  MAX_VARIANTS_PER_BEAT,
  MIN_OPTIONS,
  SCHEMA_VERSION,
  type ConversationSource,
  type Diagnostic,
  type DiagnosticCode,
  type GlossEntry,
  type IsEdited,
  type ReduceChecked,
  type ReviewPolicy,
  type ValidateConversation,
  type ValidateConversationSource,
  type ValidateSession,
  type ValueKey,
  type VariantRecord,
  type VarName,
} from './types.ts';

type Assignment = Record<VarName, ValueKey>;
type Add = (
  code: DiagnosticCode,
  path: string,
  message: string,
  severity?: Diagnostic['severity'],
) => void;

function makeAdd(out: Diagnostic[]): Add {
  return (code, path, message, severity) => {
    out.push(severity ? { code, severity, path, message } : diagnostic(code, path, message));
  };
}

const RESERVED = /[{}$]/;

function reserved(text: string): boolean {
  return RESERVED.test(text);
}

/* ==========================================================================
 * Source validation
 * ========================================================================*/

export const validateConversationSource: ValidateConversationSource = (source) => {
  const out: Diagnostic[] = [];
  const add = makeAdd(out);

  if (!source || typeof source !== 'object') {
    add('E_SCHEMA', '', 'source is not an object');
    return out;
  }
  if (typeof source.id !== 'string' || source.id === '') {
    add('E_SCHEMA', 'id', 'id must be a non-empty string');
  }
  if (typeof source.title !== 'string') add('E_SCHEMA', 'title', 'title must be a string');
  if (typeof source.l1 !== 'string') add('E_SCHEMA', 'l1', 'l1 must be a string');
  if (typeof source.l2 !== 'string') add('E_SCHEMA', 'l2', 'l2 must be a string');
  if (!source.characters || typeof source.characters !== 'object') {
    add('E_SCHEMA', 'characters', 'characters must be an object');
  }
  if (!Array.isArray(source.beats)) {
    add('E_SCHEMA', 'beats', 'beats must be an array');
    return out;
  }
  if (!Array.isArray(source.variables)) add('E_SCHEMA', 'variables', 'variables must be an array');

  const variables = Array.isArray(source.variables) ? source.variables : [];
  const varByName = new Map<VarName, Set<ValueKey>>();
  variables.forEach((variable, index) => {
    const path = `variables[${index}]`;
    if (varByName.has(variable.name)) {
      add('E_DUPLICATE_VAR', `${path}.name`, `duplicate variable ${variable.name}`);
      return;
    }
    const values = new Set<ValueKey>();
    (variable.values ?? []).forEach((value, valueIndex) => {
      if (values.has(value.key)) {
        add(
          'E_DUPLICATE_VALUE_KEY',
          `${path}.values[${valueIndex}].key`,
          `duplicate value ${value.key}`,
        );
      }
      values.add(value.key);
    });
    varByName.set(variable.name, values);
  });

  const beatIds = new Set<string>();
  const lineIds = new Set<string>();
  const choiceSetIds = new Set<string>();
  const writtenVars = new Set<VarName>();
  const readVars = new Set<VarName>();
  const optionWrittenSets: Array<{ path: string; keys: string[] }> = [];
  const templateReadVars: VarName[] = [];

  const checkWhen = (when: Record<string, ValueKey> | undefined, path: string): void => {
    if (when === undefined) return;
    if (Object.keys(when).length === 0) {
      add('E_EMPTY_WHEN', path, 'when must not be empty; omit it for a fallback');
      return;
    }
    for (const [name, value] of Object.entries(when)) {
      readVars.add(name);
      if (!varByName.has(name)) {
        add('E_UNKNOWN_VAR', `${path}.${name}`, `unknown variable ${name}`);
      } else if (!varByName.get(name)?.has(value)) {
        add('E_UNKNOWN_VALUE', `${path}.${name}`, `unknown value ${value} for ${name}`);
      }
    }
  };

  const checkSets = (sets: Record<string, unknown>, path: string): void => {
    const keys: string[] = [];
    for (const [name, value] of Object.entries(sets)) {
      if (value === null) {
        add('E_NULL_WRITE', `${path}.${name}`, 'a variable is never written to null');
        continue;
      }
      keys.push(name);
      writtenVars.add(name);
      if (!varByName.has(name)) {
        add('E_UNKNOWN_VAR', `${path}.${name}`, `unknown variable ${name}`);
      } else if (typeof value === 'string' && !varByName.get(name)?.has(value)) {
        add('E_UNKNOWN_VALUE', `${path}.${name}`, `unknown value ${String(value)} for ${name}`);
      }
    }
    if (keys.length > 0) optionWrittenSets.push({ path, keys });
  };

  const checkTemplate = (
    template: string,
    path: string,
    kind: 'template' | 'label' | 'hint' | 'icon',
  ): void => {
    const parsed = parseTemplate(template);
    if (kind === 'label' || kind === 'icon') {
      // Label-class: literal, never a slot (D2 §4.3).
      if (parsed.slots.length > 0 || parsed.reserved) {
        add('E_LABEL_SLOT', path, 'a label or icon is literal; slots are forbidden');
      }
      return;
    }
    if (kind === 'hint') {
      if (parsed.slots.length > 0 || parsed.reserved) {
        add('E_HINT_SLOT', path, 'a hint is literal; slots are forbidden');
      }
      return;
    }
    if (parsed.reserved) {
      add('E_TEMPLATE_RESERVED_CHAR', path, 'reserved character in a template');
    }
    for (const name of parsed.slots) {
      if (!varByName.has(name)) {
        add('E_UNKNOWN_SLOT', path, `unknown slot {${name}}`);
      } else {
        readVars.add(name);
        templateReadVars.push(name);
      }
    }
  };

  source.beats.forEach((beat, beatIndex) => {
    const beatPath = `beats[${beatIndex}]`;
    if (beatIds.has(beat.id))
      add('E_DUPLICATE_BEAT_ID', `${beatPath}.id`, `duplicate beat ${beat.id}`);
    beatIds.add(beat.id);

    const hasLine = Array.isArray(beat.line) && beat.line.length > 0;
    const hasChoice = Array.isArray(beat.choiceSets) && beat.choiceSets.length > 0;
    if (hasLine === hasChoice) {
      add('E_BEAT_ARITY', beatPath, 'exactly one of line / choiceSets is required');
    }
    if (typeof beat.hint === 'string') checkTemplate(beat.hint, `${beatPath}.hint`, 'hint');

    const fallbacks = (beat.line ?? []).filter((line) => line.when === undefined);
    if (fallbacks.length > 1)
      add('E_MULTIPLE_FALLBACK', beatPath, 'more than one when-less alternative');
    const lines = beat.line ?? [];
    const lastLine = lines[lines.length - 1];
    lines.forEach((line, lineIndex) => {
      if (line.when === undefined && lineIndex !== lines.length - 1 && lastLine) {
        add(
          'E_FALLBACK_NOT_LAST',
          `${beatPath}.line[${lineIndex}]`,
          'the when-less alternative must be last',
        );
      }
    });

    (beat.line ?? []).forEach((line, lineIndex) => {
      const path = `${beatPath}.line[${lineIndex}]`;
      if (lineIds.has(line.id))
        add('E_DUPLICATE_LINE_ID', `${path}.id`, `duplicate line ${line.id}`);
      lineIds.add(line.id);
      checkWhen(line.when, `${path}.when`);
      checkTemplate(line.template, `${path}.template`, 'template');
    });

    const choiceKeys = new Set<string>();
    (beat.choiceSets ?? []).forEach((set, setIndex) => {
      const setPath = `${beatPath}.choiceSets[${setIndex}]`;
      if (choiceSetIds.has(set.id)) {
        add('E_DUPLICATE_CHOICE_SET_ID', `${setPath}.id`, `duplicate choice set ${set.id}`);
      }
      choiceSetIds.add(set.id);
      checkWhen(set.when, `${setPath}.when`);

      const options = set.options ?? [];
      if (options.length < MIN_OPTIONS)
        add('E_CHOICE_OPTIONS_MIN', setPath, `fewer than ${MIN_OPTIONS} options`);
      if (options.length > MAX_OPTIONS)
        add('E_CHOICE_OPTIONS_MAX', setPath, `more than ${MAX_OPTIONS} options`);

      options.forEach((option, optionIndex) => {
        const path = `${setPath}.options[${optionIndex}]`;
        if (choiceKeys.has(option.key)) {
          add('E_DUPLICATE_CHOICE_KEY', `${path}.key`, `duplicate choice key ${option.key}`);
        }
        choiceKeys.add(option.key);
        if (
          !option.label ||
          typeof option.label.l1 !== 'string' ||
          typeof option.label.l2 !== 'string'
        ) {
          add('E_LABEL_MISSING_LANG', `${path}.label`, 'a label needs both l1 and l2');
        } else {
          checkTemplate(option.label.l1, `${path}.label.l1`, 'label');
          checkTemplate(option.label.l2, `${path}.label.l2`, 'label');
        }
        if (typeof option.icon === 'string') checkTemplate(option.icon, `${path}.icon`, 'icon');
        checkTemplate(option.template, `${path}.template`, 'template');
        checkSets(option.sets, `${path}.sets`);
      });
    });
  });

  // E_MISSING_SURFACE_FORM — a template-read variable needs an l1 on every value.
  for (const name of new Set(templateReadVars)) {
    const variable = variables.find((v) => v.name === name);
    if (!variable) continue;
    variable.values.forEach((value, index) => {
      if (value.l1 === undefined) {
        add(
          'E_MISSING_SURFACE_FORM',
          `variables.${name}.values[${index}]`,
          `${name}=${value.key} is read by a template but has no l1 surface form`,
        );
      }
    });
  }

  // E_DEAD_VARIABLE — every variable is written and read.
  for (const [name] of varByName) {
    if (!writtenVars.has(name) || !readVars.has(name)) {
      add(
        'E_DEAD_VARIABLE',
        `variables.${name}`,
        `${name} is never ${writtenVars.has(name) ? 'read' : 'written'}`,
      );
    }
  }

  // E_BOUND_PAIR_* — co-write groups.
  const boundPairs = new Set<string>();
  for (const option of optionWrittenSets) {
    for (let i = 0; i < option.keys.length; i += 1) {
      for (let j = i + 1; j < option.keys.length; j += 1) {
        const pair = [option.keys[i] ?? '', option.keys[j] ?? ''].sort().join('\u0000');
        boundPairs.add(pair);
      }
    }
  }
  for (const option of optionWrittenSets) {
    const present = new Set(option.keys);
    for (const pair of boundPairs) {
      const [a, b] = pair.split('\u0000');
      if (!a || !b) continue;
      if (present.has(a) !== present.has(b)) {
        add('E_BOUND_PAIR_SLOPPY', option.path, `${a} and ${b} must be written together`);
      }
    }
  }
  // Connected components of the bound-pair graph.
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const pair of boundPairs) {
    const [a, b] = pair.split('\u0000');
    if (!a || !b || seen.has(a)) continue;
    const group = new Set<string>([a, b]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const other of boundPairs) {
        const [x, y] = other.split('\u0000');
        if (!x || !y) continue;
        if (group.has(x) && !group.has(y)) {
          group.add(y);
          grew = true;
        } else if (group.has(y) && !group.has(x)) {
          group.add(x);
          grew = true;
        }
      }
    }
    for (const member of group) seen.add(member);
    groups.push([...group].sort());
  }
  for (const group of groups) {
    const tuples = new Map<string, string>();
    for (const option of optionWrittenSets) {
      const present = new Set(option.keys);
      if (!group.every((name) => present.has(name))) continue;
      const tuple = group
        .map((name) => `${name}=${String(readSetValue(source, option.path, name))}`)
        .join(',');
      const existing = tuples.get(tuple);
      if (existing && existing !== option.path) {
        add('E_BOUND_PAIR_AMBIGUOUS', option.path, `the tuple ${tuple} is written by two options`);
      } else {
        tuples.set(tuple, option.path);
      }
    }
  }

  // Walk-based checks.
  const structure = structureOf(source);
  const steps = runWalk(structure, {}, 'exhaustive').steps;
  const assignmentsByBeat = new Map<string, Assignment[]>();
  const noMatchBeats = new Set<string>();
  for (const step of steps) {
    if (step.status === 'unreached') {
      // Exhaustive mode never goes `pending`, so an unreached step means no
      // alternative matched (or a beat downstream of one).
      noMatchBeats.add(step.beatId);
      continue;
    }
    const list = assignmentsByBeat.get(step.beatId) ?? [];
    list.push(step.assignment);
    assignmentsByBeat.set(step.beatId, list);
  }

  for (const beatId of structure.order) {
    const beat = structure.beats[beatId];
    if (!beat) continue;
    const assignments = assignmentsByBeat.get(beatId) ?? [];
    if (noMatchBeats.has(beatId)) {
      add('E_NO_MATCH', `beats.${beatId}`, 'no alternative matches a reachable assignment');
    }

    const matched = new Map<string, number>();
    for (const assignment of assignments) {
      const matches = beat.alternatives.filter((a) => whenMatches(a.when, assignment));
      if (matches.length === 0)
        add('E_NO_MATCH', `beats.${beatId}`, 'no alternative matches a reachable assignment');
      if (matches.length > 1)
        add('E_AMBIGUOUS_MATCH', `beats.${beatId}`, 'two or more alternatives match');
      for (const alternative of matches) {
        matched.set(alternative.id, (matched.get(alternative.id) ?? 0) + 1);
        // E_READ_UNSET
        if (beat.kind === 'line') {
          for (const name of alternative.slotNames) {
            if (assignment[name] === undefined) {
              add(
                'E_READ_UNSET',
                `beats.${beatId}.${alternative.id}`,
                `${name} is read before it is written`,
              );
            }
          }
        } else {
          for (const option of alternative.options ?? []) {
            const withSets: Assignment = { ...assignment, ...option.sets };
            for (const name of option.slotNames) {
              if (withSets[name] === undefined) {
                add(
                  'E_READ_UNSET',
                  `beats.${beatId}.${option.key}`,
                  `${name} is read before it is written`,
                );
              }
            }
          }
        }
      }
    }
    for (const alternative of beat.alternatives) {
      if (!matched.has(alternative.id)) {
        add(
          'E_DEAD_ALTERNATIVE',
          `beats.${beatId}.${alternative.id}`,
          'matches no reachable assignment',
        );
      }
    }
  }

  // Enumeration limits.
  const specs = variantSpecsOf(structure);
  const variantsPerBeat = new Map<string, Set<string>>();
  for (const spec of specs) {
    const set = variantsPerBeat.get(spec.beatId) ?? new Set<string>();
    set.add(spec.variantKey);
    variantsPerBeat.set(spec.beatId, set);
  }
  for (const [beatId, set] of variantsPerBeat) {
    if (set.size > MAX_VARIANTS_PER_BEAT) {
      add(
        'E_ENUM_LIMIT_VARIANTS',
        `beats.${beatId}`,
        `${set.size} variants exceeds ${MAX_VARIANTS_PER_BEAT}`,
      );
    }
  }
  const terminals = runWalk(structure, {}, 'exhaustive').terminals;
  if (terminals.length > MAX_ASSIGNMENTS) {
    add(
      'E_ENUM_LIMIT_ASSIGNMENTS',
      '',
      `${terminals.length} terminal assignments exceeds ${MAX_ASSIGNMENTS}`,
    );
  }

  return out;
};

/** Reads a written value back out of a source path like `beats[2].choiceSets[0].options[1].sets`. */
function readSetValue(source: ConversationSource, path: string, name: string): unknown {
  const match = /^beats\[(\d+)\]\.choiceSets\[(\d+)\]\.options\[(\d+)\]\.sets$/.exec(path);
  if (!match) return undefined;
  const beat = source.beats[Number(match[1])];
  const set = beat?.choiceSets?.[Number(match[2])];
  const option = set?.options[Number(match[3])];
  return option?.sets?.[name];
}

/* ==========================================================================
 * Generated-artifact validation
 * ========================================================================*/

function checkRecordProvenance(
  record: VariantRecord,
  policy: ReviewPolicy,
  add: Add,
  path: string,
): void {
  if (record.reviewedBy === null) {
    add(
      'E_UNREVIEWED',
      path,
      policy === 'fixture' ? 'fixture record is unreviewed' : 'reviewedBy is null',
      policy === 'fixture' ? 'warn' : undefined,
    );
  } else if (record.reviewedBy === 'owner' && policy === 'fixture') {
    add('E_UNREVIEWED', path, 'a fixture record may not claim reviewedBy: owner');
  }
  if (record.l2 !== record.mt && record.reviewedBy !== 'owner') {
    add(
      'E_EDITED_NOT_OWNER',
      path,
      'l2 differs from mt without reviewedBy: owner',
      policy === 'fixture' ? 'warn' : undefined,
    );
  }
}

function checkGlossProvenance(
  entry: GlossEntry,
  policy: ReviewPolicy,
  add: Add,
  path: string,
): void {
  if (entry.reviewedBy === null) {
    add(
      'E_UNREVIEWED',
      path,
      'gloss reviewedBy is null',
      policy === 'fixture' ? 'warn' : undefined,
    );
  } else if (entry.reviewedBy === 'owner' && policy === 'fixture') {
    add('E_UNREVIEWED', path, 'a fixture gloss may not claim reviewedBy: owner');
  }
  if (entry.origin === 'mt' && entry.l1 !== entry.mt) {
    add('E_GLOSS_EDITED_NOT_OWNER', path, 'origin mt but l1 differs from mt');
  }
}

export const validateConversation: ValidateConversation = (c) => {
  const out: Diagnostic[] = [];
  const add = makeAdd(out);
  const policy = c.meta.reviewPolicy;

  if (c.meta.schemaVersion !== SCHEMA_VERSION) {
    add('E_SCHEMA_VERSION', 'meta.schemaVersion', `expected ${SCHEMA_VERSION}`);
  }

  // Collisions, missing and orphaned variant records.
  const byKey = new Map<string, string>();
  for (const spec of variantSpecsOf(c)) {
    const signature = `${spec.alternativeId}\u0000${spec.optionKey ?? ''}\u0000${[...spec.slotNames]
      .sort()
      .map((name) => `${name}=${spec.assignment[name] ?? ''}`)
      .join(',')}`;
    const existing = byKey.get(spec.variantKey);
    if (existing !== undefined && existing !== signature) {
      add(
        'E_VARIANT_KEY_COLLISION',
        `lines.${spec.variantKey}`,
        'two variant specs produced the same key',
      );
    } else {
      byKey.set(spec.variantKey, signature);
    }
  }
  const expected = new Set(byKey.keys());
  for (const key of expected) {
    if (!(key in c.lines))
      add('E_VARIANT_MISSING', `lines.${key}`, 'reachable variant has no record');
  }
  for (const key of Object.keys(c.lines)) {
    if (!expected.has(key)) add('E_ORPHAN_VARIANT', `lines.${key}`, 'record is not reachable');
  }

  const metaRev = c.meta.translator.en2romance;
  for (const [key, record] of Object.entries(c.lines)) {
    const path = `lines.${key}`;
    if (reserved(record.l1) || reserved(record.l2)) {
      add('E_L2_RESERVED_CHAR', path, 'a rendered string contains a reserved character');
    }
    checkRecordProvenance(record, policy, add, path);
    if (record.translationRev === null && metaRev !== null) {
      add('E_TRANSLATOR_REV_STALE', path, 'artifact mixes translation provenance; rerun bake');
    } else if (record.translationRev !== null && metaRev === null) {
      add('E_TRANSLATOR_REV_STALE', path, 'artifact mixes translation provenance; rerun bake');
    } else if (
      record.translationRev !== null &&
      metaRev !== null &&
      record.translationRev !== metaRev
    ) {
      add('E_TRANSLATOR_REV_STALE', path, 'translationRev differs from the pinned revision');
    }
  }

  // Gloss coverage.
  const produced = new Set<string>();
  for (const record of Object.values(c.lines)) {
    if (reserved(record.l1)) continue;
    for (const span of segmentL2(record.l2, c.l2)) {
      produced.add(span.key);
      if (!(span.key in c.gloss)) {
        add('E_GLOSS_MISSING', `gloss.${span.key}`, 'a span of a variant has no gloss entry');
      }
    }
  }
  for (const key of Object.keys(c.gloss)) {
    if (!produced.has(key))
      add('E_ORPHAN_GLOSS', `gloss.${key}`, 'gloss key appears in no variant');
  }
  for (const [key, entry] of Object.entries(c.gloss)) {
    checkGlossProvenance(entry, policy, add, `gloss.${key}`);
  }

  return out;
};

/* ==========================================================================
 * Session (dev only)
 * ========================================================================*/

const SESSION_MESSAGES: Record<string, string> = {
  E_CHOOSE_INVALID_KEY: 'the key is not an option of the matched choice set',
  E_CHOOSE_NOT_CHOICE_BEAT: 'choose applied to a beat that is not a choice beat',
  E_ADVANCE_UNRESOLVED: 'advance while the current beat is pending',
  E_ADVANCE_AT_END: 'advance at the final beat',
  E_REWIND_AT_START: 'rewind at the first beat',
  E_STALE_CHOICE: 'a recorded choice is stale',
};

export const reduceChecked: ReduceChecked = (c, s, op) => {
  const { session, codes } = applyOp(c, s, op);
  return {
    session,
    diagnostics: codes.map((code) =>
      diagnostic(code, 'session', SESSION_MESSAGES[code] ?? 'rejected session op'),
    ),
  };
};

export const validateSession: ValidateSession = (c, s) => {
  const out: Diagnostic[] = [];
  const steps = runWalk(c, s.choices, 'session').steps;
  for (const [beatId, key] of Object.entries(s.choices)) {
    const step = steps.find((x) => x.beatId === beatId);
    const valid = step !== undefined && step.status === 'resolved' && step.chosenKey === key;
    if (!valid) {
      out.push(
        diagnostic('E_STALE_CHOICE', `session.choices.${beatId}`, 'a recorded choice is stale'),
      );
    }
  }
  return out;
};

export const isEdited: IsEdited = (r) => r.l2 !== r.mt;
