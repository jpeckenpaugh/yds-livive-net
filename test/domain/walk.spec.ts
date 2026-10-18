import { describe, expect, it } from 'vitest';
import {
  deriveVariables,
  reachableAssignments,
  reachableVariants,
  runWalk,
} from '../../src/domain/walk.ts';
import { initialSession, reduce } from '../../src/domain/session.ts';
import { resolveTimeline } from '../../src/domain/resolve.ts';
import { variantSpecsOf } from '../../src/domain/variants.ts';
import { structureOf } from '../../src/domain/structure.ts';
import { fixtureConversation, fixtureSource, minimalSource, clone } from '../helpers/sources.ts';

describe('the walk (D2 §5.1, AC-DOM-14)', () => {
  it('emits exactly one step per beat for a session, with unreached as a status', () => {
    const c = fixtureConversation();
    const session = initialSession(c);
    const resolved = resolveTimeline(c, session);
    expect(resolved.length).toBe(10);
    expect(resolved.map((beat) => beat.status)).toEqual([
      'resolved',
      'pending',
      'unreached',
      'unreached',
      'unreached',
      'unreached',
      'unreached',
      'unreached',
      'unreached',
      'unreached',
    ]);
  });

  it('unreached steps carry no alternativeId and an empty assignment', () => {
    const c = fixtureConversation();
    const steps = runWalk(c, {}, 'session').steps;
    for (const step of steps) {
      if (step.status !== 'unreached') continue;
      expect(step.alternativeId).toBeUndefined();
      expect(step.assignment).toEqual({});
    }
  });

  it('the exhaustive walk visits all 16 terminal assignments', () => {
    const c = fixtureConversation();
    expect(reachableAssignments(c).length).toBe(16);
    expect(reachableVariants(c).length).toBeGreaterThan(28);
  });

  it('three projections agree: resolveTimeline, deriveVariables, reachableVariants', () => {
    const c = fixtureConversation();
    // A full session's chosen path is one of the exhaustive walk's branches.
    let session = initialSession(c);
    session = reduce(c, session, { type: 'choose', beatId: 'b2', key: 'dinner' });
    session = reduce(c, session, { type: 'choose', beatId: 'b4', key: 'chinese' });
    session = reduce(c, session, { type: 'choose', beatId: 'b6', key: 'early' });
    session = reduce(c, session, { type: 'choose', beatId: 'b8', key: 'us' });
    const variables = deriveVariables(c, session);
    expect(variables).toMatchObject({
      activity: 'dinner',
      spot: 'dinner-plan',
      cuisine: 'chinese',
      time: 'early',
      who: 'us',
    });
    const terminals = reachableAssignments(c);
    expect(
      terminals.some(
        (assignment) =>
          assignment.spot === variables.spot &&
          assignment.time === variables.time &&
          assignment.who === variables.who,
      ),
    ).toBe(true);
  });

  it('a when/sets mutation changes validator, enumerator and app identically', () => {
    const source = minimalSource();
    const before = variantSpecsOf(structureOf(source))
      .map((spec) => spec.variantKey)
      .sort();
    const mutated = clone(source);
    const option = mutated.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (option) option.sets = { x: 'q' };
    const after = variantSpecsOf(structureOf(mutated))
      .map((spec) => spec.variantKey)
      .sort();
    // The b2|p variant's key now names q, and b3's two records collapse onto one key.
    expect(before).not.toEqual(after);
    expect(after.filter((key) => key.startsWith('b3|')).length).toBe(2);
    expect(new Set(after).size).toBeLessThan(after.length);
  });

  it('the fixture source and its artifact agree on the key set', () => {
    const c = fixtureConversation();
    const fromSource = new Set(
      variantSpecsOf(structureOf(fixtureSource())).map((spec) => spec.variantKey),
    );
    const fromArtifact = new Set(Object.keys(c.lines));
    expect(fromSource).toEqual(fromArtifact);
  });

  it('AC-DOM-24: BuiltOption.slotNames is the template-read scope only', () => {
    const source = minimalSource();
    const option = source.beats[1]?.choiceSets?.[0]?.options?.[0];
    if (option) option.template = 'I pick it.'; // sets x but never reads it
    const structure = structureOf(source);
    expect(structure.beats['b2']?.alternatives[0]?.options?.[0]?.slotNames).toEqual([]);
    // One record for the self-set-but-unread option, regardless of x's value.
    const specs = variantSpecsOf(structure).filter((spec) => spec.optionKey === 'p');
    expect(specs.length).toBe(1);
    expect(specs[0]?.variantKey).toBe('b2|p');
  });
});
