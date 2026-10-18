/**
 * `<App>` — the store provider and the keyboard map (D4 §3, §11).
 *
 * The app loads in `idle`; the Play control is the required first gesture
 * (D4 §11.3, AC-UI-25). The audio state is recomputed whenever engine
 * capabilities change, `playAnyway` changes, or the voice list changes.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { resolveTimeline } from '../domain/resolve.ts';
import { visibility } from '../domain/visibility.ts';
import type { ChoiceKey, Conversation, Preferences, SessionOp } from '../domain/types.ts';
import type { TtsEngine } from '../engines/ports.ts';
import { audioState, type AudioState } from './audio-state.ts';
import { GAP_AFTER_CHOICE_MS } from './constants.ts';
import {
  AudioNotice,
  KeyboardHelpDialog,
  LicensesDialog,
  SkipToContent,
  Toolbar,
  Transcript,
  Transport,
  VoiceOverridesDialog,
  WhatIfPanel,
  type DialogName,
} from './components.tsx';
import { SHORTCUTS } from './keys.ts';
import { Scheduler } from './scheduler.ts';
import { StoreContext, createInitialState, reduceStore, type AppContext } from './store.ts';

/** Derive the audio state from the engine's affordances (D4 §9). */
export async function computeAudio(
  engine: TtsEngine,
  conversation: Conversation,
  prefs: Preferences,
): Promise<AudioState> {
  const l1Voices = await engine.voices(conversation.l1);
  const l2Voices = await engine.voices(conversation.l2);
  const hasApi = l1Voices.length > 0 || l2Voices.length > 0;
  const first = Object.entries(conversation.characters)[0];
  const characterId = first?.[0];
  const voiceId = first?.[1]?.voice;
  const l2Voice =
    characterId && voiceId ? engine.resolveVoice(characterId, voiceId, conversation.l2) : null;
  const l1Voice =
    characterId && voiceId ? engine.resolveVoice(characterId, voiceId, conversation.l1) : null;
  return audioState({
    hasApi,
    l2Voice,
    l1Voice,
    playAnyway: prefs.playAnyway,
    l2: conversation.l2,
  });
}

export type AppProps = {
  conversation: Conversation;
  /** Constructed from the learner's overrides, per D3 §3.1.1 (overrides at construction). */
  createEngine: (overrides: Preferences['voiceOverrides']) => TtsEngine;
  delay?: (ms: number) => Promise<void>;
  initialPrefs?: Partial<Preferences>;
};

