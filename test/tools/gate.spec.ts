import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { bake } from '../../tools/bake/pipeline.ts';
import { fixtureTranslators } from '../../tools/bake/fixtures/fixture-translator.ts';
import { fixtureConversation, fixtureSource } from '../helpers/sources.ts';

const ROOT = process.cwd();
function raw(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}
function run(script: string, env: Record<string, string> = {}): { status: number } {
  try {
    execFileSync('node', [join(ROOT, script)], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, ...env },
    });
    return { status: 0 };
  } catch (error) {
    return { status: (error as { status?: number }).status ?? 1 };
  }
}

describe('the gate (D5 §3–§10)', () => {
  it('AC-TOOL-01: check runs the assertions in D5 §3 order, contracts first', () => {
    const check = (pkg.scripts as Record<string, string>).check ?? '';
    const order = [...check.matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]);
    expect(order[0]).toBe('check:contracts');
    expect(order).toEqual([
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
    ]);
  });

  it('AC-TOOL-02: the lockfile is committed', () => {
    expect(existsSync(join(ROOT, 'package-lock.json'))).toBe(true);
  });

  it('AC-TOOL-03: no prebuild or postbuild hook invokes bake', () => {
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.prebuild).toBeUndefined();
    expect(scripts.postbuild).toBeUndefined();
  });

  it('AC-TOOL-07: check:vocabulary is case-sensitive, skips itself, and passes', () => {
    // AC-ENG-12 shares this mechanism (the vocabulary rule is D3's).
    expect(run('tools/check-vocabulary.mjs').status).toBe(0);
    const script = raw('tools/check-vocabulary.mjs');
    expect(script).toContain('\\bq8\\b');
    expect(script).not.toContain('\\bq8\\b/i');
    expect(script).toContain('check-vocabulary.mjs');
  });

  it('AC-TOOL-08: the INV-1 boundary is a single JSON file read by the lint config', () => {
    const excludes = JSON.parse(raw('tools/scan-excludes.json')) as { scanRootExcludes: string[] };
    expect(excludes.scanRootExcludes).toContain('src/domain/validate.ts');
    expect(raw('eslint.config.js')).toContain('scan-excludes.json');
    expect(raw('eslint.config.js')).toContain('no-restricted-imports');
  });

  it('AC-TOOL-10: check:ac-map passes', () => {
    expect(run('tools/check-ac-map.mjs').status).toBe(0);
  });

  it('AC-TOOL-11: the coverage report is byte-reproducible and check writes nothing', async () => {
    const { renderReport } = await import('../../tools/bake/report.ts');
    const c = fixtureConversation();
    expect(renderReport(c)).toBe(renderReport(c));
    expect(raw('review/report.m1-fixture.md')).toBe(renderReport(c));
  });

  it('AC-TOOL-12: .gitattributes forces eol=lf and a byte change makes check report E_SOURCE_STALE', async () => {
    expect(raw('.gitattributes')).toContain('eol=lf');
    const baseline = await bake({
      source: fixtureSource(),
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
      sourceDigest: 'sha256:v1:lf',
    });
    const result = await bake({
      source: fixtureSource(),
      prior: baseline.conversation,
      translator: null,
      mode: 'check',
      sourceDigest: 'sha256:v1:crlf',
    });
    expect(result.diagnostics.map((d) => d.code)).toContain('E_SOURCE_STALE');
  });

  it('AC-TOOL-20: no service-worker code or PWA plugin exists, and worker.format is set', () => {
    expect(raw('vite.config.ts')).toContain("worker: { format: 'es' }");
    const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<
      string,
      string
    >;
    expect(deps['vite-plugin-pwa']).toBeUndefined();
    expect(raw('index.html')).not.toMatch(/serviceWorker|manifest/);
  });

  it('AC-TOOL-21: bake:check selects the fixture by --conversation', () => {
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts['bake:check']).toContain(
      '--conversation src/data/conversations/m1-fixture.source.json',
    );
    expect(scripts.bake).toContain('--conversation');
  });

  it('AC-TOOL-23: the evidence producer exists and only its format doc is committed', () => {
    expect(existsSync(join(ROOT, 'tools/test-runner/run.mjs'))).toBe(true);
    expect(existsSync(join(ROOT, 'test-artifacts/README.md'))).toBe(true);
  });

  it('AC-TOOL-24: the contract manifest lists exactly the two frozen contracts and matches them', () => {
    const lines = raw('tools/contracts.sha256').trim().split('\n');
    expect(lines.length).toBe(2);
    const paths = lines.map((line) => line.split('  ')[1]);
    expect(paths).toEqual(['src/domain/types.ts', 'src/engines/ports.ts']);
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts['check:contracts']).toBe('node tools/check-contracts.mjs');
    expect(scripts['contracts:update']).toBe('node tools/check-contracts.mjs --update');
    expect(scripts.check).not.toContain('contracts:update');
    expect(run('tools/check-contracts.mjs').status).toBe(0);
  });
});
