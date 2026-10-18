#!/usr/bin/env node
/**
 * Regenerate the committed M1 fixture artifact from the authored source and the
 * fixture translator (D6 §2, §4.2).
 *
 * This is the one command that produces `m1-fixture.json`,
 * `m1-fixture.glossary.json` and `review/report.m1-fixture.md`. It is *not* part
 * of the gate: `bake:check --author-only` validates the committed artifact
 * offline. `npm run bake:fixture` exists so the fixture is reproducible rather
 * than hand-edited.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { bake, checkHints } from '../pipeline.ts';
import { renderReport } from '../report.ts';
import { fixtureTranslators } from './fixture-translator.ts';

const sourcePath = 'src/data/conversations/m1-fixture.source.json';
const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes.toString('utf8'));
const sourceDigest = `sha256:v1:${createHash('sha256').update(sourceBytes).digest('hex')}`;
const overrides = JSON.parse(readFileSync(join('src', 'data', 'glossary.es.json'), 'utf8'));

const result = await bake({
  source,
  translator: fixtureTranslators,
  mode: 'write',
  reviewPolicy: 'fixture',
  generatedFrom: 'm1-fixture.source.json',
  sourceDigest,
  overrides,
});

const hints = checkHints(source);
const diagnostics = [...result.diagnostics, ...result.bakeDiagnostics, ...hints];
for (const diagnostic of diagnostics) {
  console.error(
    `[${diagnostic.severity}] ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`,
  );
}
const errors = diagnostics.filter((d) => d.severity === 'error').length;
if (errors > 0) {
  console.error(`fixture generation failed with ${errors} errors`);
  process.exit(1);
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

write('src/data/conversations/m1-fixture.json', result.conversation);
write('src/data/conversations/m1-fixture.glossary.json', result.gloss);
mkdirSync('review', { recursive: true });
writeFileSync('review/report.m1-fixture.md', renderReport(result.conversation), 'utf8');
console.log(
  `fixture: ${Object.keys(result.conversation.lines).length} line records, ${Object.keys(result.gloss).length} gloss keys`,
);
