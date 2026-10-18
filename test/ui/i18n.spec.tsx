import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App.tsx';
import { audioState } from '../../src/ui/audio-state.ts';
import { messagesFor, plural } from '../../src/ui/i18n/index.ts';
import { es } from '../../src/ui/i18n/es.ts';
import { en } from '../../src/ui/i18n/messages.ts';
import { SHORTCUTS, shortcutAction } from '../../src/ui/keys.ts';
import { M1_LICENCES, OPENRAIL_RESTRICTIONS } from '../../src/ui/licenses.ts';
import { createFakeEngine } from '../helpers/fake-engine.ts';
import { fixtureConversation } from '../helpers/sources.ts';

afterEach(cleanup);

/**
 * Chrome localization (D4 §18, AC-I18N-*).
 *
 * The catalogs are typed, so completeness is a compile-time property; these
 * assertions cover the parts a type cannot express — that the *right* catalog is
 * selected, that plurals agree, that no prose leaks out of `audio-state`, and
 * that licence terms are not translated.
 */
describe('chrome localization (D4 §18)', () => {
  it('AC-I18N-01: the catalog follows the chosen native language', () => {
    expect(messagesFor('es')).toBe(es);
    expect(messagesFor('en')).toBe(en);
    // A language with no catalog falls back rather than rendering blanks.
    expect(messagesFor('zz')).toBe(en);
  });

  it('AC-I18N-02: the catalogs are shape-identical, member for member', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(typeof es[key]).toBe(typeof en[key]);
    }
  });

  it('AC-I18N-03: plural forms are selected by count and the Spanish verb agrees', () => {
    expect(en.laterBeatsReset(1)).toContain('1 later beat was');
    expect(en.laterBeatsReset(3)).toContain('3 later beats were');
    // The verb, not just the noun: this is why a template cannot express it.
    expect(es.laterBeatsReset(1)).toContain('Se restableció 1 turno');
    expect(es.laterBeatsReset(3)).toContain('Se restablecieron 3 turnos');
    expect(plural(1, 'one', 'other')).toBe('one');
    expect(plural(0, 'one', 'other')).toBe('other');
    expect(plural(2, 'one', 'other')).toBe('other');
  });

  it('AC-I18N-04: audio-state returns an identity plus parameters, never a sentence', () => {
    const state = audioState({
      hasApi: true,
      l2Voice: null,
      l1Voice: 'Samantha',
      playAnyway: false,
      l2: 'es',
    });
    expect(state.notice).toEqual({ id: 'no-l2-voice', lang: 'es' });
    expect(state.action).toBe('play-anyway');
    // No prose anywhere in the derived state, in any branch.
    const branches = [
      state,
      audioState({ hasApi: false, l2Voice: null, l1Voice: null, playAnyway: false, l2: 'es' }),
      audioState({ hasApi: true, l2Voice: 'x', l1Voice: 'y', playAnyway: true, l2: 'es' }),
    ];
    for (const branch of branches) {
      expect(JSON.stringify(branch)).not.toMatch(/voice is|is not being|unavailable/i);
    }
  });

  it('AC-I18N-05: language names are localized, and messages resolve them rather than assuming', () => {
    expect(en.languageName('es')).toBe('Spanish');
    expect(es.languageName('es')).toBe('Español');
    expect(en.languageName('en')).toBe('English');
    expect(es.languageName('en')).toBe('Inglés');
    // The name is passed in, so the sentence can inflect it.
    expect(es.audioNoL2Voice(es.languageName('es'))).toContain('Español');
    expect(en.audioNoL2Voice(en.languageName('es'))).toContain('Spanish');
  });

  it('AC-I18N-06: documentElement.lang follows the UI language', () => {
    const engine = createFakeEngine();
    render(
      <App
        conversation={fixtureConversation()}
        createEngine={() => engine}
        uiLang="es"
        delay={async () => undefined}
      />,
    );
    expect(document.documentElement.lang).toBe('es');
  });

  it('AC-I18N-07: licence identifiers and the restriction text are verbatim in every language', () => {
    expect(M1_LICENCES.map((entry) => entry.licence)).toEqual(['OpenRAIL-M', 'MIT', 'Apache-2.0']);
    expect(OPENRAIL_RESTRICTIONS.startsWith('OpenRAIL-M is a use-restricted licence.')).toBe(true);
    // The terms are not in either catalog, so no translation of them can ship.
    for (const catalog of [en, es]) {
      expect(Object.values(catalog).join(' ')).not.toContain('use-restricted licence');
    }
  });

  it('AC-I18N-07: key names are not translated, only the described action', () => {
    expect(SHORTCUTS.map((s) => s.keys)).toContain('Space');
    expect(shortcutAction(en, SHORTCUTS[0]!)).toBe(en.shortcutPlayPause);
    expect(shortcutAction(es, SHORTCUTS[0]!)).toBe(es.shortcutPlayPause);
    expect(shortcutAction(es, SHORTCUTS[0]!)).not.toBe(en.shortcutPlayPause);
  });

  it('AC-I18N-08: uiLang en leaves the chrome exactly as it was, and es changes it', () => {
    const engine = createFakeEngine();
    const { unmount } = render(
      <App
        conversation={fixtureConversation()}
        createEngine={() => engine}
        delay={async () => undefined}
      />,
    );
    // Defaults to the conversation's first language: unchanged chrome.
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByText('Hints')).toBeTruthy();
    unmount();

    render(
      <App
        conversation={fixtureConversation()}
        createEngine={() => engine}
        uiLang="es"
        delay={async () => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeTruthy();
    expect(screen.getByText('Pistas')).toBeTruthy();
  });
});
