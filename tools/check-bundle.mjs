#!/usr/bin/env node
/**
 * check:bundle (D5 §6.3, AC-TOOL-09, AC-TOOL-19, AC-ENG-20).
 *
 * Post-build, over `dist/`. The forbidden list is **engine-derived**: a flat list
 * cannot be right in both M1 and M3 (D3 §11.1 rule 5).
 *
 * Excluded from M1a's gate: it needs an engine-derived list that only matters once
 * an engine exists. It is implemented here as an M1 deliverable.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const MAX_BUNDLE_GZ_KB = 90;
const ALWAYS_FORBIDDEN = ['transformers', 'onnxruntime', 'opus-mt'];
const engine = process.env.TTS_ENGINE ?? 'speech-synthesis';
const CONDITIONAL_FORBIDDEN = engine === 'speech-synthesis' ? ['supertonic', 'sherpa'] : [];
const BINARY = /\.(onnx|onnx_data|bin|wasm)$/;
// XML/SVG namespace URIs are identifiers, not network origins. The allow-list
// matches the **identifier exactly**, never the host generally (D5 §6.3 rule 7).
const ALLOWED_URLS = new Set([
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
]);
const URL_RE = /https?:\/\/[^\s"'`<>()\\,;]+/gi;

const problems = [];

if (!existsSync(DIST)) {
  console.error('check:bundle failed: dist/ does not exist (run `npm run build`)');
  process.exit(1);
}

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
const forbidden = [...ALWAYS_FORBIDDEN, ...CONDITIONAL_FORBIDDEN];

let gzBytes = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  if (BINARY.test(file)) problems.push(`${rel}: binary asset in dist/`);
  if (!/\.(js|html|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const needle of forbidden) {
    if (text.includes(needle))
      problems.push(`${rel}: forbidden string "${needle}" in emitted JS/HTML/CSS`);
  }
  for (const match of text.matchAll(URL_RE)) {
    if (!ALLOWED_URLS.has(match[0])) problems.push(`${rel}: absolute origin ${match[0]}`);
  }
  if (file.endsWith('.js')) gzBytes += gzipSync(Buffer.from(text)).length;
}

const gzKb = gzBytes / 1024;
if (gzKb > MAX_BUNDLE_GZ_KB) {
  problems.push(`dist/assets/*.js total gzip ${gzKb.toFixed(1)} KB exceeds ${MAX_BUNDLE_GZ_KB} KB`);
}

if (!existsSync(join(DIST, 'index.html'))) problems.push('dist/index.html is missing');

if (problems.length > 0) {
  console.error('check:bundle failed:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `check:bundle: ${emitted.length} emitted files, ${gzKb.toFixed(1)} KB gzip, engine=${engine}`,
);
