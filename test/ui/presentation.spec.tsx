import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as C from '../../src/ui/components.tsx';
import { App } from '../../src/ui/App.tsx';
import { visibility } from '../../src/domain/visibility.ts';
import type { Channel, Preferences } from '../../src/domain/types.ts';
import { fixtureConversation } from '../helpers/sources.ts';
import { createFakeEngine } from '../helpers/fake-engine.ts';

afterEach(cleanup);

const CHANNELS: Channel[] = ['l1', 'l2', 'both', 'none'];

function renderApp(prefs: Partial<Preferences> = {}) {
  const engine = createFakeEngine();
  return {
    engine,
    ...render(
      <App conversation={fixtureConversation()} createEngine={() => engine} initialPrefs={prefs} />,
    ),
  };
}

function rowFor(name: string): HTMLElement {
  const label = screen.getByText(name);
  const row = label.closest('li');
  if (!row) throw new Error(`no beat row for ${name}`);
  return row as HTMLElement;
}

describe('presentation (D4 §3, §5)', () => {
  it('AC-UI-01: every component in the D4 §3 tree exists', () => {
    const names = [
      'SkipToContent',
      'Transport',
      'AudioStatus',
      'Toolbar',
      'ReadChannelControl',
      'HearChannelControl',
      'HintToggle',
      'SpeedControl',
      'VoiceAndAboutMenu',
      'AudioNotice',
      'Transcript',
      'BeatRow',
      'SpeakerLabel',
      'HintLine',
      'DialogueLine',
      'L2NotSpokenMarker',
      'ChoiceCards',
      'OptionCard',
      'PreviewButton',
      'GhostOptions',
      'UnreachableTailNote',
      'WhatIfPanel',
      'GlossPopover',
      'LicensesDialog',
      'VoiceOverridesDialog',
      'KeyboardHelpDialog',
    ];
    for (const name of names) {
      expect(typeof (C as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('AC-UI-02: no component branches on prefs.read/prefs.hear; presentation uses visibility()', () => {
    const raw = import.meta.glob<string>('../../src/ui/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    for (const [file, text] of Object.entries(raw)) {
      expect(text, file).not.toMatch(/prefs\.(read|hear)\s*===/);
    }
  });

  it('AC-UI-03: all 32 preference states render per §5.2, including the silent rows', async () => {
    let states = 0;
    for (const read of CHANNELS) {
      for (const hear of CHANNELS) {
        for (const hint of [true, false]) {
          states += 1;
          const { unmount } = renderApp({ read, hear, hint });
          await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
          const row = rowFor('Ron');
          const expected = visibility({
            read,
            hear,
            hint,
            speed: 1,
            voiceOverrides: {},
            playAnyway: false,
          });
          expect(
            row.textContent?.includes('Ron wants to make plans'),
            `${read}/${hear}/${hint} hint`,
          ).toBe(expected.showHint);
          expect(row.textContent?.includes('Hola Bobby'), `${read}/${hear}/${hint} L2`).toBe(
            expected.showL2,
          );
          expect(row.textContent?.includes('Hi Bobby'), `${read}/${hear}/${hint} L1`).toBe(
            expected.showL1,
          );
          // The row is never skipped, even when it has no text at all.
          expect(row.classList.contains('beat-row')).toBe(true);
          unmount();
        }
      }
    }
    expect(states).toBe(32);
  });

  it('AC-UI-09: option labels render in at least L1 at every read setting', async () => {
    for (const read of CHANNELS) {
      const { unmount } = renderApp({ read, hear: 'none', hint: false });
      await waitFor(() => expect(screen.getByText('Dinner')).toBeTruthy());
      expect(screen.getByText('Dinner')).toBeTruthy();
      expect(screen.getByText('Movie')).toBeTruthy();
      unmount();
    }
  });

  it('AC-UI-19: no aria-live contains dialogue, and exactly one role="status" exists', async () => {
    const { container } = renderApp({ read: 'both', hear: 'both', hint: true });
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    const statuses = container.querySelectorAll('[role="status"]');
    expect(statuses.length).toBe(1);
    const live = container.querySelectorAll('[aria-live]');
    expect(live.length).toBe(1);
    for (const node of live) expect(node.textContent ?? '').not.toContain('Hola Bobby');
  });

  it('AC-UI-20: L2 nodes carry lang=l2 and L1 nodes lang=l1', async () => {
    const { container } = renderApp({ read: 'both', hear: 'none', hint: true });
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    const l2 = container.querySelectorAll('[lang="es"]');
    const l1 = container.querySelectorAll('[lang="en"]');
    expect(l2.length).toBeGreaterThan(0);
    expect(l1.length).toBeGreaterThan(0);
  });

  it('AC-UI-23: the Licences dialog names licences by purpose and states OpenRAIL-M restrictions', async () => {
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByText('Licences')).toBeTruthy());
    screen.getByText('Licences').click();
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
    const text = container.querySelector('[role="dialog"]')?.textContent ?? '';
    expect(text).toContain('OpenRAIL-M');
    expect(text).toContain('MIT');
    expect(text).toContain('Apache-2.0');
    expect(text).toMatch(/use-restricted|restricts|forbids/i);
    for (const forbidden of ['Supertonic', 'OPUS', 'opus-mt', 'transformers', 'sherpa']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('AC-UI-24: no preparing state, spinner or per-line progress exists', async () => {
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/preparing/i);
  });

  it('AC-UI-25: the first beat does not autoplay; the app loads idle', async () => {
    const { engine } = renderApp();
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    expect(engine.spoken).toEqual([]);
    expect(screen.getByLabelText('Play')).toBeTruthy();
  });

  it('AC-UI-27: option icons render as decoration, never load-bearing', async () => {
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByText('Dinner')).toBeTruthy());
    const icons = container.querySelectorAll('.option-icon');
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
    // The icon is not part of the accessible name.
    const card = screen.getByText('Dinner').closest('button');
    expect(card?.textContent).toContain('Dinner');
    expect(card?.getAttribute('aria-hidden')).toBeNull();
  });
});
