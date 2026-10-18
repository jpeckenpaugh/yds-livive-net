import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App.tsx';
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

describe('keyboard (D4 §11, AC-UI-17/18)', () => {
  it('AC-UI-17: H toggles the hint, ? opens the help, and Esc closes and restores focus', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());

    const toggle = screen.getByRole('switch') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.keyDown(document, { key: 'h' });
    await waitFor(() =>
      expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false),
    );

    // Open via the button so there is a trigger to restore focus to.
    const trigger = screen.getByText('Keyboard help');
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByText('Keyboard')).toBeTruthy());
    expect(screen.getByText('Space')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Keyboard')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('AC-UI-18: Space does not scroll the transcript and no shortcut fires while a dialog owns focus', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());

    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true });
    document.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);

    fireEvent.keyDown(document, { key: '?' });
    await waitFor(() => expect(screen.getByText('Keyboard')).toBeTruthy());
    const before = (screen.getByRole('switch') as HTMLInputElement).checked;
    fireEvent.keyDown(document, { key: 'h' });
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(before);
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getAllByRole('dialog').length).toBe(1);
  });
});
