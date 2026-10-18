/**
 * Test helpers: the fixture conversation, a minimal valid source, and a clone.
 *
 * `test/helpers/**` is not a Vitest project of its own; it is imported by specs in
 * the `domain` and `bake` projects.
 */

import type { Conversation, ConversationSource } from '../../src/domain/types.ts';
import source from '../../src/data/conversations/m1-fixture.source.json';
import artifact from '../../src/data/conversations/m1-fixture.json';

export function fixtureSource(): ConversationSource {
  return clone(source as unknown as ConversationSource);
}

export function fixtureConversation(): Conversation {
  return clone(artifact as unknown as Conversation);
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A small valid conversation used for mutation tests:
 * b1 fixed, b2 choice writing `x`, b3 fixed reading `x`.
 */
export function minimalSource(): ConversationSource {
  return {
    id: 'minimal',
    title: 'Minimal',
    l1: 'en',
    l2: 'es',
    characters: {
      a: { name: 'A', voice: 'M1' },
      b: { name: 'B', voice: 'M2' },
    },
    variables: [
      {
        name: 'x',
        values: [
          { key: 'p', l1: 'P' },
          { key: 'q', l1: 'Q' },
        ],
      },
    ],
    beats: [
      { id: 'b1', speaker: 'a', line: [{ id: 'b1-l1', template: 'Hello there.' }] },
      {
        id: 'b2',
        speaker: 'b',
        choiceSets: [
          {
            id: 'b2-s1',
            options: [
              { key: 'p', label: { l1: 'P', l2: 'P' }, template: 'I pick p.', sets: { x: 'p' } },
              { key: 'q', label: { l1: 'Q', l2: 'Q' }, template: 'I pick q.', sets: { x: 'q' } },
            ],
          },
        ],
      },
      { id: 'b3', speaker: 'a', line: [{ id: 'b3-l1', template: '{x} it is.' }] },
    ],
  };
}
