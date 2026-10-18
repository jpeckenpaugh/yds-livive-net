#!/usr/bin/env node
/**
 * check:vocabulary (D5 §6.1, AC-TOOL-07, AC-ENG-12).
 *
 * `int8` and `q8` are never used interchangeably anywhere in this repo, including
 * comments. The check is scoped to **code files only** and ignores `docs/**`,
 * because D3's own prose must be able to name the wrong term in order to forbid
 * it. A repo-wide grep would fail on its own spec.
 *
 * The match is case-sensitive: `q8` is the transformers.js dtype string, while
 * `Q8` is a PM ruling id and is not the forbidden term.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CODE = /\.(ts|tsx|js|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'test-artifacts', '.git', 'docs']);
// This script names the forbidden term in its own messages; skip it.
const SKIP_FILES = new Set([join(ROOT, 'tools', 'check-vocabulary.mjs')]);

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(path, out);
    } else if (CODE.test(entry) && !SKIP_FILES.has(path)) {
      out.push(path);
    }
  }
}

const files = [];
walk(ROOT, files);

const offenders = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (/\bq8\b/.test(line)) offenders.push(`${relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
  });
}

if (offenders.length > 0) {
  console.error(
    'check:vocabulary failed — use `int8`; the dtype string must not appear in code (D5 §6.1):',
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}
console.log(`check:vocabulary: ${files.length} code files, vocabulary consistent`);