export function App({
  conversation,
  createEngine,
  delay,
  initialPrefs,
}: AppProps): preact.JSX.Element {
  const [state, dispatch] = useReducer(
    (current: ReturnType<typeof createInitialState>, action: Parameters<typeof reduceStore>[2]) =>
      reduceStore(conversation, current, action),
    undefined,
    () => {
      const base = createInitialState(conversation, {
        name: 'voice-ok',
        l2Available: true,
        l1Available: true,
        canPreview: true,
      });
      return initialPrefs ? { ...base, prefs: { ...base.prefs, ...initialPrefs } } : base;
    },
  );

  const stateRef = useRef(state);

  const delayFn =
    delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const engine = useMemo(
    () => createEngine(state.prefs.voiceOverrides),
    [createEngine, state.prefs.voiceOverrides],
  );

  const scheduler = useMemo(
    () => new Scheduler({ engine, conversation, getPrefs: () => stateRef.current.prefs, delay }),
    [engine, conversation, delay],
  );

  // Refs are updated after render, never during it (react-hooks/refs).
  useEffect(() => {
    stateRef.current = state;
  });

  const [dialog, setDialog] = useState<{
    name: DialogName | 'whatif';
    trigger: Element | null;
  } | null>(null);
  const [glossMode, setGlossMode] = useState(false);
  const [status, setStatus] = useState(`Beat 1 of ${conversation.order.length}`);
  const commandsRef = useRef<{ play: () => void; stop: () => void }>({
    play: () => undefined,
    stop: () => undefined,
  });

  // Recompute the audio state on load, when the engine changes, and when
  // `playAnyway` changes. `voiceschanged` re-evaluates through `engine.voices`.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await engine.init();
      const next = await computeAudio(engine, conversation, stateRef.current.prefs);
      if (!cancelled) dispatch({ type: 'audio', audio: next });
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, conversation, state.prefs.playAnyway]);

  const resolved = resolveTimeline(conversation, state.session);
  const pending = resolved.find((beat) => beat.status === 'pending');
  const cursorIndex = conversation.order.indexOf(state.session.cursor);

  function stopPlayback(): void {
    scheduler.stop();
    setStatus('Paused');
  }

  async function playCurrent(): Promise<void> {
    const current = resolveTimeline(conversation, stateRef.current.session).find(
      (beat) => beat.beatId === stateRef.current.session.cursor,
    );
    if (!current) return;
    setStatus(`Playing beat ${cursorIndex + 1} of ${conversation.order.length}`);
    const outcome = await scheduler.playBeat(current, visibility(stateRef.current.prefs));
    if (outcome === 'finished') {
      // Autoplay advances only when audio actually played (D4 §6.4).
      await delayFn(GAP_AFTER_CHOICE_MS);
      dispatch({ type: 'session', op: { type: 'advance' } });
    }
  }

  const hasStartedRef = useRef(false);
  useEffect(() => {
    commandsRef.current = {
      play: () => {
        hasStartedRef.current = true;
        void playCurrent();
      },
      stop: stopPlayback,
    };
  });

  // A `hear` or `speed` change stops and replays the current beat; `read` and
  // `hint` never interrupt audio (D4 §6.5).
  useEffect(() => {
    if (!hasStartedRef.current) return;
    scheduler.stop();
    void playCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.prefs.hear, state.prefs.speed]);

  function sessionOp(op: SessionOp): void {
    scheduler.stop();
    dispatch({ type: 'session', op });
  }

  function choose(key: ChoiceKey): void {
    if (!pending) return;
    sessionOp({ type: 'choose', beatId: pending.beatId, key });
  }

  function previewOption(key: ChoiceKey): void {
    const option = pending?.options?.find((candidate) => candidate.key === key);
    if (!pending || !option) return;
    void scheduler.preview(option.line, pending, visibility(stateRef.current.prefs));
  }

  function closeDialog(): void {
    const trigger = dialog?.trigger;
    setDialog(null);
    if (trigger instanceof HTMLElement) trigger.focus();
  }

  function openDialog(name: DialogName | 'whatif', event?: Event): void {
    setDialog({ name, trigger: (event?.currentTarget as Element | null) ?? null });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // No shortcut fires while a dialog owns focus (AC-UI-18).
      if (dialog) {
        if (event.key === 'Escape') closeDialog();
        return;
      }
      const target = event.target;
      const inControl =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (inControl) return;

      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= 8) {
        const option = pending?.options?.[digit - 1];
        if (option) {
          if (event.shiftKey) previewOption(option.key);
          else choose(option.key);
          event.preventDefault();
        }
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          if (stateRef.current.playback === 'playing') commandsRef.current.stop();
          else commandsRef.current.play();
          break;
        case 'r':
        case 'R':
          commandsRef.current.play();
          break;
        case '[':
          sessionOp({ type: 'rewind' });
          break;
        case ']':
          sessionOp({ type: 'advance' });
          break;
        case 'h':
        case 'H':
          dispatch({ type: 'prefs', patch: { hint: !stateRef.current.prefs.hint } });
          break;
        case 'g':
        case 'G':
          setGlossMode((current) => !current);
          break;
        case 'w':
        case 'W':
          openDialog('whatif');
          break;
        case '?':
          openDialog('help');
          break;
        default:
          break;
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, pending, cursorIndex]);

  const context: AppContext = {
    conversation,
    state,
    dispatch,
    scheduler,
    engine,
    visibility: visibility(state.prefs),
    status,
    setStatus,
    play: () => commandsRef.current.play(),
    stop: stopPlayback,
    sessionOp,
    choose,
  };

  return (
    <StoreContext.Provider value={context}>
      <SkipToContent />
      <header>
        <h1>{conversation.title}</h1>
        <Transport />
        <Toolbar onOpen={(name, event) => openDialog(name, event)} />
      </header>
      <AudioNotice onPlayAnyway={() => dispatch({ type: 'prefs', patch: { playAnyway: true } })} />
      <main data-gloss-mode={glossMode ? 'true' : 'false'}>
        <Transcript />
      </main>
      {dialog?.name === 'whatif' ? <WhatIfPanel /> : null}
      {dialog?.name === 'licenses' ? <LicensesDialog onClose={closeDialog} /> : null}
      {dialog?.name === 'voice' ? (
        <VoiceOverridesDialog
          onClose={closeDialog}
          onResolved={(characterId, lang) =>
            engine.resolveVoice(
              characterId,
              conversation.characters[characterId]?.voice ?? 'M1',
              lang,
            )
          }
        />
      ) : null}
      {dialog?.name === 'help' ? (
        <KeyboardHelpDialog onClose={closeDialog} shortcuts={[...SHORTCUTS]} />
      ) : null}
    </StoreContext.Provider>
  );
}
