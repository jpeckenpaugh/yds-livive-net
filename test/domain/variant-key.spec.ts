import { describe, expect, it } from 'vitest';
import { variantKey } from '../../src/domain/variant-key.ts';
import { reachableAssignments } from '../../src/domain/walk.ts';
import { variantSpecsOf } from '../../src/domain/variants.ts';
import { fixtureConversation } from '../helpers/sources.ts';

describe('variantKey (D2 §5.3, AC-DOM-09)', () => {
  it('composes [beatId, parentId, ...sorted slot=value]', () => {
    expect(
      variantKey('b9', 'b9-l1', ['spot', 'time', 'who'], {
        spot: 'dinner-plan',
        time: 'early',
        who: 'us',
      }),
    ).toBe('b9|b9-l1|spot=dinner-plan|time=early|who=us');
  });

  it('omits the trailing pipe when the read scope is empty', () => {
    expect(variantKey('b10', 'b10-l1', [], {})).toBe('b10|b10-l1');
  });

  it('stays injective for two options with an empty read scope', () => {
    const a = variantKey('b6', 'early', [], {});
    const b = variantKey('b6', 'late', [], {});
    expect(a).not.toBe(b);
  });

  it('is stable regardless of slotNames order', () => {
    const a = variantKey('b9', 'b9-l1', ['who', 'spot', 'time'], {
      spot: 'movie-plan',
      time: 'late',
      who: 'friends',
    });
    const b = variantKey('b9', 'b9-l1', ['spot', 'time', 'who'], {
      spot: 'movie-plan',
      time: 'late',
      who: 'friends',
    });
    expect(a).toBe(b);
  });

  it('AC-DOM-09: every reachable variant key resolves to exactly one record, build === runtime', () => {
    const c = fixtureConversation();
    const specs = variantSpecsOf(c);
    const keys = new Set(specs.map((spec) => spec.variantKey));
    // 28 authored records (D6 §11.2) from 16 terminal assignments.
    expect(keys.size).toBe(28);
    expect(Object.keys(c.lines).length).toBe(28);
    expect(reachableAssignments(c).length).toBe(16);
    for (const key of keys) {
      expect(c.lines[key], `missing record for ${key}`).toBeDefined();
      expect(c.lines[key]?.variantKey).toBe(key);
    }
    for (const key of Object.keys(c.lines)) expect(keys.has(key)).toBe(true);
  });
});
