import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App.tsx';
import { audioState } from '../../src/ui/audio-state.ts';
import { fixtureConversation } from '../helpers/sources.ts';
import { createFakeEngine } from '../helpers/fake-engine.ts';
import { installSpeechSynthesisMock } from '../helpers/speech-synthesis-mock.ts';
import { createSpeechSynthesisEngine } from '../../src/engines/tts/speech-synthesis.ts';

afterEach(cleanup);

const BASE = { l2: 'es', l1: 'en' };

describe('G1/G2 state machine (D4 §9, AC-UI-14/15/16)', () => {
  // AC-ENG-06 is asserted in the UI direction here (the independence line).
  it('AC-UI-14: the four states and the five transitions hold', () => {
    expect(
      audioState({
        ...BASE,
        hasApi: true,
        l2Voice: 'Mónica',
        l1Voice: 'Samantha',
        playAnyway: false,
      }).name,
    ).toBe('voice-ok');
    expect(
      audioState({ ...BASE, hasApi: true, l2Voice: null, l1Voice: 'Samantha', playAnyway: false })
        .name,
    ).toBe('no-l2-voice');
    expect(
      audioState({ ...BASE, hasApi: true, l2Voice: null, l1Voice: 'Samantha', playAnyway: true })
        .name,
    ).toBe('play-anyway');
    expect(
      audioState({ ...BASE, hasApi: false, l2Voice: null, l1Voice: null, playAnyway: false }).name,
    ).toBe('engine-absent');
    // no-l2-voice → voice-ok when an L2 voice appears, even with playAnyway set.
    expect(
      audioState({
        ...BASE,
        hasApi: true,
        l2Voice: 'Mónica',
        l1Voice: 'Samantha',
        playAnyway: true,
      }).name,
    ).toBe('voice-ok');
    // The G1 state is non-modal and actionable, and L1 audio is unaffected.
    const g1 = audioState({
      ...BASE,
      hasApi: true,
      l2Voice: null,
      l1Voice: 'Samantha',
      playAnyway: false,
    });
    expect(g1.l1Available).toBe(true);
    expect(g1.action).toBeTruthy();
    expect(g1.canPreview).toBe(false);
  });

  it('AC-UI-14: the app never sets playAnyway itself', async () => {
    const engine = createFakeEngine({}, { voices: ['en'] });
    render(<App conversation={fixtureConversation()} createEngine={() => engine} />);
    await waitFor(() => expect(screen.getByText(/No Spanish voice/)).toBeTruthy());
    expect(screen.getByText('Play anyway with the default voice')).toBeTruthy();
  });

  it('AC-UI-15: the independence line renders when the capability is false and is absent when true', async () => {
    const { unmount } = render(
      <App conversation={fixtureConversation()} createEngine={() => createFakeEngine()} />,
    );
    await waitFor(() => expect(screen.getByText('Voices')).toBeTruthy());
    screen.getByText('Voices').click();
    await waitFor(() =>
      expect(screen.getByText(/each language uses a different voice/)).toBeTruthy(),
    );
    unmount();

    render(
      <App
        conversation={fixtureConversation()}
        createEngine={() => createFakeEngine({ preservesVoiceIdentityAcrossLangs: true })}
      />,
    );
    await waitFor(() => expect(screen.getByText('Voices')).toBeTruthy());
    screen.getByText('Voices').click();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(screen.queryByText(/each language uses a different voice/)).toBeNull();
  });

  it('AC-UI-16: the picker offers an Automatic row that shows the resolved voice', async () => {
    render(<App conversation={fixtureConversation()} createEngine={() => createFakeEngine()} />);
    await waitFor(() => expect(screen.getByText('Voices')).toBeTruthy());
    screen.getByText('Voices').click();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(screen.getAllByText(/Automatic \(/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Automatic \(es-/).length).toBeGreaterThan(0);
  });

  it('AC-TOOL-17: the shared mock is used by the ui project too', async () => {
    const mock = installSpeechSynthesisMock({
      voices: [
        { name: 'Mónica', lang: 'es-ES', local: true },
        { name: 'Samantha', lang: 'en-US', local: true },
      ],
    });
    render(
      <App
        conversation={fixtureConversation()}
        createEngine={(overrides) => createSpeechSynthesisEngine({ overrides })}
      />,
    );
    await waitFor(() => expect(screen.getByText('Ron')).toBeTruthy());
    expect(mock.api).toBeTruthy();
    delete (globalThis as { speechSynthesis?: unknown }).speechSynthesis;
  });
});
