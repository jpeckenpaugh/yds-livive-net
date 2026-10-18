import { describe, expect, it } from 'vitest';
import { resolveTimeline } from '../../src/domain/resolve.ts';
import { initialSession, reduce } from '../../src/domain/session.ts';
import { matchChoiceSet, runWalk } from '../../src/domain/walk.ts';
import type { BeatId, ChoiceKey, Conversation } from '../../src/domain/types.ts';
import { fixtureConversation } from '../helpers/sources.ts';

function allSessions(c: Conversation): Array<Record<BeatId, ChoiceKey>> {
  const results: Array<Record<BeatId, ChoiceKey>> = [];
  const recurse = (choices: Record<BeatId, ChoiceKey>): void => {
    const pending = runWalk(c, choices, 'session').steps.find((step) => step.status === 'pending');
    if (!pending) {
      results.push(choices);
      return;
    }
    const alternative = matchChoiceSet(c, pending.beatId, pending.assignment);
    for (const option of alternative?.options ?? []) {
      recurse({ ...choices, [pending.beatId]: option.key });
    }
  };
  recurse({});
  return results;
}

describe('resolveTimeline (D2 §11)', () => {
  it('returns every beat in order with a status, and never invents content', () => {
    const c = fixtureConversation();
    const beats = resolveTimeline(c, initialSession(c));
    expect(beats.map((beat) => beat.beatId)).toEqual(c.order);
    const pending = beats.find((beat) => beat.beatId === 'b2');
    expect(pending?.status).toBe('pending');
    expect(pending?.options?.length).toBe(2);
    expect(pending?.line).toBeUndefined();
    for (const beat of beats.filter((b) => b.status === 'unreached')) {
      expect(beat.line).toBeUndefined();
      expect(beat.options).toBeUndefined();
    }
  });

  it('AC-DOM-17: ghosts are the matched set minus the chosen key, and their line uses their own sets', () => {
    const c = fixtureConversation();
    let session = initialSession(c);
    session = reduce(c, session, { type: 'choose', beatId: 'b2', key: 'dinner' });
    const beat = resolveTimeline(c, session).find((b) => b.beatId === 'b2');
    expect(beat?.status).toBe('resolved');
    const chosen = beat?.options?.find((option) => option.key === 'dinner');
    const ghost = beat?.options?.find((option) => option.key === 'movie');
    expect(chosen?.chosen).toBe(true);
    expect(chosen?.ghost).toBe(false);
    expect(ghost?.chosen).toBe(false);
    expect(ghost?.ghost).toBe(true);
    expect(ghost?.line.l2).toContain('película');
    expect(ghost?.previewable).toBe(true);
  });

  it('AC-DOM-18: autoPick selects options[0], badges the beat, and resolves the whole timeline', () => {
    const c = fixtureConversation();
    const beats = resolveTimeline(c, initialSession(c), { autoPick: true });
    expect(beats.every((beat) => beat.status === 'resolved')).toBe(true);
    expect(beats.find((b) => b.beatId === 'b2')?.autoPicked).toBe(true);
    expect(beats.find((b) => b.beatId === 'b2')?.chosenKey).toBe('dinner');
    expect(beats.find((b) => b.beatId === 'b1')?.autoPicked).toBeUndefined();
  });

  it('AC-DOM-08: no rendered string in any reachable session contains {, } or ${', () => {
    const c = fixtureConversation();
    const sessions = allSessions(c);
    expect(sessions.length).toBe(16);
    for (const choices of sessions) {
      const beats = resolveTimeline(c, { ...initialSession(c), choices }, { autoPick: true });
      for (const beat of beats) {
        const strings = [beat.hint, beat.line?.l1, beat.line?.l2];
        for (const option of beat.options ?? []) {
          strings.push(option.label.l1, option.label.l2, option.line.l1, option.line.l2);
        }
        for (const value of strings) {
          if (value === undefined) continue;
          expect(value).not.toMatch(/[{}$]/);
        }
      }
    }
  });
});
