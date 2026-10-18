#!/usr/bin/env node
/**
 * Generate a **content** conversation artifact from its authored source and its
 * authored bilingual table (D6 §2).
 *
 * These are not fixtures. The Spanish is authored, so the artifact's `l2 === mt`
 * holds by construction, and the policy is `shipping` with
 * `reviewedBy: 'agent'` — an agent produced and triaged it and the owner has not
 * adjudicated it. Nothing claims otherwise.
 *
 * The difference that matters: under `shipping`, `GLOSS-IDENTITY` is an error, so
 * every span of every variant must carry a real English gloss. That is the rule
 * that makes a shortcut impossible, and the reason a missing gloss shows up as a
 * diagnostic rather than as a learner seeing Spanish echoed back.
 *
 *   node tools/bake/content.mjs             # write every content conversation
 *   node tools/bake/content.mjs <id>        # write one
 *   node tools/bake/content.mjs --check     # validate only, write nothing
 *   node tools/bake/content.mjs --dump <id> # list what the table still needs
 *
 * `--dump` exists because authoring against one-error-at-a-time is miserable: a
 * missing forward entry used to abort the run, so gaps surfaced singly. Both
 * directions now report their complete work list in one pass.
 *
 * The fixture is excluded: it has its own generator (`npm run bake:fixture`).
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { normalizeSpan, segmentL2 } from '../../src/domain/segment.ts';
import { bake, checkHints } from './pipeline.ts';
import { renderReport } from './report.ts';

const CONVERSATIONS_DIR = 'src/data/conversations';
const TABLES_DIR = 'tools/bake/content';
const FIXTURE_ID = 'm1-fixture';
const REVISION = 'authored-1';

/**
 * A flat bilingual phrase table, used in both directions.
 *
 * The forward direction is keyed on the *rendered English line*, because the
 * pipeline renders every reachable variant before translating it — so the Spanish
 * for each variant is authored, never assembled from parts.
 *
 * The reverse direction is keyed on the Spanish **span** text, because the gloss
 * index is built by segmenting the Spanish. So the table has to carry the phrases
 * as well as the whole lines.
 *
 * A missing forward entry is **collected, not thrown**: throwing aborted the run
 * and hid every other gap behind the first. The English is returned so the
 * artifact is still produced for inspection, and the caller turns the collected
 * list into hard diagnostics.
 */
function authoredTranslators(table) {
  const reverse = new Map();
  for (const [en, es] of Object.entries(table)) reverse.set(es, en);
  const missing = [];

  return {
    missing,
    translators: {
      en2romance: {
        revision: REVISION,
        translate({ text }) {
          const value = table[text];
          if (value === undefined) {
            missing.push(text);
            return Promise.resolve(text);
          }
          return Promise.resolve(value);
        },
      },
      romance2en: {
        revision: REVISION,
        translate({ text }) {
          // Falling back to the span text rather than rejecting keeps an
          // unglossed span reporting as GLOSS-IDENTITY with its key, instead of a
          // stack trace — and it is what makes the dump list possible, because a
          // fallback records the Spanish span as the entry's `mt`.
          return Promise.resolve(reverse.get(text) ?? reverse.get(normalizeSpan(text)) ?? text);
        },
      },
    },
  };
}

