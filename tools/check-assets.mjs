#!/usr/bin/env node
/**
 * check:assets (D5 §6.2, AC-TOOL-13, AC-ENG-14).
 *
 * - no file > 100 KB under `src/`
 * - no `.bin`, `.onnx`, `.onnx_data` or `.wasm` anywhere under `src/`
 * - no file > 1 MB under `src/data/`
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BINARY = /\.(bin|onnx|onnx_data|wasm)$/;
const MAX_SRC_BYTES = 100 * 1024;
const MAX_DATA_BYTES = 1024 * 1024;

const problems = [];

/** @param {string} dir */
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    const rel = relative(ROOT, path);
    if (BINARY.test(entry))
      problems.push(`${rel}: binary files are never committed under src/ (D3 / PM C10)`);
    if (stat.size > MAX_SRC_BYTES) problems.push(`${rel}: ${stat.size} bytes exceeds 100 KB`);
    if (rel.startsWith(join('src', 'data')) && stat.size > MAX_DATA_BYTES) {
      problems.push(`${rel}: ${stat.size} bytes exceeds 1 MB under src/data/`);
    }
  }
}

walk(SRC);

if (problems.length > 0) {
  console.error('check:assets failed:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('check:assets: no binary or oversized assets under src/');
