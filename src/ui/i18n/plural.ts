/**
 * Plural selection (D4 §18.2).
 *
 * A `count === 1 ? one : other` substitution is not enough on its own — Spanish
 * changes the *verb* as well as the noun (*se restableció 1 turno* versus *se
 * restablecieron N turnos*), so each plural message supplies both full forms
 * rather than a stem plus a suffix.
 *
 * Two forms cover English and Spanish. A language with a paucal (Polish, Russian)
 * would need a third; that is a real gap, recorded rather than assumed away.
 */

export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}
