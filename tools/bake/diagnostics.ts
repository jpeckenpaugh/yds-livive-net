/**
 * D6-local diagnostics (D6 §12).
 *
 * Deliberately NOT in D2's frozen `DiagnosticCode` union: the union must stay
 * exactly the set the source and generated-artifact validators can raise, and
 * these are properties of the model, the flag list and the hint rules — raised
 * only by the bake program.
 */

import type { Severity } from '../../src/domain/types.ts';

export type BakeDiagnosticCode =
  | 'E_SENTINEL_IGNORED'
  | 'FLAG-STALE'
  | 'FLAG-REF-UNKNOWN'
  | 'FLAG-DUP-REF'
  | 'FLAG-UNKNOWN-CATEGORY'
  | 'FLAG-REVIEWER-IS-DRAFTER'
  | 'FLAG-OPEN'
  | 'HINT-TOO-LONG'
  | 'HINT-ECHOES-LINE'
  | 'GLOSS-IDENTITY';

export type BakeDiagnostic = {
  code: BakeDiagnosticCode;
  severity: Severity;
  path: string;
  message: string;
};

export const BAKE_SEVERITY: Record<BakeDiagnosticCode, Severity> = {
  E_SENTINEL_IGNORED: 'error',
  'FLAG-STALE': 'error',
  'FLAG-REF-UNKNOWN': 'error',
  'FLAG-DUP-REF': 'error',
  'FLAG-UNKNOWN-CATEGORY': 'error',
  'FLAG-REVIEWER-IS-DRAFTER': 'error',
  'FLAG-OPEN': 'warn',
  'HINT-TOO-LONG': 'error',
  'HINT-ECHOES-LINE': 'error',
  'GLOSS-IDENTITY': 'error',
};

export function bakeDiagnostic(
  code: BakeDiagnosticCode,
  path: string,
  message: string,
): BakeDiagnostic {
  return { code, severity: BAKE_SEVERITY[code], path, message };
}

/** Authoring-quality constants (D6 §12). */
export const HINT_MAX_CHARS = 60;
export const HINT_ECHO_MIN_TOKENS = 4;
export const HINT_QUOTE_CHARS = ['"', '\u201c', '\u201d', '\u00ab', '\u00bb'];
export const REVIEW_FLAG_TARGET = 0.2;
export const GLOSS_PRIORITY_TOP_N = 20;
export const MAX_GLOSS_KEYS_WARN = 250;
export const NO_MACHINE_OUTPUT = '';
