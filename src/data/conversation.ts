/**
 * The single entry point for the M1 conversation (D6 §2.1, amendment F1).
 *
 * `src/ui/**` imports `conversation` from here and nowhere else. That is what
 * makes the M2 swap one import path plus one deletion: point the import at the
 * shipping artifact and delete the fixture files.
 */

import type { Conversation } from '../domain/types.ts';
import fixture from './conversations/m1-fixture.json';

export const conversation: Conversation = fixture as unknown as Conversation;
