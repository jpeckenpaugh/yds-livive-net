/**
 * The audition detector (D3 §13, AC-ENG-23).
 *
 * The accepted risk of packaging C is v2's short-utterance weakness — repeats,
 * skips and truncation. The spike proved non-silence and voice-distinctness, not
 * quality, and **a human must do the final audition**. This module is the
 * automated half: it flags lines whose speaking rate is a wild outlier against
 * the corpus median, and lines that are silent.
 *
 * It is a heuristic, not a judge. Its limits, stated plainly:
 *   - it cannot hear a mispronunciation or a wrong word;
 *   - a genuinely slow or fast line is a false positive;
 *   - "short" and "skip/truncation" are not distinguishable from audio alone.
 * So a clean report is *evidence for* the owner's audition, never a substitute.
 */

export type AuditionEntry = { id: string; text: string; durationMs: number; rms: number };

export type AuditionResult = AuditionEntry & {
  chars: number;
  rate: number;
  ratio: number;
  flags: string[];
  ok: boolean;
};

/** Characters in a line, counting code points (not UTF-16 units). */
export function charCount(text: string): number {
  return [...text].length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/** Below this ratio of the corpus median, a line is suspiciously short. */
export const SHORT_RATIO = 0.4;
/** Above this ratio, a line is suspiciously long (repeat or stall). */
export const LONG_RATIO = 2.2;
/** Lines shorter than this are too noisy to rate-test. */
export const MIN_CHARS_FOR_RATE = 8;

/**
 * Analyse one corpus. Returns each entry annotated with `rate` (ms/char),
 * `ratio` and `flags`.
 */
export function analyseCorpus(entries: AuditionEntry[]): AuditionResult[] {
  const rates = entries
    .filter((e) => charCount(e.text) >= MIN_CHARS_FOR_RATE)
    .map((e) => e.durationMs / charCount(e.text));
  const med = median(rates);
  return entries.map((entry) => {
    const chars = charCount(entry.text);
    const rate = entry.durationMs / Math.max(1, chars);
    const ratio = med > 0 ? rate / med : 1;
    const flags: string[] = [];
    if (entry.rms <= 0 || entry.durationMs <= 0) flags.push('silent');
    if (chars >= MIN_CHARS_FOR_RATE && med > 0) {
      if (ratio < SHORT_RATIO) flags.push('short');
      if (ratio > LONG_RATIO) flags.push('long');
    }
    return { ...entry, chars, rate, ratio, flags, ok: flags.length === 0 };
  });
}

/** Root-mean-square of a Float32Array. */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / Math.max(1, samples.length));
}
