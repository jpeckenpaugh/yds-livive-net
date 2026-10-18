import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App.tsx';
import { Scheduler, stepsForLine } from '../../src/ui/scheduler.ts';
import { GAP_L2_TO_L1_MS } from '../../src/ui/constants.ts';
import { DEFAULT_PREFS } from '../../src/ui/store.ts';
import { resolveTimeline } from '../../src/domain/resolve.ts';
import { initialSession } from '../../src/domain/session.ts';
import { visibility } from '../../src/domain/visibility.ts';
import type { ResolvedBeat } from '../../src/domain/types.ts';
import type { TtsEngine } from '../../src/engines/ports.ts';
import { fixtureConversation } from '../helpers/sources.ts';
import { createFakeEngine } from '../helpers/fake-engine.ts';

afterEach(cleanup);

function firstBeat(): ResolvedBeat {
  const beat = resolveTimeline(fixtureConversation(), initialSession(fixtureConversation())).find(
    (candidate) => candidate.beatId === 'b1',
  );
  if (!beat) throw new Error('no b1');
  return beat;
}

function renderApp(prefs = {}) {
  const engine = createFakeEngine();
  return {
    engine,
    ...render(
      <App
        conversation={fixtureConversation()}
        createEngine={() => engine}
        initialPrefs={prefs}
        delay={async () => undefined}
      />,
    ),
  };
}

