import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { App } from '../../src/ui/App.tsx';
import { animateInMs } from '../../src/ui/components.tsx';
import { fixtureConversation } from '../helpers/sources.ts';
import { createFakeEngine } from '../helpers/fake-engine.ts';

afterEach(cleanup);

function renderApp() {
  return render(
    <App
      conversation={fixtureConversation()}
      createEngine={() => createFakeEngine()}
      delay={async () => undefined}
    />,
  );
}

describe('accessibility (D4 §11.4, §12)', () => {
  it('AC-UI-21: a gloss is reachable by hover and by keyboard and is the accessible description', async () => {
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    const glossable = container.querySelector('.glossable');
    expect(glossable).toBeTruthy();
    const describedby = glossable?.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    const description = container.querySelector(`#${describedby}`);
    expect(description?.textContent?.length ?? 0).toBeGreaterThan(0);

    fireEvent.mouseEnter(glossable as Element);
    await waitFor(() => expect(container.querySelector('.gloss-popover')).toBeTruthy());

    fireEvent.focus(glossable as Element);
    expect(container.querySelector('.gloss-popover')).toBeTruthy();
  });

  it('AC-UI-22: the transcript has no structural a11y violations (jsdom half)', async () => {
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('AC-UI-26: prefers-reduced-motion sets ANIMATE_IN_MS to 0', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    expect(animateInMs()).toBe(0);
    window.matchMedia = original;
  });
});
