/**
 * The one deterministic edit to the vendored sherpa glue (D5 §3.2).
 *
 * The published glue hard-requires a `.data` pack with the model baked in, and
 * its file offsets are compiled into the minified glue for one specific model.
 * `check:bundle` forbids model weights in `dist/`, so the preload list is
 * emptied and the model is written into the emscripten FS at load instead. This
 * is the whole patch: replace the `loadPackage({files:[…]})` argument with
 * `{files:[]}` and supply an empty preloaded package.
 */
export function patchGlue(glue: string): string {
  const callStart = glue.indexOf('loadPackage({files:[');
  if (callStart === -1) return glue;
  const braceStart = glue.indexOf('{', callStart);
  let depth = 0;
  let i = braceStart;
  let inString = false;
  let quote = '';
  for (; i < glue.length; i += 1) {
    const c = glue[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
    } else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return `${glue.slice(0, braceStart)}{files:[]}${glue.slice(i + 1)}`;
}