function contentIds() {
  return readdirSync(CONVERSATIONS_DIR)
    .filter((name) => name.endsWith('.source.json'))
    .map((name) => basename(name, '.source.json'))
    .filter((id) => id !== FIXTURE_ID)
    .sort();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonIfPresent(path) {
  try {
    return readJson(path);
  } catch {
    return undefined;
  }
}

function load(id) {
  const sourcePath = join(CONVERSATIONS_DIR, `${id}.source.json`);
  const tablePath = join(TABLES_DIR, `${id}.es.json`);
  const sourceBytes = readFileSync(sourcePath);
  return {
    source: JSON.parse(sourceBytes.toString('utf8')),
    table: JSON.parse(readFileSync(tablePath, 'utf8')),
    sourceDigest: `sha256:v1:${createHash('sha256').update(sourceBytes).digest('hex')}`,
  };
}

async function bakeOne(id, mode) {
  const { source, table, sourceDigest } = load(id);
  const { translators, missing } = authoredTranslators(table);

  // Check mode diffs against the committed artifact. If there isn't one, that is
  // an authoring state, not a build failure of the conversation — say so plainly
  // rather than surfacing the pipeline's internal `E_SCHEMA`.
  const prior =
    mode === 'check' ? readJsonIfPresent(join(CONVERSATIONS_DIR, `${id}.json`)) : undefined;
  if (mode === 'check' && prior === undefined) {
    return { result: null, missing, ungenerated: true };
  }

  const result = await bake({
    source,
    translator: translators,
    mode,
    reviewPolicy: 'shipping',
    generatedFrom: `${id}.source.json`,
    sourceDigest,
    prior,
  });
  return { result, missing, ungenerated: false };
}

/**
 * The exact text of every distinct span, keyed the way the gloss index keys it.
 *
 * Needed to tell a genuine gap from a correct gloss: `GLOSS-IDENTITY` compares the
 * gloss against the *span text*, and `origin === 'mt'` implies `l1 === mt` for
 * every machine gloss, so the origin pair alone selects everything.
 */
function spanTextsOf(conversation, l2) {
  const map = new Map();
  for (const record of Object.values(conversation.lines)) {
    for (const span of segmentL2(record.l2, l2)) {
      // First occurrence wins, matching `draftGlosses`. Last-wins silently drops
      // every key whose first and last raw text differ — e.g. `todo bien` arrives
      // first as the clause `¿Todo bien,` and last as the predicate `Todo bien` —
      // and those keys are exactly the ones that then fail GLOSS-IDENTITY.
      if (!map.has(span.key)) map.set(span.key, span.text);
    }
  }
  return map;
}

/** Everything the table still needs, in one pass. */
function gaps(result, missing, l2) {
  const lines = [...new Set(missing)].sort();
  const spanTexts = spanTextsOf(result.conversation, l2);
  const spans = Object.entries(result.gloss)
    .filter(([key, entry]) => entry.origin === 'mt' && entry.l1 === spanTexts.get(key))
    .map(([key, entry]) => ({ key, spanish: spanTexts.get(key) ?? entry.mt }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { lines, spans };
}

async function dump(id) {
  const { source } = load(id);
  const { result, missing } = await bakeOne(id, 'write');
  const { lines, spans } = gaps(result, missing, source.l2);
  const rendered = [...new Set(Object.values(result.conversation.lines).map((r) => r.l1))].sort();

  console.log(`# ${id}`);
  console.log(`\n## rendered English lines (${rendered.length}) — forward table keys`);
  for (const line of rendered) console.log(`  ${line}`);

  console.log(`\n## lines with no Spanish yet (${lines.length})`);
  if (lines.length === 0) console.log('  (none)');
  for (const line of lines) console.log(`  ${line}`);

  console.log(`\n## Spanish spans with no English gloss (${spans.length}) — reverse table keys`);
  if (spans.length === 0) console.log('  (none)');
  for (const span of spans) console.log(`  ${span.spanish}`);
}

async function processOne(id, mode) {
  const { result, missing, ungenerated } = await bakeOne(id, mode);

  if (ungenerated || !result) {
    console.error(
      `[error] CONTENT-NO-ARTIFACT ${id}: the source exists but no artifact has been generated — run: node tools/bake/content.mjs ${id}`,
    );
    return 1;
  }

  const diagnostics = [
    ...result.diagnostics,
    ...result.bakeDiagnostics,
    ...checkHints(sourceOf(id)),
  ];
  for (const line of [...new Set(missing)].sort()) {
    diagnostics.push({
      severity: 'error',
      code: 'CONTENT-MISSING-LINE',
      path: 'table',
      message: `no authored Spanish for this rendered line: ${line}`,
    });
  }
  for (const diagnostic of diagnostics) {
    console.error(
      `[${diagnostic.severity}] ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`,
    );
  }
  const errors = diagnostics.filter((d) => d.severity === 'error');

  if (errors.length === 0 && mode === 'write') {
    writeJson(join(CONVERSATIONS_DIR, `${id}.json`), result.conversation);
    writeJson(join(CONVERSATIONS_DIR, `${id}.glossary.json`), result.gloss);
    mkdirSync('review', { recursive: true });
    writeFileSync(join('review', `report.${id}.md`), renderReport(result.conversation), 'utf8');
    console.log(
      `${id}: ${Object.keys(result.conversation.lines).length} line records, ${Object.keys(result.gloss).length} gloss keys`,
    );
  } else if (errors.length === 0) {
    console.log(`${id}: ok`);
  }

  return errors.length;
}

let sourceCache = null;
function sourceOf(id) {
  if (sourceCache?.id !== id) sourceCache = { id, source: load(id).source };
  return sourceCache.source;
}

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const dumpMode = argv.includes('--dump');
const ids = argv.filter((arg) => !arg.startsWith('--'));

if (dumpMode) {
  const targets = ids.length > 0 ? ids : contentIds();
  for (const id of targets) await dump(id);
  process.exit(0);
}

const targets = ids.length > 0 ? ids : contentIds();

if (targets.length === 0) {
  console.log('content: no conversations found (nothing to do)');
  process.exit(0);
}

let failures = 0;
for (const id of targets) {
  failures += await processOne(id, check ? 'check' : 'write');
}

if (failures > 0) {
  console.error(`content: ${failures} error(s)`);
  process.exit(1);
}
