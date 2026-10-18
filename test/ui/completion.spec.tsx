import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App.tsx';
import { createFakeEngine } from '../helpers/fake-engine.ts';
import { fixtureConversation } from '../helpers/sources.ts';

afterEach(cleanup);

/**
 * The completion state and whole-conversation playback
 * (D4 §17, AC-UI-32/33/35).
 */

function nextButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
}

/** Take the first option at every choice beat, advancing between them. */
function composeAllDecisions(): void {
  for (let decision = 0; decision < 4; decision += 1) {
    const cards = document.querySelectorAll<HTMLButtonElement>('.choice-cards .option-choose');
    if (cards.length === 0) return;
    fireEvent.click(cards[0]!);
    for (let step = 0; step < 4; step += 1) {
      if (document.querySelectorAll('.choice-cards').length > 0) break;
      if (nextButton().disabled) break;
      fireEvent.click(nextButton());
    }
  }
  // Reveal the closing beats so every beat is resolved.
  for (let step = 0; step < 4; step += 1) {
    if (nextButton().disabled) break;
    fireEvent.click(nextButton());
  }
}

function renderApp(delay?: (ms: number) => Promise<void>) {
  const engine = createFakeEngine();
  return render(
    <App
      conversation={fixtureConversation()}
      createEngine={() => engine}
      delay={delay ?? (async () => undefined)}
    />,
  );
}

describe('completion and playback (D4 §17)', () => {
  it('AC-UI-32: the panel appears only once every beat is resolved', () => {
    renderApp();
    expect(document.querySelector('.completion')).toBeNull();

    composeAllDecisions();
    expect(document.querySelector('.completion')).toBeTruthy();
    expect(document.body.textContent).toContain('Your conversation is ready');
    // The chain of decisions, one step per choice beat.
    expect(document.querySelectorAll('.decision-step')).toHaveLength(4);
    expect(document.querySelectorAll('.decision-option.chosen')).toHaveLength(4);
  });

  it('AC-UI-32: tapping the other option re-derives downstream and returns to composing', () => {
    renderApp();
    composeAllDecisions();

    const alternatives = [
      ...document.querySelectorAll<HTMLButtonElement>('.decision-option:not(.chosen)'),
    ];
    expect(alternatives.length).toBeGreaterThan(0);
    const before = document.body.textContent ?? '';
    fireEvent.click(alternatives[0]!);

    // The domain clears the downstream choices the new assignment invalidates
    // (D2 §10), so the conversation is no longer complete: the transcript
    // changes and the panel closes to re-prompt. That is the specified
    // behaviour, not a regression — the learner re-makes the affected steps.
    expect(document.body.textContent).not.toBe(before);
    expect(document.querySelector('.completion')).toBeNull();
    expect(document.querySelectorAll('.choice-cards').length).toBeGreaterThan(0);
  });

  it('AC-UI-33: Play hides the panel and the ghosts, and marks the active beat', () => {
    // A delay that never resolves parks the playback loop on its first beat, so
    // the play-mode state can be asserted without racing the loop to the end.
    renderApp(() => new Promise<void>(() => undefined));
    composeAllDecisions();
    expect(document.querySelector('.ghost-option')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Play the whole conversation/ }));

    expect(document.querySelector('.completion')).toBeNull();
    expect(document.querySelector('.ghost-option')).toBeNull();
    expect(document.querySelectorAll('.beat-row[data-active="true"]')).toHaveLength(1);
  });

  it('AC-UI-35: an option icon is resolved from its own beat, not conversation-wide', () => {
    renderApp();
    // b2's first option carries an icon in the built conversation.
    const icons = [...document.querySelectorAll('.option-icon')].map((node) => node.textContent);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons[0]).toBe('🍽️');
  });

  it('AC-UI-35: a label renders in the learner language, not positionally in l1', () => {
    // Forward: the learner language is l1, so the label is the l1 label.
    renderApp();
    expect(document.querySelector('.option-choose')?.textContent).toContain('Dinner');
    cleanup();

    // Reversed: the learner language is l2, so the same option reads 'Cena'.
    const engine = createFakeEngine();
    render(
      <App
        conversation={fixtureConversation()}
        createEngine={() => engine}
        uiLang="es"
        delay={async () => undefined}
      />,
    );
    expect(document.querySelector('.option-choose')?.textContent).toContain('Cena');
  });
});
