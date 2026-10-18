#!/usr/bin/env node
/**
 * check:contracts — the frozen-contract manifest guard (D5 §10.1, AC-TOOL-24).
 *
 * The ignore list stops *prettier* rewriting the contracts. This stops
 * **anything** doing it silently. It fails on any hash mismatch **and** on the
 * file set differing (an added, removed or renamed contract is a failure too).
 *
 * `--update` is the only writer, it is exposed as `npm run contracts:update`, and
 * it is deliberately absent from `check` and CI: regenerating the manifest is an
 * explicit, reviewable act that accompanies a legitimate contract amendment.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTRACTS = ['src/domain/types.ts', 'src/engines/ports.ts'];
const MANIFEST = join(ROOT, 'tools', 'contracts.sha256');

/** @param {string} rel */
function hashOf(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function render() {
  return `${CONTRACTS.map((rel) => `${hashOf(rel)}  ${rel}`).join('\n')}\n`;
}

if (process.argv.includes('--update')) {
  writeFileSync(MANIFEST, render(), 'utf8');
  console.log(`contracts:update: wrote tools/contracts.sha256 (${CONTRACTS.length} contracts)`);
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.error('check:contracts failed: tools/contracts.sha256 is missing');
  process.exit(1);
}

const entries = readFileSync(MANIFEST, 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    return match ? { hash: match[1], path: match[2] } : { hash: null, path: line };
  });

const problems = [];
const listedPaths = entries.map((entry) => entry.path);
if (
  listedPaths.length !== CONTRACTS.length ||
  CONTRACTS.some((rel) => !listedPaths.includes(rel))
) {
  problems.push(
    `manifest file set differs from the frozen contract set: [${listedPaths.join(', ')}]`,
  );
}
for (const rel of CONTRACTS) {
  const actual = hashOf(rel);
  if (actual === null) {
    problems.push(`${rel}: missing`);
    continue;
  }
  const entry = entries.find((candidate) => candidate.path === rel);
  if (!entry || entry.hash !== actual) {
    problems.push(`${rel}: hash mismatch (manifest ${entry?.hash ?? 'absent'}, actual ${actual})`);
  }
}
for (const entry of entries) {
  if (!CONTRACTS.includes(entry.path)) problems.push(`unexpected entry in manifest: ${entry.path}`);
}

if (problems.length > 0) {
  console.error('check:contracts failed — a frozen contract moved:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    'If this is a legitimate amendment, run `npm run contracts:update` in the same commit as the doc edit.',
  );
  process.exit(1);
}
console.log(`check:contracts: ${CONTRACTS.length} frozen contracts unchanged`);
