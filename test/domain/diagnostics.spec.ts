import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES, DIAGNOSTIC_SEVERITY } from '../../src/domain/diagnostics.ts';
import { structureOf } from '../../src/domain/structure.ts';
import { validateConversation } from '../../src/domain/validate.ts';
import type { Conversation, DiagnosticCode } from '../../src/domain/types.ts';
import { clone, fixtureConversation, fixtureSource } from '../helpers/sources.ts';

const SESSION_CODES: DiagnosticCode[] = [
  'E_CHOOSE_INVALID_KEY',
  'E_CHOOSE_NOT_CHOICE_BEAT',
  'E_ADVANCE_UNRESOLVED',
  'E_ADVANCE_AT_END',
  'E_REWIND_AT_START',
  'E_STALE_CHOICE',
];

function codesOf(c: Conversation): Set<string> {
  return new Set(validateConversation(c).map((diagnostic) => diagnostic.code));
}

describe('the diagnostic registry (D2 §14, AC-DOM-21)', () => {
  it('has exactly 49 unique codes', () => {
    expect(DIAGNOSTIC_CODES.length).toBe(49);
    expect(new Set(DIAGNOSTIC_CODES).size).toBe(49);
  });

  it('classifies every code by severity', () => {
    for (const code of DIAGNOSTIC_CODES) {
      expect(['error', 'warn', 'dev']).toContain(DIAGNOSTIC_SEVERITY[code]);
    }
    expect(DIAGNOSTIC_SEVERITY.E_ORPHAN_VARIANT).toBe('warn');
    expect(DIAGNOSTIC_SEVERITY.E_ORPHAN_GLOSS).toBe('warn');
    for (const code of SESSION_CODES) expect(DIAGNOSTIC_SEVERITY[code]).toBe('dev');
  });

  it('raises every generated-artifact code on a constructed violation', () => {
    const triggered = new Set<string>();

    const schema = fixtureConversation();
    schema.meta.schemaVersion = 2;
    for (const code of codesOf(schema)) triggered.add(code);

    const missing = fixtureConversation();
    delete missing.lines['b1|b1-l1'];
    for (const code of codesOf(missing)) triggered.add(code);

    const orphan = fixtureConversation();
    const orphanBase = orphan.lines['b1|b1-l1'];
    if (orphanBase) orphan.lines['b99|b99-l1'] = clone(orphanBase);
    for (const code of codesOf(orphan)) triggered.add(code);

    const unreviewed = fixtureConversation();
    unreviewed.meta.reviewPolicy = 'shipping';
    const firstLine = Object.keys(unreviewed.lines)[0];
    if (firstLine && unreviewed.lines[firstLine]) unreviewed.lines[firstLine].reviewedBy = null;
    for (const code of codesOf(unreviewed)) triggered.add(code);

    const edited = fixtureConversation();
    edited.meta.reviewPolicy = 'shipping';
    const editKey = Object.keys(edited.lines)[0];
    if (editKey && edited.lines[editKey]) {
      edited.lines[editKey].l2 = 'distinto';
      edited.lines[editKey].reviewedBy = 'agent';
    }
    for (const code of codesOf(edited)) triggered.add(code);

    const glossEdited = fixtureConversation();
    const glossKey = Object.keys(glossEdited.gloss)[0];
    if (glossKey && glossEdited.gloss[glossKey]) glossEdited.gloss[glossKey].l1 = 'otra cosa';
    for (const code of codesOf(glossEdited)) triggered.add(code);

    const stale = fixtureConversation();
    const staleKey = Object.keys(stale.lines)[0];
    if (staleKey && stale.lines[staleKey]) stale.lines[staleKey].translationRev = 'otra';
    for (const code of codesOf(stale)) triggered.add(code);

    const glossMissing = fixtureConversation();
    const dropKey = Object.keys(glossMissing.gloss)[0];
    if (dropKey) delete glossMissing.gloss[dropKey];
    for (const code of codesOf(glossMissing)) triggered.add(code);

    const glossOrphan = fixtureConversation();
    glossOrphan.gloss['no existe'] = { l1: 'x', origin: 'mt', mt: 'x', reviewedBy: 'agent' };
    for (const code of codesOf(glossOrphan)) triggered.add(code);

    const reservedChar = fixtureConversation();
    const reservedKey = Object.keys(reservedChar.lines)[0];
    if (reservedKey && reservedChar.lines[reservedKey])
      reservedChar.lines[reservedKey].l1 = '{braces}';
    for (const code of codesOf(reservedChar)) triggered.add(code);

    const collision = clone(fixtureSource());
    const dinner = collision.beats.find((beat) => beat.id === 'b4')?.choiceSets?.[0]?.options?.[0];
    const movie = collision.beats.find((beat) => beat.id === 'b4')?.choiceSets?.[1]?.options?.[0];
    if (dinner && movie) {
      dinner.key = 'dup';
      dinner.sets = { cuisine: 'chinese' };
      movie.key = 'dup';
      movie.sets = { cuisine: 'chinese' };
      movie.template = "Let's get {cuisine}.";
    }
    for (const code of codesOf(structureOf(collision))) triggered.add(code);

    const expected: DiagnosticCode[] = [
      'E_SCHEMA_VERSION',
      'E_VARIANT_MISSING',
      'E_ORPHAN_VARIANT',
      'E_UNREVIEWED',
      'E_EDITED_NOT_OWNER',
      'E_GLOSS_EDITED_NOT_OWNER',
      'E_TRANSLATOR_REV_STALE',
      'E_GLOSS_MISSING',
      'E_ORPHAN_GLOSS',
      'E_L2_RESERVED_CHAR',
      'E_VARIANT_KEY_COLLISION',
    ];
    for (const code of expected) expect(triggered.has(code), `not triggered: ${code}`).toBe(true);
  });
});
