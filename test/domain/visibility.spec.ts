import { describe, expect, it } from 'vitest';
import { visibility } from '../../src/domain/visibility.ts';
import type { Channel, Preferences } from '../../src/domain/types.ts';

const CHANNELS: Channel[] = ['l1', 'l2', 'both', 'none'];

function prefs(read: Channel, hear: Channel, hint: boolean): Preferences {
  return { read, hear, hint, speed: 1, voiceOverrides: {}, playAnyway: false };
}

describe('visibility (D2 §12, AC-DOM-19)', () => {
  it('takes Preferences alone and covers all 32 inputs', () => {
    let count = 0;
    for (const read of CHANNELS) {
      for (const hear of CHANNELS) {
        for (const hint of [true, false]) {
          count += 1;
          const result = visibility(prefs(read, hear, hint));
          expect(result.showL1).toBe(read === 'l1' || read === 'both');
          expect(result.showL2).toBe(read === 'l2' || read === 'both');
          expect(result.showHint).toBe(hint);
          const expectedOrder =
            hear === 'l1' ? ['en'] : hear === 'l2' ? ['es'] : hear === 'both' ? ['es', 'en'] : [];
          expect(result.playOrder).toEqual(expectedOrder);
        }
      }
    }
    expect(count).toBe(32);
  });

  it('puts L2 first when both are heard', () => {
    expect(visibility(prefs('none', 'both', false)).playOrder).toEqual(['es', 'en']);
  });

  it('has no beat argument', () => {
    expect(visibility.length).toBe(1);
  });
});
