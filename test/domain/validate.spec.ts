import { describe, expect, it } from 'vitest';
import { structureOf } from '../../src/domain/structure.ts';
import { validateConversationSource } from '../../src/domain/validate.ts';
import type { ConversationSource, Diagnostic, DiagnosticCode } from '../../src/domain/types.ts';
import { clone, fixtureConversation, fixtureSource, minimalSource } from '../helpers/sources.ts';

function has(diagnostics: Diagnostic[], code: DiagnosticCode): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code);
}

function errors(source: ConversationSource): Diagnostic[] {
  return validateConversationSource(source).filter((diagnostic) => diagnostic.severity === 'error');
}

function manyDecisionsSource(n: number): ConversationSource {
  const variables = Array.from({ length: n }, (_, i) => ({
    name: `v${i}`,
    values: [
      { key: 'p', l1: 'P' },
      { key: 'q', l1: 'Q' },
    ],
  }));
  const beats: ConversationSource['beats'] = [];
  for (let i = 0; i < n; i += 1) {
    beats.push({
      id: `b${i}`,
      speaker: 'a',
      choiceSets: [
        {
          id: `b${i}-s1`,
          options: [
            { key: 'p', label: { l1: 'P', l2: 'P' }, template: 'P', sets: { [`v${i}`]: 'p' } },
            { key: 'q', label: { l1: 'Q', l2: 'Q' }, template: 'Q', sets: { [`v${i}`]: 'q' } },
          ],
        },
      ],
    });
  }
  beats.push({
    id: 'final',
    speaker: 'a',
    line: [{ id: 'final-l1', template: Array.from({ length: n }, (_, i) => `{v${i}}`).join(' ') }],
  });
  return {
    id: 'many-decisions',
    title: 'Many decisions',
    l1: 'en',
    l2: 'es',
    characters: { a: { name: 'A', voice: 'M1' } },
    variables,
    beats,
  };
}

