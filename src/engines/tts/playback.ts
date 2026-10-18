/**
 * The `PlaybackController` implementation (D3 §8).
 *
 * D3 owns the interface only; every sequencing rule and timing value is D4's.
 * This controller plays a list of utterances in order and resolves when the last
 * finishes or `stop()` is called. It is engine-agnostic and never inspects
 * `kind`.
 */

import type {
  CreatePlaybackController,
  PlaybackState,
  PlaybackController,
  Utterance,
} from '../ports.ts';

export const createPlaybackController: CreatePlaybackController = (): PlaybackController => {
  let state: PlaybackState = 'idle';
  let current: Utterance | null = null;
  let cancelled = false;
  const listeners = new Set<(next: PlaybackState) => void>();

  function setState(next: PlaybackState): void {
    if (state === next) return;
    state = next;
    for (const listener of [...listeners]) listener(next);
  }

  return {
    get state(): PlaybackState {
      return state;
    },
    onStateChange(callback: (next: PlaybackState) => void): () => void {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async play(items: readonly Utterance[]): Promise<void> {
      cancelled = false;
      setState('playing');
      for (const item of items) {
        if (cancelled) break;
        current = item;
        await item.play();
      }
      current = null;
      setState('idle');
    },
    stop(): void {
      cancelled = true;
      current?.stop();
      current = null;
      setState('idle');
    },
  };
};
