/**
 * The shared `speechSynthesis` mock (D5 §7.1, AC-TOOL-17).
 *
 * One helper, used by both the `engines` project's conformance suite and the `ui`
 * project. It must reproduce the four R5 landmines plus "no `es` voice":
 *
 *   1. a late `voiceschanged` (the voice list is empty until it fires);
 *   2. an unreliable `cancel()` (a queued `speak()` keeps firing `onend`);
 *   3. long-utterance truncation (past `truncateOverChars`, `onend` never fires);
 *   4. complete absence of the API (`absent: true`);
 *   5. no voice for `es` (`voices` contains only non-Spanish voices).
 *
 * The assertions live with D3; this file is the harness.
 */

export type MockVoice = { name: string; lang: string; local: boolean; default?: boolean };

export type SpeechSynthesisMockOptions = {
  /** Voices available immediately. Empty by default so a late `voiceschanged` is the norm. */
  voices?: MockVoice[];
  /** Voices that appear when `emitVoicesChanged()` is called. */
  lateVoices?: MockVoice[];
  /** When true, `globalThis.speechSynthesis` is left undefined. */
  absent?: boolean;
  /** When true, `cancel()` does not stop the currently queued utterance. */
  cancelKeepsFiring?: boolean;
  /** Utterances longer than this never fire `onend` (Chrome truncation). */
  truncateOverChars?: number;
};

export type SpeechSynthesisMock = {
  api: SpeechSynthesis | undefined;
  emitVoicesChanged(): void;
  spoken: string[];
  cancelled: number;
  reset(): void;
};

export function createSpeechSynthesisMock(
  options: SpeechSynthesisMockOptions = {},
): SpeechSynthesisMock {
  const truncateOverChars = options.truncateOverChars ?? 200;
  let currentVoices = [...(options.voices ?? [])];
  let current: SpeechSynthesisUtterance | null = null;
  const listeners = new Set<() => void>();
  const spoken: string[] = [];
  let cancelled = 0;

  const api = {
    getVoices: () => currentVoices as unknown as SpeechSynthesisVoice[],
    speak: (utterance: SpeechSynthesisUtterance) => {
      spoken.push(utterance.text);
      current = utterance;
      const finish = () => {
        if (current !== utterance && !options.cancelKeepsFiring) return;
        utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
      };
      if (utterance.text.length > truncateOverChars) return; // landmine 3: no onend
      queueMicrotask(finish);
    },
    cancel: () => {
      cancelled += 1;
      if (!options.cancelKeepsFiring) current = null; // landmine 2
    },
    pause: () => undefined,
    resume: () => undefined,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'voiceschanged') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'voiceschanged') listeners.delete(listener);
    },
    get speaking() {
      return current !== null;
    },
    get pending() {
      return false;
    },
    get paused() {
      return false;
    },
  } as unknown as SpeechSynthesis;

  return {
    api: options.absent ? undefined : api,
    emitVoicesChanged: () => {
      currentVoices = [...currentVoices, ...(options.lateVoices ?? [])]; // landmine 1
      for (const listener of listeners) listener();
    },
    spoken,
    get cancelled() {
      return cancelled;
    },
    reset: () => {
      current = null;
      cancelled = 0;
      spoken.length = 0;
    },
  };
}

/** Installs the mock on `globalThis` and returns it. */
export function installSpeechSynthesisMock(
  options?: SpeechSynthesisMockOptions,
): SpeechSynthesisMock {
  const mock = createSpeechSynthesisMock(options);
  if (mock.api) {
    (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis = mock.api;
    const globals = globalThis as { SpeechSynthesisUtterance?: unknown };
    if (!globals.SpeechSynthesisUtterance) {
      globals.SpeechSynthesisUtterance = class {
        text: string;
        lang = '';
        rate = 1;
        voice: SpeechSynthesisVoice | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      };
    }
  } else {
    delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  }
  return mock;
}
