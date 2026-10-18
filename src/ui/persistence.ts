/**
 * Local persistence.
 *
 * Stores the learner's pair, their channel preferences, and the composed session
 * per conversation, so returning resumes where they left off and "your version"
 * of a conversation is a real, saved object.
 *
 * Deliberately tiny and total: any parse failure or shape surprise falls back to
 * defaults rather than throwing. A corrupt entry must never make the app
 * unopenable, because the only way out of that is clearing site data by hand.
 */

import type { Lang, Preferences, Session } from '../domain/types.ts';

const KEY = 'yds.v1';

export type Persisted = {
  /** False until the Welcome screen has been completed once. */
  seenWelcome: boolean;
  native: Lang | null;
  study: Lang | null;
  prefs: Partial<Preferences>;
  /** conversationId -> session (cursor, revealed, choices). */
  sessions: Record<string, Session>;
};

const EMPTY: Persisted = {
  seenWelcome: false,
  native: null,
  study: null,
  prefs: {},
  sessions: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadPersisted(): Persisted {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...EMPTY };

    const sessions: Record<string, Session> = {};
    if (isRecord(parsed.sessions)) {
      for (const [id, value] of Object.entries(parsed.sessions)) {
        if (
          !isRecord(value) ||
          typeof value.cursor !== 'string' ||
          typeof value.revealed !== 'string' ||
          !isRecord(value.choices)
        ) {
          continue;
        }
        // Validate each recorded choice rather than asserting the shape. This
        // function's whole job is to not trust what was stored, and an
        // assertion here would be exactly the trust it exists to avoid.
        const choices: Record<string, string> = {};
        let ok = true;
        for (const [beatId, chosen] of Object.entries(value.choices)) {
          if (typeof chosen !== 'string') {
            ok = false;
            break;
          }
          choices[beatId] = chosen;
        }
        if (ok) sessions[id] = { cursor: value.cursor, revealed: value.revealed, choices };
      }
    }

    return {
      seenWelcome: parsed.seenWelcome === true,
      native: typeof parsed.native === 'string' ? parsed.native : null,
      study: typeof parsed.study === 'string' ? parsed.study : null,
      prefs: isRecord(parsed.prefs) ? parsed.prefs : {},
      sessions,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function savePersisted(value: Persisted): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Quota or a private-mode refusal. Losing persistence is survivable; a
    // thrown error here would break the app mid-session.
  }
}

export function clearPersisted(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
