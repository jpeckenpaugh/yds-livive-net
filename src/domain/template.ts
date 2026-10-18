/**
 * Template parsing and rendering (D2 §4.3, §8 INV-2).
 *
 * `{varName}` is the only construct in a template. `{`, `}` and `$` are reserved
 * characters anywhere else; literal braces are not expressible. The set of names
 * appearing in a template is the *derived* read scope — never declared — so a
 * declaration cannot drift from the text.
 */

import type { VarName } from './types.ts';

const SLOT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ParsedTemplate = {
  /** Distinct slot names, in first-appearance order. */
  slots: VarName[];
  /** True when a reserved character appears outside a well-formed `{name}`. */
  reserved: boolean;
};

export function parseTemplate(template: string): ParsedTemplate {
  const slots: VarName[] = [];
  let reserved = false;
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === '$' || ch === '}') {
      reserved = true;
      i += 1;
      continue;
    }
    if (ch === '{') {
      const close = template.indexOf('}', i + 1);
      if (close === -1) {
        reserved = true;
        i += 1;
        continue;
      }
      const name = template.slice(i + 1, close);
      if (SLOT_NAME.test(name)) {
        if (!slots.includes(name)) slots.push(name);
      } else {
        reserved = true;
      }
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return { slots, reserved };
}

/** The derived read scope of a template. */
export function readScopeOf(template: string): VarName[] {
  return parseTemplate(template).slots;
}

/**
 * Substitute `{name}` with the surface form supplied by `surface`. A missing
 * surface form throws rather than rendering an empty string: an unsubstituted
 * slot is exactly the silent failure INV-3 exists to prevent.
 */
export function renderTemplate(template: string, surface: Record<VarName, string>): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const value = surface[name];
    if (value === undefined) {
      throw new Error(`E_UNKNOWN_SLOT: template reads {${name}} with no surface form`);
    }
    return value;
  });
}
