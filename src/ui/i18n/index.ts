/**
 * Catalog resolution (D4 §18.1).
 *
 * Falls back to English for a language with no catalog. That fallback is a
 * deliberate last resort, not the mechanism: the `Messages` type is what stops a
 * translation going missing, and this only covers a learner whose native
 * language has no chrome strings yet.
 */

import { es } from './es.ts';
import { en, type Messages } from './messages.ts';

export type { Messages };
export { plural } from './plural.ts';

const CATALOGS: Record<string, Messages> = { en, es };

export function messagesFor(lang: string): Messages {
  return CATALOGS[lang] ?? en;
}

/** Languages that have a chrome catalog. */
export function catalogLanguages(): string[] {
  return Object.keys(CATALOGS);
}
