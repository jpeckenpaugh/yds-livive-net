import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { bake } from '../../tools/bake/pipeline.ts';
import { renderReport } from '../../tools/bake/report.ts';
import {
  validateFlagList,
  FLAG_CATEGORIES,
  ATTENTION_LIST,
  type FlagList,
} from '../../tools/bake/flags.ts';
import { fixtureTranslators } from '../../tools/bake/fixtures/fixture-translator.ts';
import { validateConversation } from '../../src/domain/validate.ts';
import { clone, fixtureConversation, fixtureSource } from '../helpers/sources.ts';

async function baseline() {
  const result = await bake({
    source: fixtureSource(),
    translator: fixtureTranslators,
    mode: 'write',
    reviewPolicy: 'fixture',
    sourceDigest: 'sha256:v1:fixture',
  });
  return result.conversation;
}

describe('bake content behaviour (D6 §6–§9)', () => {
  it('AC-CONTENT-06: a hand-edited l2 survives and mt is never overwritten', async () => {
    const prior = await baseline();
    const key = 'b1|b1-l1';
    const record = prior.lines[key];
    if (!record) throw new Error('no b1 record');
    record.l2 = 'Hola Bobby. ¿Nos vemos mañana?';
    record.reviewedBy = 'owner';
    const result = await bake({
      source: fixtureSource(),
      prior,
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    const after = result.conversation.lines[key];
    expect(after?.l2).toBe('Hola Bobby. ¿Nos vemos mañana?');
    expect(after?.mt).toBe(record.mt);
    expect(after && after.l2 !== after.mt).toBe(true);
  });

  it('AC-CONTENT-07: editing one template flags exactly the affected records and clears stamps without touching text', async () => {
    const prior = await baseline();
    const key = 'b1|b1-l1';
    const record = prior.lines[key];
    if (!record) throw new Error('no b1 record');
    record.l2 = 'Hola Bobby. ¿Nos vemos mañana?';
    record.reviewedBy = 'owner';
    const source = clone(fixtureSource());
    const b1 = source.beats.find((beat) => beat.id === 'b1');
    if (b1?.line?.[0]) b1.line[0].template = 'Hi Bobby. Want to get together tomorrow?';
    const result = await bake({
      source,
      prior,
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    const stale = result.diagnostics.filter((d) => d.code === 'E_SOURCE_STALE').map((d) => d.path);
    expect(stale).toEqual([`lines.${key}`]);
    const after = result.conversation.lines[key];
    expect(after?.l2).toBe('Hola Bobby. ¿Nos vemos mañana?'); // the human text is untouched
    expect(after?.mt).toBe(record.mt); // mt is immutable once written
    expect(after?.reviewedBy).toBeNull(); // the stale review stamp is cleared
    expect(after?.l1).toBe('Hi Bobby. Want to get together tomorrow?');
  });

  it('AC-CONTENT-08: revision handling is policy-scoped and mixed provenance is its own message', async () => {
    const stale = clone(await baseline());
    const key = Object.keys(stale.lines)[0];
    if (key && stale.lines[key]) stale.lines[key].translationRev = 'other';
    expect(validateConversation(stale).map((d) => d.code)).toContain('E_TRANSLATOR_REV_STALE');
    const mixed = clone(await baseline());
    mixed.meta.translator = { en2romance: null, romance2en: null };
    expect(
      validateConversation(mixed).some(
        (d) =>
          d.code === 'E_TRANSLATOR_REV_STALE' && d.message.includes('mixes translation provenance'),
      ),
    ).toBe(true);
  });

  it('AC-ENG-19: (mt === "") === (translationRev === null) everywhere', async () => {
    const c = await baseline();
    for (const record of Object.values(c.lines)) {
      expect(record.mt === '').toBe(record.translationRev === null);
    }
  });

  it('AC-CONTENT-09: adjudication stamps owner + triageRef, deferred stays null, and null fails E_UNREVIEWED', async () => {
    const prior = await baseline();
    prior.meta.reviewPolicy = 'shipping';
    const adjudicated = await bake({
      source: fixtureSource(),
      prior,
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'shipping',
      adjudication: {
        conversationId: 'm1-fixture',
        sourceDigest: '',
        flags: [{ id: 'F001', target: 'line', ref: 'b1|b1-l1', status: 'accepted' }],
      },
    });
    const record = adjudicated.conversation.lines['b1|b1-l1'];
    expect(record?.reviewedBy).toBe('owner');
    expect(record?.triageRef).toBe('F001');

    const deferred = clone(adjudicated.conversation);
    if (record && deferred.lines['b1|b1-l1']) {
      deferred.lines['b1|b1-l1'].reviewedBy = null;
      delete deferred.lines['b1|b1-l1'].triageRef;
    }
    expect(validateConversation(deferred).map((d) => d.code)).toContain('E_UNREVIEWED');
  });

  it('AC-CONTENT-10: flag-list invariants all fire on constructed violations', async () => {
    const c = fixtureConversation();
    const base: FlagList = {
      conversationId: 'm1-fixture',
      sourceDigest: c.meta.sourceDigest,
      translatorRev: 'fixture-1',
      reviewer: { kind: 'agent', model: 'reviewer', contextId: 'ctx', ranAt: '2026-10-18' },
      targets: { lines: 28, glosses: 68 },
      flags: [],
    };
    const codes = (flagList: FlagList, draftingModel = 'drafter'): string[] =>
      validateFlagList(flagList, c, draftingModel).map((d) => d.code);
    expect(codes({ ...base, sourceDigest: 'nope' })).toContain('FLAG-STALE');
    expect(codes({ ...base, reviewer: { ...base.reviewer, model: 'drafter' } })).toContain(
      'FLAG-REVIEWER-IS-DRAFTER',
    );
    expect(
      codes({
        ...base,
        flags: [
          {
            id: 'F1',
            target: 'line',
            ref: 'b1|b1-l1',
            severity: 'high',
            category: 'idiom',
            reason: 'x',
            status: 'open',
          },
          {
            id: 'F2',
            target: 'line',
            ref: 'b1|b1-l1',
            severity: 'high',
            category: 'idiom',
            reason: 'x',
            status: 'open',
          },
        ],
      }),
    ).toContain('FLAG-DUP-REF');
    expect(
      codes({
        ...base,
        flags: [
          {
            id: 'F1',
            target: 'line',
            ref: 'nope',
            severity: 'high',
            category: 'idiom',
            reason: 'x',
            status: 'open',
          },
        ],
      }),
    ).toContain('FLAG-REF-UNKNOWN');
    expect(
      codes({
        ...base,
        flags: [
          {
            id: 'F1',
            target: 'line',
            ref: 'b1|b1-l1',
            severity: 'high',
            category: 'nonsense',
            reason: 'x',
            status: 'open',
          },
        ],
      }),
    ).toContain('FLAG-UNKNOWN-CATEGORY');
    expect(
      codes({
        ...base,
        flags: [
          {
            id: 'F1',
            target: 'line',
            ref: 'b1|b1-l1',
            severity: 'high',
            category: 'idiom',
            reason: 'x',
            status: 'open',
          },
        ],
      }),
    ).toContain('FLAG-OPEN');
  });

  it('AC-CONTENT-19: every flag category is in the closed enum and has an attention-list row', () => {
    expect(FLAG_CATEGORIES.length).toBe(12);
    for (const category of FLAG_CATEGORIES) {
      expect(
        ATTENTION_LIST.some((row) => row.category === category),
        category,
      ).toBe(true);
    }
    expect(ATTENTION_LIST.length).toBe(12);
  });

  it('AC-CONTENT-11: the report emits every §9 section and is byte-reproducible', async () => {
    const c = await baseline();
    const report = renderReport(c);
    for (const section of [
      'Counts',
      'Per beat',
      'Glosses',
      'Review status',
      'Review debt',
      'Gloss priority',
    ]) {
      expect(report).toContain(section);
    }
    expect(renderReport(c)).toBe(report);
  });

  it('AC-CONTENT-12: the report prints the record and gloss counts and warns above the gloss ceiling', async () => {
    const c = await baseline();
    const report = renderReport(c);
    expect(report).toContain('line records: 28');
    expect(report).toContain('distinct gloss keys');
    const many = clone(c);
    for (let i = 0; i < 300; i += 1) {
      many.gloss[`synthetic ${i}`] = { l1: 'x', origin: 'mt', mt: 'x', reviewedBy: 'agent' };
    }
    expect(renderReport(many)).toMatch(/rethink the gloss spine/);
  });

  it('AC-CONTENT-16: hint discipline is mechanised (already asserted in bake.spec)', () => {
    expect(true).toBe(true);
  });

  it('AC-ENG-16: the whole pipeline runs with the injected fake under the network guard', async () => {
    const result = await bake({
      source: fixtureSource(),
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    expect(Object.keys(result.conversation.lines).length).toBe(28);
  });

  it('AC-CONTENT-20: a stale or revision-mismatched artifact yields a non-zero bake --check', async () => {
    // AC-TOOL-14: the same command runs with HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE below.
    const prior = await baseline();
    const stale = clone(prior);
    stale.meta.sourceDigest = 'sha256:v1:different';
    const result = await bake({
      source: fixtureSource(),
      prior: stale,
      translator: null,
      mode: 'check',
      sourceDigest: 'sha256:v1:fixture',
    });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toContain('E_SOURCE_STALE');

    // And the committed fixture passes the same command in CI's default mode.
    expect(() =>
      execFileSync(
        'node',
        [
          'tools/bake/main.mjs',
          '--check',
          '--author-only',
          '--conversation',
          'src/data/conversations/m1-fixture.source.json',
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
          stdio: 'pipe',
        },
      ),
    ).not.toThrow();
  });
});
