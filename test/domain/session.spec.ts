import { describe, expect, it } from 'vitest';
import { applyOp, initialSession, reduce } from '../../src/domain/session.ts';
import { reduceChecked, validateSession } from '../../src/domain/validate.ts';
import type { Session } from '../../src/domain/types.ts';
import { fixtureConversation } from '../helpers/sources.ts';

function fullSession(): Session {
  const c = fixtureConversation();
  let session = initialSession(c);
  session = reduce(c, session, { type: 'choose', beatId: 'b2', key: 'dinner' });
  session = reduce(c, session, { type: 'choose', beatId: 'b4', key: 'chinese' });
  session = reduce(c, session, { type: 'choose', beatId: 'b6', key: 'early' });
  session = reduce(c, session, { type: 'choose', beatId: 'b8', key: 'us' });
  return session;
}

describe('initialSession (D2 §10, AC-DOM-23)', () => {
  it('is exactly { cursor: order[0], revealed: firstPending, choices: {} }', () => {
    const c = fixtureConversation();
    const session = initialSession(c);
    expect(session).toEqual({ cursor: 'b1', revealed: 'b2', choices: {} });
    expect(c.order.indexOf(session.cursor)).toBeLessThanOrEqual(c.order.indexOf(session.revealed));
  });
});

describe('reduce (D2 §10, AC-DOM-15, AC-DOM-16)', () => {
  it('choose commits the pick and clamps cursor and revealed to the first pending beat', () => {
    const c = fixtureConversation();
    const session = reduce(c, initialSession(c), { type: 'choose', beatId: 'b2', key: 'dinner' });
    expect(session.choices).toEqual({ b2: 'dinner' });
    expect(session.cursor).toBe('b1');
    expect(session.revealed).toBe('b2');
  });

  it('choose rejects an invalid key by returning the session unchanged', () => {
    const c = fixtureConversation();
    const session = initialSession(c);
    expect(reduce(c, session, { type: 'choose', beatId: 'b2', key: 'nope' })).toEqual(session);
  });

  it('choose rejects a fixed beat', () => {
    const c = fixtureConversation();
    const session = initialSession(c);
    expect(reduce(c, session, { type: 'choose', beatId: 'b1', key: 'dinner' })).toEqual(session);
  });

  it('choose clears downstream choices and clamps back to the first now-pending beat', () => {
    const c = fixtureConversation();
    let session = fullSession();
    for (let i = 0; i < 8; i += 1) session = reduce(c, session, { type: 'advance' });
    expect(session.cursor).toBe('b9');

    session = reduce(c, session, { type: 'choose', beatId: 'b2', key: 'movie' });
    expect(session.choices).toEqual({ b2: 'movie' });
    expect(session.cursor).toBe('b4');
    expect(session.revealed).toBe('b4');
  });

  it('advance is rejected while the current beat is pending', () => {
    const c = fixtureConversation();
    const atChoice = reduce(c, initialSession(c), { type: 'advance' });
    expect(atChoice.cursor).toBe('b2');
    expect(reduce(c, atChoice, { type: 'advance' })).toEqual(atChoice);
  });

  it('advance sets cursor = next and revealed = max(revealed, next)', () => {
    const c = fixtureConversation();
    const session = reduce(c, initialSession(c), { type: 'advance' });
    expect(session.cursor).toBe('b2');
    expect(session.revealed).toBe('b2');
  });

  it('rewind-then-advance never moves revealed backwards', () => {
    const c = fixtureConversation();
    let session = fullSession();
    for (let i = 0; i < 8; i += 1) session = reduce(c, session, { type: 'advance' });
    const revealed = session.revealed;
    session = reduce(c, session, { type: 'rewind' });
    session = reduce(c, session, { type: 'advance' });
    expect(session.revealed).toBe(revealed);
  });

  it('rewind leaves revealed unchanged and reset returns to the initial session', () => {
    const c = fixtureConversation();
    const advanced = reduce(c, initialSession(c), { type: 'advance' });
    const rewound = reduce(c, advanced, { type: 'rewind' });
    expect(rewound.cursor).toBe('b1');
    expect(rewound.revealed).toBe(advanced.revealed);
    expect(reduce(c, advanced, { type: 'reset' })).toEqual(initialSession(c));
  });
});

describe('reduceChecked and validateSession (D2 §10, AC-DOM-21)', () => {
  it('returns the five op-rejection codes as dev diagnostics', () => {
    const c = fixtureConversation();
    const session = initialSession(c);
    expect(reduceChecked(c, session, { type: 'rewind' }).diagnostics.map((d) => d.code)).toEqual([
      'E_REWIND_AT_START',
    ]);
    expect(
      reduceChecked(c, session, { type: 'choose', beatId: 'b1', key: 'x' }).diagnostics.map(
        (d) => d.code,
      ),
    ).toEqual(['E_CHOOSE_NOT_CHOICE_BEAT']);
    expect(
      reduceChecked(c, session, { type: 'choose', beatId: 'b2', key: 'x' }).diagnostics.map(
        (d) => d.code,
      ),
    ).toEqual(['E_CHOOSE_INVALID_KEY']);
    const atChoice = reduce(c, session, { type: 'advance' });
    expect(reduceChecked(c, atChoice, { type: 'advance' }).diagnostics.map((d) => d.code)).toEqual([
      'E_ADVANCE_UNRESOLVED',
    ]);
    const atEnd = { ...session, cursor: 'b10' };
    expect(reduceChecked(c, atEnd, { type: 'advance' }).diagnostics.map((d) => d.code)).toEqual([
      'E_ADVANCE_AT_END',
    ]);
    expect(reduceChecked(c, session, { type: 'rewind' }).session).toEqual(session);
  });

  it('validateSession reports E_STALE_CHOICE for a choice the walk cannot resolve', () => {
    const c = fixtureConversation();
    expect(
      validateSession(c, { cursor: 'b1', revealed: 'b2', choices: { b2: 'bogus' } }).map(
        (d) => d.code,
      ),
    ).toEqual(['E_STALE_CHOICE']);
    expect(validateSession(c, { cursor: 'b1', revealed: 'b2', choices: {} })).toEqual([]);
  });

  it('applyOp is the shared implementation reduce and reduceChecked both use', () => {
    const c = fixtureConversation();
    const session = initialSession(c);
    const applied = applyOp(c, session, { type: 'choose', beatId: 'b2', key: 'dinner' });
    expect(applied.session).toEqual(
      reduce(c, session, { type: 'choose', beatId: 'b2', key: 'dinner' }),
    );
    expect(applied.codes).toEqual([]);
  });
});
