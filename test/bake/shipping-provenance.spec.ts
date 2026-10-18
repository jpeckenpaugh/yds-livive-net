import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The shipping artifacts' provenance and gloss coverage.
 *
 * `AC-CONTENT-23` and `AC-CONTENT-25` were registered at M3 but are satisfied by
 * the authored-table route that shipped (the PM's ruling: move the milestone,
 * re-implement nothing). `AC-ENG-18` and `AC-CONTENT-18` are **inapplicable** to
 * this route — an authored table has no `>>es<<` sentinel and no target-selection
 * step — so they are asserted as inapplicable rather than satisfied vacuously
 * (D3 §13, D6 §4.1).
 */

type VariantRecord = { translationRev: string | null; reviewedBy: string | null };
type GlossEntry = { l1: string; mt: string };
type Conversation = {
  id: string;
  meta: { reviewPolicy: string; translator: { en2romance: string; romance2en: string } };
  lines: Record<string, VariantRecord>;
  gloss: Record<string, GlossEntry>;
};

const DIR = 'src/data/conversations';
const shipping: Conversation[] = readdirSync(DIR)
  .filter(
    (f) => f.endsWith('.json') && !f.endsWith('.source.json') && !f.endsWith('.glossary.json'),
  )
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Conversation)
  .filter((c) => c.meta.reviewPolicy === 'shipping');

describe('shipping content provenance (AC-CONTENT-23/25, AC-ENG-18)', () => {
  it('has at least one shipping conversation', () => {
    expect(shipping.length).toBeGreaterThan(0);
  });

  it('AC-CONTENT-23: revisions are a pinned authored-table revision, record and meta agree', () => {
    for (const c of shipping) {
      const meta = c.meta.translator;
      expect(meta.en2romance, c.id).toMatch(/^authored-\d+$/);
      expect(meta.romance2en, c.id).toMatch(/^authored-\d+$/);
      for (const [key, record] of Object.entries(c.lines)) {
        expect(record.translationRev, `${c.id}:${key}`).toBe(meta.en2romance);
      }
    }
  });

  it('AC-CONTENT-25: shipping policy, every line reviewed, and no identity gloss', () => {
    for (const c of shipping) {
      expect(c.meta.reviewPolicy, c.id).toBe('shipping');
      for (const [key, record] of Object.entries(c.lines)) {
        expect(record.reviewedBy, `${c.id}:${key}`).toBeTruthy();
      }
      expect(Object.keys(c.gloss).length, c.id).toBeGreaterThan(0);
      for (const [span, entry] of Object.entries(c.gloss)) {
        // A self-gloss renders a Spanish span as itself.
        expect(span === entry.mt && span === entry.l1, `${c.id}:${span}`).toBe(false);
      }
    }
  });

  it('AC-ENG-18: the shipping route is authored, so the sentinel smoke test is inapplicable', () => {
    // No model translator is selected, so there is no `>>es<<` token to honour.
    for (const c of shipping) {
      expect(c.meta.translator.en2romance, c.id).toMatch(/^authored-/);
      expect(c.meta.translator.romance2en, c.id).toMatch(/^authored-/);
    }
  });

  it('AC-CONTENT-18: phase 0 is skipped for an authored-table run (no sentinel)', () => {
    // D6 §4.1: phase 0 needs a model translator; the shipping route injects an
    // authored table, so there is nothing to honour and no vacuous check is run.
    for (const c of shipping) {
      expect(c.meta.translator.en2romance, c.id).toMatch(/^authored-/);
    }
  });
});
