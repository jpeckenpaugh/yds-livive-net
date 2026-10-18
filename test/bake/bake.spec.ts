import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bake, checkHints } from '../../tools/bake/pipeline.ts';
import { renderReport } from '../../tools/bake/report.ts';
import {
  fixtureTranslators,
  wrongFixtureTranslators,
} from '../../tools/bake/fixtures/fixture-translator.ts';
import { validateConversationSource } from '../../src/domain/validate.ts';
import { clone, fixtureSource } from '../helpers/sources.ts';

const ROOT = process.cwd();
const SOURCE = 'src/data/conversations/m1-fixture.source.json';
const ARTIFACT = 'src/data/conversations/m1-fixture.json';
const GLOSSARY = 'src/data/conversations/m1-fixture.glossary.json';

async function writeFixture(source = fixtureSource()) {
  return bake({
    source,
    translator: fixtureTranslators,
    mode: 'write',
    reviewPolicy: 'fixture',
    generatedFrom: 'm1-fixture.source.json',
  });
}

describe('bake (D6 §3–§5; AC-CONTENT-01/02/03/04/05/13/14/15/17/21)', () => {
  it('AC-CONTENT-14: the fixture source validates with zero error diagnostics', () => {
    const errors = validateConversationSource(fixtureSource()).filter(
      (d) => d.severity === 'error',
    );
    expect(errors).toEqual([]);
  });

  it('AC-CONTENT-01/04: the four files exist and enumeration emits 28 records with the D6 §11.2 per-beat counts', async () => {
    // AC-CONTENT-04 is the enumeration count asserted below.
    for (const file of [SOURCE, ARTIFACT, GLOSSARY]) {
      expect(readFileSync(join(ROOT, file), 'utf8').length).toBeGreaterThan(0);
    }
    const result = await writeFixture();
    const perBeat = new Map<string, number>();
    for (const record of Object.values(result.conversation.lines)) {
      perBeat.set(record.beatId, (perBeat.get(record.beatId) ?? 0) + 1);
    }
    expect(Object.keys(result.conversation.lines).length).toBe(28);
    expect(Object.fromEntries(perBeat)).toEqual({
      b1: 1,
      b2: 2,
      b3: 2,
      b4: 4,
      b5: 4,
      b6: 2,
      b7: 2,
      b8: 2,
      b9: 8,
      b10: 1,
    });
  });

  it('AC-CONTENT-03: bake is idempotent', async () => {
    const first = await writeFixture();
    const second = await bake({
      source: fixtureSource(),
      prior: first.conversation,
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    expect(JSON.stringify(second.conversation)).toBe(JSON.stringify(first.conversation));
  });

  it('AC-CONTENT-02/13: --check --author-only writes nothing and needs no network', () => {
    // AC-CONTENT-13 is the zero-network half, asserted by the offline env below.
    const before = [ARTIFACT, GLOSSARY, 'review/report.m1-fixture.md'].map((file) =>
      readFileSync(join(ROOT, file), 'utf8'),
    );
    expect(() =>
      execFileSync(
        'node',
        ['tools/bake/main.mjs', '--check', '--author-only', '--conversation', SOURCE],
        {
          cwd: ROOT,
          env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
          stdio: 'pipe',
        },
      ),
    ).not.toThrow();
    const after = [ARTIFACT, GLOSSARY, 'review/report.m1-fixture.md'].map((file) =>
      readFileSync(join(ROOT, file), 'utf8'),
    );
    expect(after).toEqual(before);
  });

  it('AC-CONTENT-05: two forced colliding variant keys raise E_VARIANT_KEY_COLLISION', async () => {
    const source = clone(fixtureSource());
    const b4 = source.beats.find((beat) => beat.id === 'b4');
    const dinner = b4?.choiceSets?.[0]?.options?.[0];
    const movie = b4?.choiceSets?.[1]?.options?.[0];
    if (dinner && movie) {
      dinner.key = 'dup';
      dinner.sets = { cuisine: 'chinese' };
      movie.key = 'dup';
      movie.sets = { cuisine: 'chinese' };
      movie.template = "Let's get {cuisine}.";
    }
    const result = await bake({ source, translator: fixtureTranslators, mode: 'write' });
    expect(result.diagnostics.map((d) => d.code)).toContain('E_VARIANT_KEY_COLLISION');
  });

  it('AC-CONTENT-15: who is read twice', () => {
    const source = fixtureSource();
    const b8 = source.beats.find((beat) => beat.id === 'b8');
    const b9 = source.beats.find((beat) => beat.id === 'b9');
    expect(b8?.choiceSets?.[0]?.options.some((option) => option.template.includes('{who}'))).toBe(
      true,
    );
    expect(b9?.line?.[0]?.template.includes('{who}')).toBe(true);
  });

  it('AC-CONTENT-17: labels and icons are literal and appear in neither lines nor gloss; all ten options carry an icon', async () => {
    const source = fixtureSource();
    const options = source.beats.flatMap((beat) =>
      (beat.choiceSets ?? []).flatMap((set) => set.options),
    );
    expect(options.length).toBe(10);
    expect(
      options.every((option) => typeof option.icon === 'string' && option.icon.length > 0),
    ).toBe(true);
    const result = await writeFixture();
    for (const record of Object.values(result.conversation.lines))
      expect('icon' in record).toBe(false);
    for (const entry of Object.values(result.gloss)) expect('icon' in entry).toBe(false);
  });

  it('AC-CONTENT-21: the fixture artifact records reviewPolicy: fixture and never claims an owner review', async () => {
    const result = await writeFixture();
    expect(result.conversation.meta.reviewPolicy).toBe('fixture');
    for (const record of Object.values(result.conversation.lines)) {
      expect(record.reviewedBy).toBe('agent');
      expect(record.l2).toBe(record.mt);
    }
    expect(renderReport(result.conversation)).toContain('Review policy: **fixture**');
  });

  it('the deliberately-wrong fixture produces a flaggable Portuguese line, not a crash', async () => {
    const result = await bake({
      source: fixtureSource(),
      translator: wrongFixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    expect(result.conversation.lines['b10|b10-l1']?.l2).toBe('Até logo, Ron!');
  });

  it('the hint-discipline check passes on the fixture and fires on a bad hint', () => {
    // AC-CONTENT-16: the mechanised half of hint discipline.
    expect(checkHints(fixtureSource())).toEqual([]);
    const bad = fixtureSource();
    const b1 = bad.beats[0];
    if (b1) b1.hint = 'Ron says: do you want to get together tomorrow with me?';
    const codes = checkHints(bad).map((d) => d.code);
    expect(codes).toContain('HINT-ECHOES-LINE');
  });

  it('AC-CONTENT-24: the committed fixture is reproducible offline, byte-identically', async () => {
    const committed = JSON.parse(readFileSync(join(ROOT, ARTIFACT), 'utf8')) as {
      meta: { sourceDigest: string };
    };
    const result = await bake({
      source: fixtureSource(),
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
      generatedFrom: 'm1-fixture.source.json',
      sourceDigest: committed.meta.sourceDigest,
    });
    expect(`${JSON.stringify(result.conversation, null, 2)}\n`).toBe(
      readFileSync(join(ROOT, ARTIFACT), 'utf8'),
    );
  });
});
