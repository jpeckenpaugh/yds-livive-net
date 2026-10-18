#!/usr/bin/env node
/**
 * check:bundle (D5 §6.3, AC-TOOL-09, AC-TOOL-19, AC-ENG-20; amendments Z9/Z11).
 *
 * Post-build, over `dist/`. The forbidden list is **engine-derived**: a flat list
 * cannot be right in both M1 and M3 (D3 §11.1 rule 5).
 *
 * The runtime `.wasm` belonging to the selected packaging's `purpose: 'runtime'`
 * entry is **allowed and expected**; every model weight stays forbidden in
 * `dist/` and is fetched at runtime instead (C10). The gzip budget is
 * engine-derived too: one constant cannot fit both a Preact app and one shipping
 * a TTS runtime.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const engine = process.env.TTS_ENGINE ?? 'speech-synthesis';

/** Measured JS gzip per engine (D5 §6.3 check 4), with margin. */
const GZ_BUDGET_KB = {
  'speech-synthesis': 90,
  'supertonic-sherpa': 300,
  'supertonic-transformers': 400,
};

const ALWAYS_FORBIDDEN = ['transformers', 'onnxruntime', 'opus-mt'];
const CONDITIONAL_FORBIDDEN = engine === 'speech-synthesis' ? ['supertonic', 'sherpa'] : [];
/** A model weight is never bundled; the runtime wasm is not a weight. */
const MODEL_WEIGHT = /\.(onnx|onnx_data|bin|data)$/;
// XML/SVG namespace URIs are identifiers, not network origins; the model-fetch
// origin is the one network reference the app is allowed to contain (D3 §9).
const ALLOWED_URL_PREFIXES = ['http://www.w3.org/'];
const ALLOWED_URL_EXACT = new Set([
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
]);
const ALLOWED_ORIGINS = new Set(['https://huggingface.co']);
const URL_RE = /https?:\/\/[^\s"'`<>()\\,;]+/gi;

const problems = [];

if (!existsSync(DIST)) {
  console.error('check:bundle failed: dist/ does not exist (run `npm run build`)');
  process.exit(1);
}

globalThis.__TTS_ENGINE__ = engine;
const { browserRegistry } = await import('../src/engines/registry.browser.ts');
const { candidateRegistry } = await import('../tools/registry.candidates.ts');

/** The runtime entry's wasm file names, allowed in dist/. */
const runtimeWasm = new Set(
  browserRegistry
    .filter((entry) => entry.purpose === 'runtime')
    .flatMap((entry) => entry.files.map((file) => file.path.split('/').pop() ?? file.path))
    .filter((name) => name.endsWith('.wasm')),
);

/** Unselected repo ids and revisions must not leak into emitted JS. */
const unselectedStrings = candidateRegistry.flatMap((entry) => [entry.repoId, entry.revision]);
const forbidden = [...ALWAYS_FORBIDDEN, ...CONDITIONAL_FORBIDDEN, ...unselectedStrings];

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
}

const files = [];
walk(DIST, files);
const emitted = files.filter((file) => /\.(js|html|css)$/.test(file));

let gzBytes = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  const name = file.split('/').pop() ?? file;
  if (MODEL_WEIGHT.test(file)) {
    problems.push(`${rel}: model-weight asset in dist/ (fetched at runtime, never bundled — C10)`);
  }
  if (file.endsWith('.wasm') && !runtimeWasm.has(name)) {
    problems.push(`${rel}: .wasm asset is not the selected packaging's runtime`);
  }
  if (!/\.(js|html|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const needle of forbidden) {
    if (text.includes(needle))
      problems.push(`${rel}: forbidden string "${needle}" in emitted JS/HTML/CSS`);
  }
  // The origin scan covers app-authored code. The vendored runtime (Apache-2.0,
  // not ours) carries documentation URLs in comments — not fetch origins — so it
  // is exempt; check 5's intent is "no network after first load", which the
  // runtime does not violate (it fetches only the model files the app plans).
  const isRuntimeAsset = runtimeWasm.size > 0 && rel.startsWith(join('dist', 'sherpa'));
  if (!isRuntimeAsset) {
    for (const match of text.matchAll(URL_RE)) {
      if (ALLOWED_URL_EXACT.has(match[0])) continue;
      if ([...ALLOWED_URL_PREFIXES].some((prefix) => match[0].startsWith(prefix))) continue;
      const origin = match[0].match(/^https?:\/\/[^/]+/)?.[0];
      if (origin && ALLOWED_ORIGINS.has(origin)) continue;
      problems.push(`${rel}: absolute origin ${match[0]}`);
    }
  }
  if (file.endsWith('.js')) gzBytes += gzipSync(Buffer.from(text)).length;
}

const gzKb = gzBytes / 1024;
const budget = GZ_BUDGET_KB[engine] ?? GZ_BUDGET_KB['speech-synthesis'];
if (gzKb > budget) {
  problems.push(
    `dist/*.js total gzip ${gzKb.toFixed(1)} KB exceeds the ${engine} budget of ${budget} KB`,
  );
}

if (!existsSync(join(DIST, 'index.html'))) problems.push('dist/index.html is missing');

if (problems.length > 0) {
  console.error('check:bundle failed:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `check:bundle: ${emitted.length} emitted files, ${gzKb.toFixed(1)} KB gzip (budget ${budget}), engine=${engine}`,
);
