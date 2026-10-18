/**
 * The conversation catalog.
 *
 * One entry per authored conversation. A conversation declares its own language
 * pair (`l1`/`l2`); the learner's pair is a *choice* that must map onto it. Both
 * languages exist in the content, so a single conversation serves two learner
 * populations — see `language.ts` for the projection.
 *
 * The catalog is what the Welcome screen and the Conversations list read, so the
 * language picker can only ever offer pairs that have content. That is what stops
 * onboarding from dead-ending on an empty list.
 */

import type { Conversation } from '../domain/types.ts';
import { CONVERSATIONS } from './conversation.ts';

export type CatalogEntry = {
  id: string;
  title: string;
  l1: string;
  l2: string;
  conversation: Conversation;
};

export const CATALOG: CatalogEntry[] = CONVERSATIONS.map((conversation) => ({
  id: conversation.id,
  title: conversation.title,
  l1: conversation.l1,
  l2: conversation.l2,
  conversation,
}));

export function entryById(id: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.id === id);
}

/** Conversations usable by a learner with this pair, in either orientation. */
export function conversationsFor(native: string, study: string): CatalogEntry[] {
  return CATALOG.filter(
    (entry) =>
      (entry.l1 === native && entry.l2 === study) || (entry.l1 === study && entry.l2 === native),
  );
}

/** Native languages that have at least one conversation. */
export function nativeOptions(): string[] {
  const codes = new Set<string>();
  for (const entry of CATALOG) {
    codes.add(entry.l1);
    codes.add(entry.l2);
  }
  return [...codes].sort();
}

/** Study languages available to someone who already speaks `native`. */
export function studyOptions(native: string): string[] {
  const codes = new Set<string>();
  for (const entry of CATALOG) {
    if (entry.l1 === native) codes.add(entry.l2);
    if (entry.l2 === native) codes.add(entry.l1);
  }
  return [...codes].sort();
}
