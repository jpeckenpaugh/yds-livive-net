/**
 * The conversation list.
 *
 * Filtered by the learner's pair. With one conversation in the catalog this is
 * mostly about the two states that matter: a conversation in progress, and an
 * honest empty state when the chosen pair has no content yet.
 */

import type { CatalogEntry } from '../../data/catalog.ts';
import type { Session } from '../../domain/types.ts';
import { langName } from '../language.ts';

export type Progress = {
  beatsRevealed: number;
  beatsTotal: number;
  decisionsMade: number;
  decisionsTotal: number;
  complete: boolean;
};

export function progressOf(entry: CatalogEntry, session: Session | undefined): Progress {
  const order = entry.conversation.order;
  const beatsTotal = order.length;
  const decisionsTotal = Object.values(entry.conversation.beats).filter(
    (beat) => beat.kind === 'choice',
  ).length;

  if (!session) {
    return { beatsRevealed: 1, beatsTotal, decisionsMade: 0, decisionsTotal, complete: false };
  }
  const revealedIndex = Math.max(0, order.indexOf(session.revealed));
  const decisionsMade = Object.keys(session.choices).length;
  const beatsRevealed = revealedIndex + 1;
  return {
    beatsRevealed,
    beatsTotal,
    decisionsMade,
    decisionsTotal,
    complete: beatsRevealed >= beatsTotal && decisionsMade >= decisionsTotal,
  };
}

export function Conversations({
  entries,
  native,
  study,
  sessionFor,
  onOpen,
  onChangePair,
}: {
  entries: CatalogEntry[];
  native: string;
  study: string;
  sessionFor: (id: string) => Session | undefined;
  onOpen: (id: string) => void;
  onChangePair: () => void;
}): preact.JSX.Element {
  return (
    <div class="screen screen-list">
      <header class="screen-head">
        <h1>Conversations</h1>
        <button type="button" class="quiet" onClick={onChangePair}>
          {langName(native)} &rarr; {langName(study)} &middot; change
        </button>
      </header>

      {entries.length === 0 ? (
        <p class="empty">
          No conversations for {langName(native)} &rarr; {langName(study)} yet. Try another pair.
        </p>
      ) : (
        <ul class="conversation-list">
          {entries.map((entry) => {
            const progress = progressOf(entry, sessionFor(entry.id));
            return (
              <li key={entry.id} class="conversation-card">
                <button type="button" class="conversation-open" onClick={() => onOpen(entry.id)}>
                  <span class="conversation-title">{entry.title}</span>
                  <span class="conversation-meta">
                    {progress.complete
                      ? 'Complete — play it again'
                      : `${progress.beatsRevealed} of ${progress.beatsTotal} beats · ${progress.decisionsMade} of ${progress.decisionsTotal} decisions`}
                  </span>
                </button>
                <div class="conversation-bar" aria-hidden="true">
                  <span
                    style={`width:${Math.round((progress.beatsRevealed / progress.beatsTotal) * 100)}%`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
