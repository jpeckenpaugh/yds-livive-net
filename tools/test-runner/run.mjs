#!/usr/bin/env node
/**
 * The evidence producer (D5 §10, D1 §6, AC-TOOL-23).
 *
 * Runs a gate in order, fail-fast is *not* applied here (every step runs so the
 * log shows the whole picture), and writes:
 *
 *   test-artifacts/test.log     full captured output of every step
 *   test-artifacts/result.json  machine-readable per-AC pass/fail + exit codes
 *   test-artifacts/<n>-*.png    numbered screenshots (the browser job, M1b)
 *
 * `test-artifacts/` is generated and ignored; only its `README.md` is committed.
 *
 *   node tools/test-runner/run.mjs          M1a's gate subset
 *   node tools/test-runner/run.mjs --full   the full D5 §3 `check` order
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
// D5 §3's `check` order, contracts first, plus the browser job (D5 §9 step 10).
const GATE = [
  'check:contracts',
  'format:check',
  'lint',
  'typecheck',
  'check:vocabulary',
  'bake:check',
  'test',
  'build',
  'check:bundle',
  'check:assets',
  'check:ac-map',
  'e2e',
];
const GATE_ONLY = GATE.filter((step) => step !== 'e2e');

const steps = process.argv.includes('--no-e2e') ? GATE_ONLY : GATE;
const log = [];
const gate = [];

for (const step of steps) {
  const started = Date.now();
  const result = spawnSync('npm', ['run', step], { cwd: ROOT, encoding: 'utf8' });
  const exitCode = result.status ?? 1;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  log.push(
    `\n===== npm run ${step} (exit ${exitCode}, ${Date.now() - started} ms) =====\n${output}`,
  );
  gate.push({ step, exitCode, ok: exitCode === 0 });
  console.log(`${exitCode === 0 ? 'ok  ' : 'FAIL'} ${step}`);
}

const map = JSON.parse(readFileSync(join(ROOT, 'tools', 'ac-map.json'), 'utf8'));
const testOk = gate.find((entry) => entry.step === 'test')?.ok ?? false;
const acs = {};
for (const [id, entry] of Object.entries(map.ids)) {
  if (!Array.isArray(entry.tests) || entry.tests.length === 0) {
    acs[id] = { status: 'unmapped', milestone: entry.milestone };
  } else {
    acs[id] = { status: testOk ? 'pass' : 'fail', milestone: entry.milestone, tests: entry.tests };
  }
}

const exitCode = gate.find((entry) => !entry.ok)?.exitCode ?? 0;
const result = {
  milestone: map.currentMilestone,
  gate,
  exitCode,
  acs,
};

mkdirSync(join(ROOT, 'test-artifacts'), { recursive: true });
writeFileSync(join(ROOT, 'test-artifacts', 'test.log'), log.join('\n'), 'utf8');
writeFileSync(
  join(ROOT, 'test-artifacts', 'result.json'),
  `${JSON.stringify(result, null, 2)}\n`,
  'utf8',
);
console.log(`evidence written to test-artifacts/ (exit ${exitCode})`);
process.exit(exitCode === 0 ? 0 : 1);
