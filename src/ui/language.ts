/**
 * The learner's language pair, projected onto a conversation's language pair.
 *
 * Three language concepts exist and only two are in the content model:
 *
 *   1. the learner's native language   (a choice, persisted)
 *   2. the learner's study language    (a choice, persisted)
 *   3. the conversation's `l1`/`l2`    (authored, fixed)
 *
 * A conversation is authored in two languages, so the learner may read it in
 * either direction: `en -> es` and `es -> en` are both valid uses of the same
 * content. Everything here is a pure projection from (conversation, native) to
 * the *positional* channels the domain already speaks (`l1`/`l2`), which is why
 * the domain needs no change at all.
 */

import type { Channel, Conversation, Preferences } from '../domain/types.ts';

/** Display names for language codes. Localized later; English for now. */
const LANG_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
};

export function langName(code: string): string {
  return LANG_NAMES[code] ?? code.toUpperCase();
}

/** True when the learner's native language is the conversation's second language. */
export function isReversed(conversation: Conversation, native: string): boolean {
  return conversation.l2 === native && conversation.l1 !== native;
}

/** The channel carrying the learner's native language. */
export function nativeChannel(conversation: Conversation, native: string): Channel {
  return isReversed(conversation, native) ? 'l2' : 'l1';
}

/** The channel carrying the language being learned. */
export function studyChannel(conversation: Conversation, native: string): Channel {
  return isReversed(conversation, native) ? 'l1' : 'l2';
}

/**
 * The posture a pair implies: hear the language being learned, read both.
 * Reading both keeps the L2 text present, which is what makes the hover gloss
 * reachable at all.
 */
export function derivedPrefs(conversation: Conversation, native: string): Partial<Preferences> {
  return { read: 'both', hear: studyChannel(conversation, native) };
}
