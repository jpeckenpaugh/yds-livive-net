import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Shell } from '../../src/ui/Shell.tsx';
import { createFakeEngine } from '../helpers/fake-engine.ts';

/**
 * The shell: routing, the welcome screen, the list, and persistence
 * (D4 §16, AC-UI-28/29/31/34).
 */

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderShell() {
  const engine = createFakeEngine();
  return render(<Shell createEngine={() => engine} />);
}

function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
}

describe('the shell (D4 §16)', () => {
  it('AC-UI-28: first run shows Welcome, Start reaches the list, opening reaches the conversation', async () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(document.querySelector('.transcript')).toBeNull();

    start();
    await waitFor(() => expect(screen.getByText('Conversations')).toBeTruthy());

    fireEvent.click(screen.getByText('Making Plans'));
    await waitFor(() => expect(document.querySelector('.transcript')).toBeTruthy());
  });

  it('AC-UI-29: Welcome offers two selects and both lists come from the catalog', () => {
    renderShell();
    const selects = document.querySelectorAll<HTMLSelectElement>('.field select');
    expect(selects).toHaveLength(2);

    // Every option is a language the catalog actually has content for.
    const natives = [...selects[0]!.options].map((option) => option.value);
    expect(natives).toContain('en');
    expect(natives).toContain('es');

    const studies = [...selects[1]!.options].map((option) => option.value);
    expect(studies.length).toBeGreaterThan(0);
    // The same language cannot be studied and spoken at once.
    expect(studies).not.toContain('en');
  });

  it('AC-UI-29: the labels are role-named, never primary/secondary', () => {
    renderShell();
    const labels = [...document.querySelectorAll('.field-label')].map((node) => node.textContent);
    expect(labels).toEqual(['I speak', "I'm learning"]);
  });

  it('AC-UI-31: the list is filtered by pair and shows progress', async () => {
    renderShell();
    start();
    await waitFor(() => expect(screen.getByText('Making Plans')).toBeTruthy());
    expect(document.body.textContent).toContain('1 of 10 beats · 0 of 4 decisions');
    expect(document.querySelector('.conversation-bar')).toBeTruthy();
  });

  it('AC-UI-31: a pair with no content gets an honest empty state', () => {
    localStorage.setItem(
      'yds.v1',
      JSON.stringify({ seenWelcome: true, native: 'fr', study: 'en', prefs: {}, sessions: {} }),
    );
    renderShell();
    expect(document.querySelector('.conversation-open')).toBeNull();
    expect(document.querySelector('.empty')?.textContent).toContain('No conversations for');
  });

  it('AC-UI-34: completing Welcome persists the pair under the documented key', async () => {
    renderShell();
    start();
    await waitFor(() => expect(screen.getByText('Conversations')).toBeTruthy());

    const stored = JSON.parse(localStorage.getItem('yds.v1') ?? '{}') as Record<string, unknown>;
    expect(stored.seenWelcome).toBe(true);
    expect(stored.native).toBe('en');
    expect(stored.study).toBe('es');
  });

  it('AC-UI-34: a stored session resumes, and shows as progress in the list', () => {
    localStorage.setItem(
      'yds.v1',
      JSON.stringify({
        seenWelcome: true,
        native: 'en',
        study: 'es',
        prefs: {},
        sessions: {
          'm1-fixture': { cursor: 'b1', revealed: 'b2', choices: { b2: 'dinner' } },
        },
      }),
    );
    renderShell();
    expect(document.body.textContent).toContain('2 of 10 beats · 1 of 4 decisions');
  });

  it('AC-UI-34: a corrupt stored value falls back to defaults instead of breaking the app', () => {
    localStorage.setItem('yds.v1', '{ not json at all');
    renderShell();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });
});
