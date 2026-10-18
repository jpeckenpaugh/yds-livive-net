/**
 * The flag list and its invariants (D6 §8.3, §8.4, §11.6; AC-CONTENT-10/19).
 *
 * The review agent produces the flag list; the owner adjudicates it. `ref` is a
 * variant key for a line or `normalizeSpan(span text)` for a gloss.
 */

import { normalizeSpan } from '../../src/domain/segment.ts';
import type { Conversation } from '../../src/domain/types.ts';
import { bakeDiagnostic, type BakeDiagnostic } from './diagnostics.ts';

/** The closed `category` enum (D6 §8.3). */
export const FLAG_CATEGORIES = [
  'agreement',
  'article',
  'register',
  'idiom',
  'subjunctive',
  'punctuation',
  'false-friend',
  'omission',
  'addition',
  'name',
  'scope',
  'other',
] as const;

export type FlagCategory = (typeof FLAG_CATEGORIES)[number];

/** §11.6's attention list. Every category has a row (AC-CONTENT-19). */
export const ATTENTION_LIST: ReadonlyArray<{ category: FlagCategory; phenomenon: string }> = [
  { category: 'subjunctive', phenomenon: 'Subjunctive after que' },
  { category: 'punctuation', phenomenon: 'Inverted opening marks ¿ ¡' },
  { category: 'idiom', phenomenon: 'Idiomatic verbs' },
  { category: 'article', phenomenon: 'Article and gender on a substituted noun phrase' },
  { category: 'agreement', phenomenon: 'Gender and number across the sentence' },
  { category: 'register', phenomenon: 'Register drift into formal or written Spanish' },
  { category: 'omission', phenomenon: 'MT drops a coordinated clause' },
  { category: 'addition', phenomenon: 'MT doubles a coordinated clause' },
  { category: 'name', phenomenon: 'Standardisation of a proper name' },
  { category: 'false-friend', phenomenon: 'False friends' },
  { category: 'scope', phenomenon: 'A gloss describes the clause rather than the hovered span' },
  { category: 'other', phenomenon: 'Anything the twelve categories do not cover' },
];

export type FlagSeverity = 'high' | 'medium' | 'low';
export type FlagStatus = 'open' | 'accepted' | 'rejected' | 'deferred';

export type FlagEntry = {
  id: string;
  target: 'line' | 'gloss';
  ref: string;
  en?: string;
  l2?: string;
  severity: FlagSeverity;
  category: string;
  reason: string;
  suggestion?: string;
  status: FlagStatus;
  correction?: string;
};

export type FlagList = {
  conversationId: string;
  sourceDigest: string;
  translatorRev: string | null;
  reviewer: { kind: 'agent' | 'owner'; model: string; contextId: string; ranAt: string };
  targets: { lines: number; glosses: number };
  flags: FlagEntry[];
};

export function validateFlagList(
  flagList: FlagList,
  conversation: Conversation,
  draftingModel: string,
): BakeDiagnostic[] {
  const out: BakeDiagnostic[] = [];
  if (flagList.sourceDigest !== conversation.meta.sourceDigest) {
    out.push(
      bakeDiagnostic(
        'FLAG-STALE',
        'sourceDigest',
        'the flag list describes a different revision; regenerate the triage',
      ),
    );
  }
  if (flagList.reviewer.model === draftingModel) {
    out.push(
      bakeDiagnostic(
        'FLAG-REVIEWER-IS-DRAFTER',
        'reviewer.model',
        'the reviewer must differ from the drafting system',
      ),
    );
  }
  const seen = new Set<string>();
  for (const flag of flagList.flags) {
    if (seen.has(flag.ref))
      out.push(bakeDiagnostic('FLAG-DUP-REF', flag.id, `two flags for ${flag.ref}`));
    seen.add(flag.ref);
    if (!FLAG_CATEGORIES.includes(flag.category as FlagCategory)) {
      out.push(
        bakeDiagnostic(
          'FLAG-UNKNOWN-CATEGORY',
          flag.id,
          `category ${flag.category} is outside the closed enum`,
        ),
      );
    }
    const known =
      flag.target === 'line' ? flag.ref in conversation.lines : flag.ref in conversation.gloss;
    if (!known)
      out.push(
        bakeDiagnostic('FLAG-REF-UNKNOWN', flag.id, `ref ${flag.ref} matches no ${flag.target}`),
      );
    if (flag.status === 'open')
      out.push(bakeDiagnostic('FLAG-OPEN', flag.id, 'an open flag remains'));
  }
  return out;
}

/** A gloss key from span text, so a flag list can address a gloss by its ref. */
export function glossRef(spanText: string): string {
  return normalizeSpan(spanText);
}
