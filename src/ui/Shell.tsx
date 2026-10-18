/**
 * The shell — screen routing and persistence.
 *
 * `<App>` stays the conversation screen and keeps its existing contract, so the
 * shell sits *above* it: Welcome and Conversations are new surfaces, and the
 * conversation screen is unchanged in shape. That also means the existing tests,
 * which render `<App>` directly and expect the transcript immediately, keep
 * working without modification.
 */

import { useCallback, useMemo, useState } from 'preact/hooks';
import { conversationsFor, entryById } from '../data/catalog.ts';
import type { Preferences } from '../domain/types.ts';
import type { TtsEngine } from '../engines/ports.ts';
import { App } from './App.tsx';
import { messagesFor } from './i18n/index.ts';
import { derivedPrefs } from './language.ts';
import { loadPersisted, savePersisted, type Persisted } from './persistence.ts';
import { Conversations } from './screens/Conversations.tsx';
import { Welcome } from './screens/Welcome.tsx';

type Screen = 'welcome' | 'list' | 'conversation';

export function Shell({
  createEngine,
}: {
  /** Supplied by `main.tsx`, which stays the single composition root (AC-ARCH-04). */
  createEngine: (overrides: Preferences['voiceOverrides']) => TtsEngine;
}): preact.JSX.Element {
  const initial = useMemo(() => loadPersisted(), []);
  const [persisted, setPersisted] = useState<Persisted>(initial);
  const [screen, setScreen] = useState<Screen>(
    initial.seenWelcome && initial.native && initial.study ? 'list' : 'welcome',
  );
  const [openId, setOpenId] = useState<string | null>(null);

  /** Functional update so rapid successive writes cannot drop an earlier one. */
  const update = useCallback((mutate: (previous: Persisted) => Persisted): void => {
    setPersisted((previous) => {
      const next = mutate(previous);
      savePersisted(next);
      return next;
    });
  }, []);

  const native = persisted.native ?? '';
  const study = persisted.study ?? '';
  const open = openId ? entryById(openId) : undefined;
  const t = useMemo(() => messagesFor(native || 'en'), [native]);

  if (screen === 'welcome' || !native || !study) {
    return (
      <Welcome
        initialNative={persisted.native}
        initialStudy={persisted.study}
        isFirstRun={!persisted.seenWelcome}
        onStart={(nextNative, nextStudy) => {
          update((previous) => ({
            ...previous,
            seenWelcome: true,
            native: nextNative,
            study: nextStudy,
            // The derived posture depends on the pair, so an explicit choice from
            // a previous pair must not leak into the new one.
            prefs: {},
          }));
          setScreen('list');
        }}
        onCancel={persisted.seenWelcome ? () => setScreen('list') : undefined}
      />
    );
  }

  if (screen === 'conversation' && open) {
    const entry = open;
    return (
      <App
        conversation={entry.conversation}
        createEngine={createEngine}
        initialPrefs={{ ...derivedPrefs(entry.conversation, native), ...persisted.prefs }}
        initialSession={persisted.sessions[entry.id]}
        onPersist={({ session, prefs }) =>
          update((previous) => ({
            ...previous,
            prefs,
            sessions: { ...previous.sessions, [entry.id]: session },
          }))
        }
        onBack={() => setScreen('list')}
        uiLang={native}
      />
    );
  }

  return (
    <Conversations
      entries={conversationsFor(native, study)}
      native={native}
      study={study}
      sessionFor={(id) => persisted.sessions[id]}
      onOpen={(id) => {
        setOpenId(id);
        setScreen('conversation');
      }}
      onChangePair={() => setScreen('welcome')}
      t={t}
    />
  );
}
