import { describe, expect, it } from 'vitest';
import { bake } from '../../tools/bake/pipeline.ts';
import { fixtureTranslators } from '../../tools/bake/fixtures/fixture-translator.ts';
import { validateConversation } from '../../src/domain/validate.ts';
import { clone, fixtureSource } from '../helpers/sources.ts';

async function baseline() {
  const result = await bake({
    source: fixtureSource(),
    translator: fixtureTranslators,
    mode: 'write',
    reviewPolicy: 'fixture',
  });
  return result.conversation;
}

describe('provenance and staleness (AC-DOM-10, AC-DOM-11)', () => {
  // AC-DOM-21's pipeline-only code (E_SOURCE_STALE) is triggered here.
  it('AC-DOM-10: a null stamp fails under shipping and warns under fixture', async () => {
    const shipping = clone(await baseline());
    shipping.meta.reviewPolicy = 'shipping';
    const key = Object.keys(shipping.lines)[0];
    if (key && shipping.lines[key]) shipping.lines[key].reviewedBy = null;
    const codes = validateConversation(shipping);
    expect(codes.some((d) => d.code === 'E_UNREVIEWED' && d.severity === 'error')).toBe(true);

    const fixture = clone(await baseline());
    if (key && fixture.lines[key]) fixture.lines[key].reviewedBy = null;
    expect(
      validateConversation(fixture).some((d) => d.code === 'E_UNREVIEWED' && d.severity === 'warn'),
    ).toBe(true);
  });

  it('AC-DOM-10: an edit without an owner stamp fails under shipping, and owner in a fixture is an error', async () => {
    const shipping = clone(await baseline());
    shipping.meta.reviewPolicy = 'shipping';
    const key = Object.keys(shipping.lines)[0];
    if (key && shipping.lines[key]) {
      shipping.lines[key].l2 = 'editado';
      shipping.lines[key].reviewedBy = 'agent';
    }
    expect(validateConversation(shipping).map((d) => d.code)).toContain('E_EDITED_NOT_OWNER');

    const fixture = clone(await baseline());
    if (key && fixture.lines[key]) fixture.lines[key].reviewedBy = 'owner';
    expect(
      validateConversation(fixture).some(
        (d) => d.code === 'E_UNREVIEWED' && d.severity === 'error',
      ),
    ).toBe(true);
  });

  it('AC-DOM-11: editing one English template flags exactly the affected records with E_SOURCE_STALE', async () => {
    const prior = await baseline();
    const source = clone(fixtureSource());
    const b1 = source.beats.find((beat) => beat.id === 'b1');
    if (b1?.line?.[0]) b1.line[0].template = 'Hi Bobby. Want to get together tomorrow?';
    const result = await bake({ source, prior, translator: fixtureTranslators, mode: 'check' });
    const stale = result.diagnostics.filter((d) => d.code === 'E_SOURCE_STALE').map((d) => d.path);
    expect(stale).toEqual(['lines.b1|b1-l1']);
  });

  it('E_TRANSLATOR_REV_STALE fires on a mismatch and is clean when both are null', async () => {
    const stale = clone(await baseline());
    const key = Object.keys(stale.lines)[0];
    if (key && stale.lines[key]) stale.lines[key].translationRev = 'otra-revision';
    expect(validateConversation(stale).map((d) => d.code)).toContain('E_TRANSLATOR_REV_STALE');

    const bothNull = clone(await baseline());
    bothNull.meta.translator = { en2romance: null, romance2en: null };
    for (const record of Object.values(bothNull.lines)) record.translationRev = null;
    expect(
      validateConversation(bothNull).filter((d) => d.code === 'E_TRANSLATOR_REV_STALE'),
    ).toEqual([]);
  });

  it('a hand-edited l2 is preserved and mt is never overwritten', async () => {
    const prior = await baseline();
    const key = 'b1|b1-l1';
    const record = prior.lines[key];
    if (record) {
      record.l2 = 'Hola Bobby. ¿Nos vemos mañana?';
      record.reviewedBy = 'owner';
    }
    const result = await bake({
      source: fixtureSource(),
      prior,
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    const after = result.conversation.lines[key];
    expect(after?.l2).toBe('Hola Bobby. ¿Nos vemos mañana?');
    expect(after?.mt).toBe(record?.mt);
    expect(after && after.l2 !== after.mt).toBe(true);
  });

  it('an unreachable record is preserved without --prune and dropped with --prune (D6 §7.2)', async () => {
    const prior = await baseline();
    const base = prior.lines['b1|b1-l1'];
    if (!base) throw new Error('expected the baseline b1 record');
    prior.lines['b99|b99-l1'] = { ...clone(base), beatId: 'b99', variantKey: 'b99|b99-l1' };
    const kept = await bake({
      source: fixtureSource(),
      prior,
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    expect(kept.conversation.lines['b99|b99-l1']).toBeDefined();
    const pruned = await bake({
      source: fixtureSource(),
      prior,
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
      prune: true,
    });
    expect(pruned.conversation.lines['b99|b99-l1']).toBeUndefined();
  });
});
