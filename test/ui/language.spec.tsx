import { describe, expect, it } from 'vitest';
import {
  derivedPrefs,
  isReversed,
  langName,
  nativeChannel,
  studyChannel,
} from '../../src/ui/language.ts';
import { fixtureConversation } from '../helpers/sources.ts';

/**
 * The pair projection (D4 §16.3, AC-UI-30).
 *
 * A conversation is authored in two languages, so both directions are valid uses
 * of the same content. Everything here is a projection onto the conversation's
 * *positional* channels, which is why the domain needed no change.
 */
describe('pair projection (D4 §16.3)', () => {
  const c = fixtureConversation();

  it('AC-UI-30: the forward orientation maps native to l1 and study to l2', () => {
    expect(isReversed(c, c.l1)).toBe(false);
    expect(nativeChannel(c, c.l1)).toBe('l1');
    expect(studyChannel(c, c.l1)).toBe('l2');
  });

  it('AC-UI-30: the reversed orientation swaps them', () => {
    expect(isReversed(c, c.l2)).toBe(true);
    expect(nativeChannel(c, c.l2)).toBe('l2');
    expect(studyChannel(c, c.l2)).toBe('l1');
  });

  it('AC-UI-30: derivedPrefs reads both and hears the study language, in both directions', () => {
    expect(derivedPrefs(c, c.l1)).toEqual({ read: 'both', hear: 'l2' });
    expect(derivedPrefs(c, c.l2)).toEqual({ read: 'both', hear: 'l1' });
  });

  it('AC-UI-30: an unknown language is not treated as reversed', () => {
    expect(isReversed(c, 'zz')).toBe(false);
  });

  it('AC-UI-30: language display names fall back to the code, never to undefined', () => {
    expect(langName('es')).toBe('Spanish');
    expect(langName('zz')).toBe('ZZ');
  });
});