describe('validateConversationSource (D2 §5.2, §6, AC-DOM-03..07, 20, 22)', () => {
  it('the shipped fixture validates with zero error diagnostics (AC-CONTENT-14)', () => {
    expect(errors(fixtureSource())).toEqual([]);
  });

  it('AC-DOM-03: E_NO_MATCH and E_AMBIGUOUS_MATCH on constructed counterexamples', () => {
    const noMatch = minimalSource();
    if (noMatch.beats[2]?.line?.[0]) noMatch.beats[2].line[0].when = { x: 'p' };
    // b2 always writes q, so the p alternative matches nothing.
    const optionP = noMatch.beats[1]?.choiceSets?.[0]?.options?.[0];
    const optionQ = noMatch.beats[1]?.choiceSets?.[0]?.options?.[1];
    if (optionP) optionP.sets = { x: 'q' };
    if (optionQ) optionQ.sets = { x: 'q' };
    expect(has(validateConversationSource(noMatch), 'E_NO_MATCH')).toBe(true);

    const ambiguous = minimalSource();
    const line = ambiguous.beats[2]?.line?.[0];
    if (ambiguous.beats[2] && line) {
      ambiguous.beats[2].line = [clone(line), { ...clone(line), id: 'b3-l2' }];
    }
    expect(has(validateConversationSource(ambiguous), 'E_AMBIGUOUS_MATCH')).toBe(true);
  });

  it('AC-DOM-04: fallback discipline', () => {
    const multiple = minimalSource();
    const line = multiple.beats[2]?.line?.[0];
    if (multiple.beats[2] && line)
      multiple.beats[2].line = [clone(line), { ...clone(line), id: 'b3-l2' }];
    expect(has(validateConversationSource(multiple), 'E_MULTIPLE_FALLBACK')).toBe(true);

    const notLast = minimalSource();
    const first = notLast.beats[2]?.line?.[0];
    if (notLast.beats[2] && first) {
      notLast.beats[2].line = [clone(first), { ...clone(first), id: 'b3-l2', when: { x: 'p' } }];
    }
    expect(has(validateConversationSource(notLast), 'E_FALLBACK_NOT_LAST')).toBe(true);
  });

  it('AC-DOM-05: deleting every read of who raises E_DEAD_VARIABLE; deleting only b9 does not', () => {
    const all = fixtureSource();
    const b8 = all.beats.find((beat) => beat.id === 'b8');
    for (const set of b8?.choiceSets ?? []) {
      for (const option of set.options)
        option.template = option.template.replace(' {who}', '').replace('{who}', 'them');
    }
    const b9 = all.beats.find((beat) => beat.id === 'b9');
    if (b9?.line?.[0]) b9.line[0].template = b9.line[0].template.replace(' with {who}', '');
    expect(has(validateConversationSource(all), 'E_DEAD_VARIABLE')).toBe(true);

    const downstreamOnly = fixtureSource();
    const b9b = downstreamOnly.beats.find((beat) => beat.id === 'b9');
    if (b9b?.line?.[0]) b9b.line[0].template = b9b.line[0].template.replace(' with {who}', '');
    expect(has(validateConversationSource(downstreamOnly), 'E_DEAD_VARIABLE')).toBe(false);
  });

  it('AC-DOM-06: a self-read is valid, and a read before write raises E_READ_UNSET', () => {
    const selfRead = minimalSource();
    const option = selfRead.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (option) option.template = 'I pick {x}.';
    expect(has(validateConversationSource(selfRead), 'E_READ_UNSET')).toBe(false);

    const early = minimalSource();
    early.beats.unshift({
      id: 'b0',
      speaker: 'a',
      line: [{ id: 'b0-l1', template: '{x} already?' }],
    });
    expect(has(validateConversationSource(early), 'E_READ_UNSET')).toBe(true);
  });

  it('AC-DOM-07: bound-pair coherence', () => {
    const sloppy = fixtureSource();
    const dinner = sloppy.beats.find((beat) => beat.id === 'b2')?.choiceSets?.[0]?.options?.[0];
    if (dinner) dinner.sets = { activity: 'dinner' };
    expect(has(validateConversationSource(sloppy), 'E_BOUND_PAIR_SLOPPY')).toBe(true);

    const ambiguous = fixtureSource();
    const b2 = ambiguous.beats.find((beat) => beat.id === 'b2')?.choiceSets?.[0];
    const movie = b2?.options[1];
    if (movie) movie.sets = { activity: 'dinner', spot: 'dinner-plan' };
    expect(has(validateConversationSource(ambiguous), 'E_BOUND_PAIR_AMBIGUOUS')).toBe(true);
  });

  it('AC-DOM-20: enumeration limits fire at 33 variants and 4097 assignments', () => {
    expect(has(validateConversationSource(manyDecisionsSource(6)), 'E_ENUM_LIMIT_VARIANTS')).toBe(
      true,
    );
    expect(
      has(validateConversationSource(manyDecisionsSource(13)), 'E_ENUM_LIMIT_ASSIGNMENTS'),
    ).toBe(true);
  });

  it('AC-DOM-22: an option icon is label-class', () => {
    const iconSlot = minimalSource();
    const option = iconSlot.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (option) option.icon = '{x}';
    expect(has(validateConversationSource(iconSlot), 'E_LABEL_SLOT')).toBe(true);

    const structure = structureOf(minimalSource());
    const built = structure.beats['b2']?.alternatives[0]?.options?.[0];
    expect(built?.icon).toBeUndefined();

    const c = fixtureConversation();
    for (const record of Object.values(c.lines)) expect('icon' in record).toBe(false);
    for (const entry of Object.values(c.gloss)) expect('icon' in entry).toBe(false);
  });

  it('reports duplicate ids, keys and variables', () => {
    const source = minimalSource();
    source.beats.push(clone(source.beats[0] as ConversationSource['beats'][number]));
    const codes = validateConversationSource(source).map((diagnostic) => diagnostic.code);
    expect(codes).toContain('E_DUPLICATE_BEAT_ID');
    expect(codes).toContain('E_DUPLICATE_LINE_ID');

    const dupKey = minimalSource();
    const options = dupKey.beats[1]?.choiceSets?.[0]?.options;
    if (options?.[1]) options[1].key = 'p';
    expect(has(validateConversationSource(dupKey), 'E_DUPLICATE_CHOICE_KEY')).toBe(true);

    const dupVar = minimalSource();
    dupVar.variables.push(clone(dupVar.variables[0] as ConversationSource['variables'][number]));
    expect(has(validateConversationSource(dupVar), 'E_DUPLICATE_VAR')).toBe(true);

    const dupValue = minimalSource();
    dupValue.variables[0]?.values.push({ key: 'p', l1: 'P' });
    expect(has(validateConversationSource(dupValue), 'E_DUPLICATE_VALUE_KEY')).toBe(true);
  });

  it('reports arity, reserved characters, unknown slots/vars/values and null writes', () => {
    const arity = minimalSource();
    if (arity.beats[0]) arity.beats[0].choiceSets = clone(arity.beats[1]?.choiceSets ?? []);
    expect(has(validateConversationSource(arity), 'E_BEAT_ARITY')).toBe(true);

    const reserved = minimalSource();
    const line = reserved.beats[0]?.line?.[0];
    if (line) line.template = 'Hello ${name}.';
    expect(has(validateConversationSource(reserved), 'E_TEMPLATE_RESERVED_CHAR')).toBe(true);

    const unknownSlot = minimalSource();
    const slotLine = unknownSlot.beats[0]?.line?.[0];
    if (slotLine) slotLine.template = 'Hello {nope}.';
    expect(has(validateConversationSource(unknownSlot), 'E_UNKNOWN_SLOT')).toBe(true);

    const unknownVar = minimalSource();
    const option = unknownVar.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (option) option.sets = { nope: 'p' };
    expect(has(validateConversationSource(unknownVar), 'E_UNKNOWN_VAR')).toBe(true);

    const unknownValue = minimalSource();
    const valueOption = unknownValue.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (valueOption) valueOption.sets = { x: 'z' };
    expect(has(validateConversationSource(unknownValue), 'E_UNKNOWN_VALUE')).toBe(true);

    const nullWrite = minimalSource();
    const nullOption = nullWrite.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (nullOption) (nullOption.sets as Record<string, unknown>).x = null;
    expect(has(validateConversationSource(nullWrite), 'E_NULL_WRITE')).toBe(true);
  });

  it('reports empty when, hint slots, missing label language, missing surface form and option counts', () => {
    const emptyWhen = minimalSource();
    const line = emptyWhen.beats[0]?.line?.[0];
    if (line) line.when = {};
    expect(has(validateConversationSource(emptyWhen), 'E_EMPTY_WHEN')).toBe(true);

    const hintSlot = minimalSource();
    if (hintSlot.beats[0]) hintSlot.beats[0].hint = 'About {x}.';
    expect(has(validateConversationSource(hintSlot), 'E_HINT_SLOT')).toBe(true);

    const missingLang = minimalSource();
    const option = missingLang.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (option) (option.label as Record<string, unknown>).l2 = undefined;
    expect(has(validateConversationSource(missingLang), 'E_LABEL_MISSING_LANG')).toBe(true);

    const missingForm = minimalSource();
    const value = missingForm.variables[0]?.values[0];
    if (value) delete value.l1;
    expect(has(validateConversationSource(missingForm), 'E_MISSING_SURFACE_FORM')).toBe(true);

    const tooFew = minimalSource();
    const set = tooFew.beats[1]?.choiceSets?.[0];
    if (set) set.options = set.options.slice(0, 1);
    expect(has(validateConversationSource(tooFew), 'E_CHOICE_OPTIONS_MIN')).toBe(true);

    const tooMany = minimalSource();
    const many = tooMany.beats[1]?.choiceSets?.[0];
    const firstOption = many?.options[0];
    if (many && firstOption) {
      many.options = Array.from({ length: 9 }, (_, i) => ({ ...clone(firstOption), key: `k${i}` }));
    }
    expect(has(validateConversationSource(tooMany), 'E_CHOICE_OPTIONS_MAX')).toBe(true);
  });

  it('reports a dead alternative', () => {
    const source = minimalSource();
    source.variables[0]?.values.push({ key: 'r', l1: 'R' });
    const line = source.beats[2]?.line?.[0];
    if (source.beats[2] && line) {
      source.beats[2].line = [{ ...clone(line), id: 'b3-dead', when: { x: 'r' } }, clone(line)];
    }
    expect(has(validateConversationSource(source), 'E_DEAD_ALTERNATIVE')).toBe(true);
  });

  it('E_SCHEMA fires on a malformed object', () => {
    expect(has(validateConversationSource(null as unknown as ConversationSource), 'E_SCHEMA')).toBe(
      true,
    );
    expect(has(validateConversationSource({} as ConversationSource), 'E_SCHEMA')).toBe(true);
  });
});
