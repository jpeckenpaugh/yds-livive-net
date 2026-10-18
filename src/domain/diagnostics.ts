/**
 * The diagnostic registry's severity table (D2 §14).
 *
 * D2 §14 is the single home of the registry; `DiagnosticCode` in `types.ts` is
 * its machine-readable mirror. This module adds the one thing the union cannot
 * carry — the severity of each code — so a validator can emit a `Diagnostic`
 * without repeating the table at every call site.
 *
 * `Record<DiagnosticCode, Severity>` is exhaustive by construction: adding a
 * code to the union without a severity is a type error.
 */

import type { Diagnostic, DiagnosticCode, Severity } from './types.ts';

export const DIAGNOSTIC_SEVERITY: Record<DiagnosticCode, Severity> = {
  // structure
  E_SCHEMA: 'error',
  E_SCHEMA_VERSION: 'error',
  E_DUPLICATE_BEAT_ID: 'error',
  E_DUPLICATE_LINE_ID: 'error',
  E_DUPLICATE_CHOICE_SET_ID: 'error',
  E_DUPLICATE_CHOICE_KEY: 'error',
  E_DUPLICATE_VAR: 'error',
  E_DUPLICATE_VALUE_KEY: 'error',
  E_BEAT_ARITY: 'error',
  // templates and literals
  E_TEMPLATE_RESERVED_CHAR: 'error',
  E_UNKNOWN_SLOT: 'error',
  E_UNKNOWN_VAR: 'error',
  E_UNKNOWN_VALUE: 'error',
  E_NULL_WRITE: 'error',
  E_EMPTY_WHEN: 'error',
  E_LABEL_SLOT: 'error',
  E_HINT_SLOT: 'error',
  E_LABEL_MISSING_LANG: 'error',
  E_MISSING_SURFACE_FORM: 'error',
  E_CHOICE_OPTIONS_MIN: 'error',
  E_CHOICE_OPTIONS_MAX: 'error',
  // when discipline
  E_NO_MATCH: 'error',
  E_AMBIGUOUS_MATCH: 'error',
  E_MULTIPLE_FALLBACK: 'error',
  E_FALLBACK_NOT_LAST: 'error',
  E_DEAD_ALTERNATIVE: 'error',
  // variable discipline
  E_DEAD_VARIABLE: 'error',
  E_READ_UNSET: 'error',
  E_BOUND_PAIR_SLOPPY: 'error',
  E_BOUND_PAIR_AMBIGUOUS: 'error',
  // enumeration limits
  E_ENUM_LIMIT_VARIANTS: 'error',
  E_ENUM_LIMIT_ASSIGNMENTS: 'error',
  // generated artifact and gloss
  E_VARIANT_KEY_COLLISION: 'error',
  E_VARIANT_MISSING: 'error',
  E_ORPHAN_VARIANT: 'warn',
  E_UNREVIEWED: 'error',
  E_EDITED_NOT_OWNER: 'error',
  E_GLOSS_EDITED_NOT_OWNER: 'error',
  E_SOURCE_STALE: 'error',
  E_TRANSLATOR_REV_STALE: 'error',
  E_GLOSS_MISSING: 'error',
  E_ORPHAN_GLOSS: 'warn',
  E_L2_RESERVED_CHAR: 'error',
  // session (dev only)
  E_CHOOSE_INVALID_KEY: 'dev',
  E_CHOOSE_NOT_CHOICE_BEAT: 'dev',
  E_ADVANCE_UNRESOLVED: 'dev',
  E_ADVANCE_AT_END: 'dev',
  E_REWIND_AT_START: 'dev',
  E_STALE_CHOICE: 'dev',
};

/** The registry's codes, in D2 §14 order. Used by tests to prove the count. */
export const DIAGNOSTIC_CODES: readonly DiagnosticCode[] = Object.keys(
  DIAGNOSTIC_SEVERITY,
) as DiagnosticCode[];

export function diagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  return { code, severity: DIAGNOSTIC_SEVERITY[code], path, message };
}
