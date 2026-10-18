/**
 * The network guard for the `domain` and `bake` projects (D5 §7.3, AC-TOOL-15).
 *
 * A real `fetch` in either project is a bug: M1 ships zero downloads and the bake
 * pipeline must run offline against an injected translator. Replacing the global
 * with a thrower makes "zero network" a test result rather than a claim. The
 * `ui` project deliberately does not load this file.
 */
globalThis.fetch = () => {
  throw new Error('network access is forbidden in the domain/bake/engines projects (D5 §7.3)');
};
