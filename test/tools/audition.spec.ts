import { describe, expect, it } from 'vitest';
import { analyseCorpus, charCount, median, rms } from '../../tools/audition.ts';

/**
 * AC-ENG-23 is a **listening** check the Engineer cannot perform. This test
 * proves the automated detector that backs the recorded audition works on
 * synthetic inputs; the audition itself is produced by
 * `tools/evidence/tts-audition.mjs` and its result is recorded in
 * `test-artifacts/tts-audition/`. A clean report is evidence for the owner's
 * audition, never a substitute for it.
 */
describe('AC-ENG-23: the audition detector', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(charCount('¿qué tal?')).toBe(9);
  });

  it('computes a median', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
  });

  it('flags a silent line and a truncated line, and passes a normal one', () => {
    const normal = { id: 'n', text: 'Buenos días, ¿qué tal estás?', durationMs: 2200, rms: 0.04 };
    const silent = { id: 's', text: 'Buenos días, ¿qué tal estás?', durationMs: 2200, rms: 0 };
    const truncated = {
      id: 't',
      text: 'Quería pedir algo para comer, si te parece bien.',
      durationMs: 120,
      rms: 0.03,
    };
    const repeated = { id: 'r', text: 'Buenos días, ¿qué tal estás?', durationMs: 9000, rms: 0.04 };
    const results = new Map(
      analyseCorpus([normal, silent, truncated, repeated]).map((r) => [r.id, r]),
    );
    expect(results.get('n')?.ok).toBe(true);
    expect(results.get('s')?.flags).toContain('silent');
    expect(results.get('t')?.flags).toContain('short');
    expect(results.get('r')?.flags).toContain('long');
  });

  it('does not rate-test very short lines (too noisy)', () => {
    const results = analyseCorpus([
      { id: 'a', text: 'Sí.', durationMs: 60, rms: 0.02 },
      { id: 'b', text: 'Buenos días, ¿qué tal estás?', durationMs: 2200, rms: 0.04 },
    ]);
    const short = results.find((r) => r.id === 'a');
    expect(short?.flags).not.toContain('short');
  });

  it('rms is zero for silence and positive otherwise', () => {
    expect(rms(new Float32Array(10))).toBe(0);
    expect(rms(new Float32Array([0.5, -0.5]))).toBeGreaterThan(0);
  });
});
