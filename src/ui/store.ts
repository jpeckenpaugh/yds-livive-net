/**
 * The store (D4 §4).
 *
 * Hand-rolled `useReducer` + context, no new dependency. Three concerns:
 * `session` (the only mutable domain state), `prefs` (persisted), and `playback`
 * (UI-local, never persisted). The session reducer contains no domain logic of
 * its own — it delegates to D2's `reduce`.
 */

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { initialSession, reduce } from '../domain/session.ts';
import {
  DEFAULT_SPEED,
  type ChoiceKey,
  type Conversation,
  type Preferences,
  type Session,
  type SessionOp,
} from '../domain/types.ts';
import { visibility } from '../domain/visibility.ts';
import type { PlaybackState, TtsEngine } from '../engines/ports.ts';
import { audioState, type AudioState } from './audio-state.ts';
import type { Scheduler } from './scheduler.ts';

export const DEFAULT_PREFS: Preferences = {
  // Both languages visible by default. The gloss (hover/tap translation) is a
  // rendering of L2 spans, so with L2 hidden the app's headline affordance is
  // invisible on first load — which is what `read: 'l1'` produced in practice.
  // Hearing L2 while reading both is the posture that shows what the app is.
  read: 'both',
  hear: 'l2',
  hint: true,
  speed: DEFAULT_SPEED,
  voiceOverrides: {},
  playAnyway: false,
};

export type StoreState = {
  session: Session;
  prefs: Preferences;
  playback: PlaybackState;
  /** Derived from engine capabilities + voice availability; recomputed on every change. */
  audio: AudioState;
  noticeDismissed: boolean;
};

export type StoreAction =
  | { type: 'session'; op: SessionOp }
  | { type: 'seek'; beatId: string }
  | { type: 'prefs'; patch: Partial<Preferences> }
  | { type: 'playback'; state: PlaybackState }
  | { type: 'audio'; audio: AudioState }
  | { type: 'dismiss-notice' }
  | { type: 'restore'; state: StoreState };

export function createInitialState(conversation: Conversation, audio: AudioState): StoreState {
  return {
    session: initialSession(conversation),
    prefs: DEFAULT_PREFS,
    playback: 'idle',
    audio,
    noticeDismissed: false,
  };
}

export function reduceStore(
  conversation: Conversation,
  state: StoreState,
  action: StoreAction,
): StoreState {
  switch (action.type) {
    case 'session':
      return { ...state, session: reduce(conversation, state.session, action.op) };
    case 'seek': {
      // Move the cursor to `beatId` without touching the recorded choices, by
      // replaying rewind/advance through the domain reducer. Playback needs to
      // start from the first beat of an already-composed conversation, and the
      // frozen session ops have no seek — so this derives one from them rather
      // than reaching into the session directly.
      const target = conversation.order.indexOf(action.beatId);
      if (target < 0) return state;
      let session = state.session;
      let guard = conversation.order.length + 2;
      while (guard-- > 0) {
        const at = conversation.order.indexOf(session.cursor);
        if (at < 0 || at === target) break;
        const op: SessionOp = at > target ? { type: 'rewind' } : { type: 'advance' };
        const next = reduce(conversation, session, op);
        if (next.cursor === session.cursor) break;
        session = next;
      }
      return { ...state, session };
    }
    case 'prefs':
      return { ...state, prefs: { ...state.prefs, ...action.patch } };
    case 'playback':
      return { ...state, playback: action.state };
    case 'audio':
      return { ...state, audio: action.audio };
    case 'dismiss-notice':
      return { ...state, noticeDismissed: true };
    case 'restore':
      return action.state;
  }
}

export type AppContext = {
  conversation: Conversation;
  state: StoreState;
  dispatch: (action: StoreAction) => void;
  scheduler: Scheduler;
  engine: TtsEngine;
  /** The 32→4 projection the UI renders from; components never read `prefs.read`. */
  visibility: ReturnType<typeof visibility>;
  /** The single polite status string (AC-UI-19). */
  status: string;
  setStatus: (message: string) => void;
  play: () => void;
  stop: () => void;
  sessionOp: (op: SessionOp) => void;
  choose: (key: ChoiceKey) => void;
};

export const StoreContext = createContext<AppContext | null>(null);

export function useStore(): AppContext {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside <App>');
  return context;
}

export { audioState };
