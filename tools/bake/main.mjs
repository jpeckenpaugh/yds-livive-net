#!/usr/bin/env node
/**
 * The bake CLI (D6 §3, D5 §3.1).
 *
 *   bake --conversation <path>                        write + translator
 *   bake --check --conversation <path>                verify only
 *   bake --check --author-only --conversation <path>  CI default; zero network
 *   bake --author-only --conversation <path>          write, no drafting
 *   bake --prune --conversation <path>                write, drop orphaned records
 *   bake --report --conversation <path>               write review/report.<id>.md
 *   bake --adjudicate review/flags.<id>.json          apply an adjudicated flag list
 *
 * `--author-only` means "no translator is available in this run". M1's and CI's
 * only mode is `--check --author-only`: it validates a committed artifact offline
 * and never evaluates the inference runtime.
 *
 * `--review-policy <shipping|fixture>` is the mechanism behind
 * `meta.reviewPolicy` (D5 §3, D6 §2.2). It defaults to `'fixture'`, so omitting
 * it can never claim a human review; `'shipping'` must be explicit. `--check`
 * reads the policy from the artifact instead and ignores the flag.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { bake, checkHints } from './pipeline.ts';
import { renderReport } from './report.ts';

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

function artifactPaths(sourcePath) {
  const base = sourcePath.endsWith('.source.json')
    ? sourcePath.slice(0, -'.source.json'.length)
    : sourcePath.replace(/\.json$/, '');
  return { artifact: `${base}.json`, glossary: `${base}.glossary.json` };
}

async function loadTranslators() {
  const { loadTranslator } = await import('./translator.node.ts');
  const { buildRegistry } = await import('./registry.build.ts');
  const en = buildRegistry.find((entry) => entry.id === 'opus-mt-en-romance');
  const ro = buildRegistry.find((entry) => entry.id === 'opus-mt-romance-en');
  if (!en || !ro) throw new Error('the build registry is missing an OPUS-MT entry');
  return {
    en2romance: await loadTranslator({ id: 'en-ROMANCE', revision: en.revision }),
    romance2en: await loadTranslator({ id: 'ROMANCE-en', revision: ro.revision }),
  };
}

function report(diagnostics) {
  for (const diagnostic of diagnostics) {
    console.error(
      `[${diagnostic.severity}] ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`,
    );
  }
}

async function main() {
  const adjudicatePath = valueOf('--adjudicate');
  const check = has('--check');
  const authorOnly = has('--author-only');
  const prune = has('--prune');
  const wantReport = has('--report');
  const reviewPolicy = valueOf('--review-policy') ?? 'fixture';

  let sourcePath = valueOf('--conversation');
  let adjudication;
  if (adjudicatePath) {
    adjudication = readJson(adjudicatePath);
    if (!adjudication) {
      console.error(`[error] cannot read flag list ${adjudicatePath}`);
      process.exit(1);
    }
    sourcePath = sourcePath ?? `src/data/conversations/${adjudication.conversationId}.source.json`;
  }

  if (!sourcePath) {
    console.error(
      'usage: bake [--check] [--author-only] [--prune] [--report] --conversation <path>',
    );
    process.exit(2);
  }
  if (!existsSync(sourcePath)) {
    console.error(`[error] source not found: ${sourcePath}`);
    process.exit(2);
  }

  const sourceBytes = readFileSync(sourcePath);
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const sourceDigest = `sha256:v1:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  const paths = artifactPaths(sourcePath);

  const prior = readJson(paths.artifact);
  const overrides = readJson(join('src', 'data', 'glossary.es.json'));
  const translators = authorOnly ? null : await loadTranslators();

  const result = await bake({
    source,
    prior,
    translator: translators,
    mode: check ? 'check' : 'write',
    prune,
    reviewPolicy,
    generatedFrom: sourcePath.split('/').pop(),
    sourceDigest,
    overrides,
    adjudication,
  });

  const hintDiagnostics = checkHints(source);
  const allDiagnostics = [...result.diagnostics, ...result.bakeDiagnostics, ...hintDiagnostics];
  report(allDiagnostics);

  const errors = allDiagnostics.filter((d) => d.severity === 'error').length;

  if (!check && errors === 0) {
    writeJson(paths.artifact, result.conversation);
    writeJson(paths.glossary, result.gloss);
  }

  if (wantReport && !check && errors === 0) {
    const reportPath = join('review', `report.${result.conversation.id}.md`);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, renderReport(result.conversation), 'utf8');
  }

  if (check) {
    console.log(
      `bake --check: ${allDiagnostics.length} diagnostics, ${errors} errors (policy: ${result.conversation.meta.reviewPolicy})`,
    );
  } else {
    console.log(`bake: wrote ${paths.artifact} and ${paths.glossary} (${errors} errors)`);
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`[error] E_SCHEMA ${String(error)}`);
  process.exit(1);
});
