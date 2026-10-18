#!/usr/bin/env node
/**
 * check:ac-map (D5 §7.4, AC-TOOL-10).
 *
 * Milestone-aware. It fails on a missing id, an orphaned id, or a missing test for
 * an id whose milestone is at or before `currentMilestone`; later ids may have an
 * empty `tests` array. No mapped test may be a `describe.skip` — a skipped test is
 * not evidence (E1).
 *
 * Excluded from M1a's gate: it needs every M1 test to exist, and M1a does not ship
 * the UI or the engine. Implemented here as an M1 deliverable.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const map = JSON.parse(readFileSync(join(ROOT, 'tools', 'ac-map.json'), 'utf8'));
const MILESTONE_ORDER = { M1: 1, M2: 2, M3: 3, M4: 4 };
const current = MILESTONE_ORDER[map.currentMilestone] ?? 0;

const docIds = new Set();
for (const file of readdirSync(join(ROOT, 'docs', 'design'))) {
  if (!file.endsWith('.md')) continue;
  const text = readFileSync(join(ROOT, 'docs', 'design', file), 'utf8');
  // `[A-Z0-9]+` rather than `[A-Z]+`: a family name may contain digits (`AC-I18N`),
  // and with the narrower class that whole family is invisible to this check —
  // neither required nor covered.
  for (const match of text.matchAll(/AC-[A-Z0-9]+-\d+/g)) docIds.add(match[0]);
}

const mapIds = new Set(Object.keys(map.ids));
const problems = [];

for (const id of docIds)
  if (!mapIds.has(id)) problems.push(`missing from tools/ac-map.json: ${id}`);
for (const id of mapIds)
  if (!docIds.has(id)) problems.push(`orphaned id in tools/ac-map.json: ${id}`);

for (const [id, entry] of Object.entries(map.ids)) {
  const due = (MILESTONE_ORDER[entry.milestone] ?? 0) <= current;
  if (!due) continue;
  if (!Array.isArray(entry.tests) || entry.tests.length === 0) {
    problems.push(`${id} (${entry.milestone}) has no mapped test`);
    continue;
  }
  for (const test of entry.tests) {
    const path = join(ROOT, 'test', test);
    if (!existsSync(path)) {
      problems.push(`${id}: mapped test does not exist: test/${test}`);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    if (!text.includes(id)) problems.push(`${id}: test/${test} does not reference the id`);
    if (/\.skip\s*\(/.test(text)) problems.push(`${id}: test/${test} contains a skipped test`);
  }
}

if (problems.length > 0) {
  console.error('check:ac-map failed:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`check:ac-map: ${docIds.size} ids, currentMilestone ${map.currentMilestone}`);
