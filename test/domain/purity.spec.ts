import { describe, expect, it } from 'vitest';
import { resolveTimeline } from '../../src/domain/resolve.ts';
import { initialSession, reduce } from '../../src/domain/session.ts';
import { visibility } from '../../src/domain/visibility.ts';
import { fixtureConversation } from '../helpers/sources.ts';

const domainRaw = import.meta.glob<string>('../../src/domain/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('purity (AC-DOM-02)', () => {
  it('same inputs produce deep-equal outputs', () => {
    const c = fixtureConversation();
    const session = initialSession(c);
    expect(resolveTimeline(c, session)).toEqual(resolveTimeline(c, session));
    expect(reduce(c, session, { type: 'advance' })).toEqual(
      reduce(c, session, { type: 'advance' }),
    );
    const prefs = {
      read: 'both',
      hear: 'both',
      hint: true,
      speed: 1,
      voiceOverrides: {},
      playAnyway: false,
    } as const;
    expect(visibility(prefs)).toEqual(visibility(prefs));
  });

  it('the domain modules reference no DOM, fetch, Date, Math.random or mutable module state', () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /\bDate\b/,
      /Math\.random/,
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
    ];
    const files = Object.entries(domainRaw);
    expect(files.length).toBeGreaterThan(5);
    for (const [file, raw] of files) {
      // Strip comments so prose about `Date` or `window` is not a false positive.
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${file} matches ${String(pattern)}`).toBe(false);
      }
    }
  });
});