describe('playback (D4 §6)', () => {
  it('AC-UI-05: hear both plays L2 then L1 separated by GAP_L2_TO_L1_MS', async () => {
    const c = fixtureConversation();
    const beat = firstBeat();
    const both = visibility({ ...DEFAULT_PREFS, hear: 'both' });
    expect(stepsForLine(beat.line!, beat, c, both).map((step) => step.lang)).toEqual(['es', 'en']);

    const engine = createFakeEngine();
    const gaps: number[] = [];
    const scheduler = new Scheduler({
      engine,
      conversation: c,
      getPrefs: () => ({ ...DEFAULT_PREFS, hear: 'both' }),
      delay: async (ms) => {
        gaps.push(ms);
      },
    });
    await scheduler.playBeat(beat, both);
    expect(gaps).toEqual([GAP_L2_TO_L1_MS]);
    expect(engine.spoken).toEqual([beat.line?.l2, beat.line?.l1]);
  });

  it('AC-UI-04: hear none produces no utterances and therefore no advance', async () => {
    const { engine, container } = renderApp({ hear: 'none' });
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    screen.getByLabelText('Play').click();
    await waitFor(() => expect(engine.spoken).toEqual([]));
    expect(container.querySelector('.beat-counter')?.textContent).toContain('Beat 1 of 10');
  });

  it('AC-UI-04: autoplay advances when audio actually played', async () => {
    const { container } = renderApp({ hear: 'l2' });
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    screen.getByLabelText('Play').click();
    await waitFor(() =>
      expect(container.querySelector('.beat-counter')?.textContent).toContain('Beat 2 of 10'),
    );
  });

  it('AC-UI-06: a hear change stops and replays the current beat; a read change does not', async () => {
    const engine = createFakeEngine();
    render(
      <App
        conversation={fixtureConversation()}
        createEngine={() => engine}
        initialPrefs={{ hear: 'l2', read: 'l2' }}
        delay={() => new Promise<void>(() => undefined)}
      />,
    );
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    screen.getByLabelText('Play').click();
    await waitFor(() => expect(engine.spoken.length).toBe(1));
    const afterPlay = engine.spoken.length;

    const hearGroup = screen.getByRole('group', { name: 'Hear' });
    fireEvent.click(within(hearGroup).getByLabelText('Both'));
    await waitFor(() => expect(engine.spoken.length).toBeGreaterThan(afterPlay));
    const afterHear = engine.spoken.length;

    const readGroup = screen.getByRole('group', { name: 'Read' });
    fireEvent.click(within(readGroup).getByLabelText('Both'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(engine.spoken.length).toBe(afterHear);
  });

  it('AC-UI-07: pause is beat-granular; resume replays the current beat from its start', async () => {
    const c = fixtureConversation();
    const beat = firstBeat();
    const engine = createFakeEngine();
    const scheduler = new Scheduler({ engine, conversation: c, getPrefs: () => DEFAULT_PREFS });
    await scheduler.playBeat(beat, visibility(DEFAULT_PREFS));
    scheduler.stop();
    await scheduler.playBeat(beat, visibility(DEFAULT_PREFS));
    expect(engine.spoken).toEqual([beat.line?.l2, beat.line?.l2]);
  });

  it('AC-UI-08: transport actions serialise through one queue and never interleave', async () => {
    const c = fixtureConversation();
    const beat = firstBeat();
    const order: string[] = [];
    const base = createFakeEngine();
    const engine: TtsEngine = {
      ...base,
      async synth(req) {
        order.push(`synth:${req.text}`);
        return {
          kind: 'native',
          key: 'k',
          durationMs: null,
          async play() {
            order.push(`play:${req.text}`);
          },
          stop() {
            return undefined;
          },
        };
      },
    };
    const scheduler = new Scheduler({ engine, conversation: c, getPrefs: () => DEFAULT_PREFS });
    const first = scheduler.playBeat(beat, visibility(DEFAULT_PREFS));
    const second = scheduler.playBeat(beat, visibility(DEFAULT_PREFS));
    await Promise.all([first, second]);
    // The first queue is cancelled before it can play; the second plays exactly once.
    expect(order.filter((entry) => entry.startsWith('play:'))).toEqual([`play:${beat.line?.l2}`]);
  });

  it('AC-UI-10: preview plays the option line and leaves the session unchanged', async () => {
    const { engine, container } = renderApp({ hear: 'l2' });
    await waitFor(() => expect(screen.getByText('Dinner')).toBeTruthy());
    const previews = screen.getAllByText('Preview');
    previews[0]?.click();
    await waitFor(() => expect(engine.spoken.length).toBe(1));
    // Still pending: the cards are present and no ghost has appeared.
    expect(screen.getByText('Dinner')).toBeTruthy();
    expect(container.querySelector('.ghost-options')).toBeNull();
  });

  it('AC-UI-11: unchosen options stay visible and replayable, and replay changes nothing', async () => {
    const { engine, container } = renderApp({ hear: 'l2' });
    await waitFor(() => expect(screen.getByText('Dinner')).toBeTruthy());
    screen.getByText('Dinner').closest('button')?.click();
    await waitFor(() => expect(container.querySelector('.ghost-option')).toBeTruthy());
    expect(container.querySelector('.ghost-option')?.textContent).toContain('Movie');
    const before = engine.spoken.length;
    const replay = container.querySelector('.ghost-option button') as HTMLButtonElement;
    replay.click();
    await waitFor(() => expect(engine.spoken.length).toBeGreaterThan(before));
    // Session unchanged: the beat is still resolved with the same ghost.
    expect(container.querySelector('.ghost-option')?.textContent).toContain('Movie');
    expect(container.querySelector('.choice-cards')).toBeNull();
  });

  it('AC-UI-13: WhatIfPanel resolves with autoPick, mutates nothing until "make this real"', async () => {
    const { container } = renderApp({ hear: 'none' });
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    screen.getByText('Dinner').closest('button')?.click();
    await waitFor(() => expect(container.querySelector('.ghost-option')).toBeTruthy());

    fireEvent.keyDown(document, { key: 'w' });
    await waitFor(() => expect(screen.getByText('What if')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Movie' }));
    await waitFor(() => expect(screen.getAllByText(/auto-picked/).length).toBeGreaterThan(0));
    // The read-only view did not change the transcript's resolved beat.
    expect(container.querySelector('.ghost-option')?.textContent).toContain('Movie');

    fireEvent.click(screen.getAllByText('Make this real')[0] as HTMLElement);
    await waitFor(() =>
      expect(container.querySelector('.ghost-option')?.textContent).toContain('Dinner'),
    );
  });

  it('AC-UI-12: no unreached beat renders content; the invalidated tail is a count', async () => {
    const { container } = renderApp({ hear: 'none' });
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    screen.getByText('Dinner').closest('button')?.click();
    await waitFor(() => expect(container.querySelector('.ghost-option')).toBeTruthy());
    fireEvent.keyDown(document, { key: 'w' });
    await waitFor(() => expect(screen.getByText('What if')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Movie' }));
    fireEvent.click(screen.getAllByText('Make this real')[0] as HTMLElement);
    await waitFor(() => expect(container.querySelector('.unreachable-tail')).toBeTruthy());
    expect(container.querySelector('.unreachable-tail')?.textContent).toMatch(
      /\d+ later beats were reset/,
    );
    for (const row of container.querySelectorAll('li[data-status="unreached"]')) {
      expect(row.querySelector('.dialogue-line')).toBeNull();
      expect(row.querySelector('.choice-cards')).toBeNull();
    }
  });
});
