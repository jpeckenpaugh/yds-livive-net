/**
 * The fixture translator (D6 §4.2, D5 §7.2).
 *
 * Deterministic, zero-network, byte-stable. `en2romance` looks the rendered
 * English up in the authored table; `romance2en` looks a Spanish *line* back up
 * and falls back to the span text itself for sub-spans (a fixture-only wart —
 * the fixture is deleted in M2).
 *
 * `wrongFixtureTranslators` is the deliberately-wrong variant the triage path
 * needs: one known line comes back Portuguese, so a flaggable entry is produced
 * rather than a crash.
 */

import { normalizeSpan } from '../../../src/domain/segment.ts';
import type { BakeTranslators } from '../pipeline.ts';
import { EN_TO_ES } from './translations.ts';

export const FIXTURE_REVISION = 'fixture-1';

function makeEnToEs(
  revision: string,
  table: Record<string, string>,
): BakeTranslators['en2romance'] {
  return {
    revision,
    translate({ text }: { text: string; from: string; to: string }): Promise<string> {
      const value = table[text];
      if (value === undefined) {
        return Promise.reject(new Error(`fixture translator has no Spanish for: ${text}`));
      }
      return Promise.resolve(value);
    },
  };
}

function makeEsToEn(
  revision: string,
  table: Record<string, string>,
): BakeTranslators['romance2en'] {
  const reverse = new Map<string, string>();
  for (const [en, es] of Object.entries(table)) reverse.set(es, en);
  return {
    revision,
    translate({ text }: { text: string; from: string; to: string }): Promise<string> {
      const exact = reverse.get(text) ?? reverse.get(normalizeSpan(text));
      return Promise.resolve(exact ?? text);
    },
  };
}

export const fixtureTranslators: BakeTranslators = {
  en2romance: makeEnToEs(FIXTURE_REVISION, EN_TO_ES),
  romance2en: makeEsToEn(FIXTURE_REVISION, EN_TO_ES),
};

/** One line deliberately rendered as Portuguese, so triage is testable (D6 §4.2). */
export const wrongFixtureTranslators: BakeTranslators = {
  en2romance: makeEnToEs(FIXTURE_REVISION, {
    ...EN_TO_ES,
    'See you then, Ron!': 'Até logo, Ron!',
  }),
  romance2en: makeEsToEn(FIXTURE_REVISION, EN_TO_ES),
};
