import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import tsconfig from '../../tsconfig.json';
import nvmrc from '../../.nvmrc?raw';
import gitignore from '../../.gitignore?raw';
import prettierignore from '../../.prettierignore?raw';
import vitestConfig from '../../vitest.config.ts';

const ROOT = process.cwd();

describe('tooling (D5 §2, §4, §7, §10; AC-TOOL-04/05/06/13/16/22)', () => {
  it('AC-TOOL-04: the inference runtime is absent in M1', () => {
    const deps = pkg.dependencies as Record<string, string>;
    const devDeps = pkg.devDependencies as Record<string, string>;
    for (const name of ['@huggingface/transformers', 'onnxruntime-node']) {
      expect(deps[name]).toBeUndefined();
      expect(devDeps[name]).toBeUndefined();
    }
  });

  it('AC-TOOL-05: engines.node and .nvmrc are present and agree', () => {
    expect((pkg.engines as Record<string, string>).node).toMatch(/^>=22/);
    expect(nvmrc.trim().length).toBeGreaterThan(0);
  });

  it('AC-TOOL-06: the exact compiler flags are present and exactOptionalPropertyTypes is absent', () => {
    const options = tsconfig.compilerOptions as Record<string, unknown>;
    expect(options.target).toBe('ES2022');
    expect(options.module).toBe('ESNext');
    expect(options.moduleResolution).toBe('bundler');
    expect(options.jsx).toBe('react-jsx');
    expect(options.jsxImportSource).toBe('preact');
    expect(options.resolveJsonModule).toBe(true);
    expect(options.verbatimModuleSyntax).toBe(true);
    expect(options.isolatedModules).toBe(true);
    expect(options.noEmit).toBe(true);
    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.noImplicitOverride).toBe(true);
    expect(options.noFallthroughCasesInSwitch).toBe(true);
    expect(options.noUnusedLocals).toBe(true);
    expect(options.noUnusedParameters).toBe(true);
    expect(options.allowUnreachableCode).toBe(false);
    expect(options.skipLibCheck).toBe(true);
    expect('exactOptionalPropertyTypes' in options).toBe(false);
  });

  it('AC-TOOL-13: .gitignore covers the MT model cache and model binaries', () => {
    for (const entry of ['.cache/', '.hf-cache/', '.huggingface/', '*.onnx', '*.bin', '*.wasm']) {
      expect(gitignore).toContain(entry);
    }
  });

  it('AC-TOOL-16: exactly four Vitest projects with the D5 environments', () => {
    const projects = (
      vitestConfig.test as { projects?: Array<{ test?: { name?: string; environment?: string } }> }
    ).projects;
    expect(projects?.length).toBe(4);
    const byName = new Map(
      projects?.map((project) => [project.test?.name, project.test?.environment]),
    );
    expect(byName.get('domain')).toBe('node');
    expect(byName.get('bake')).toBe('node');
    expect(byName.get('engines')).toBe('node');
    expect(byName.get('ui')).toBe('jsdom');
  });

  it('AC-TOOL-22: .prettierignore protects the frozen specs and generated artefacts', () => {
    for (const entry of [
      'docs/**',
      'dist/**',
      'test-artifacts/**',
      'node_modules/**',
      'package-lock.json',
      'src/data/**/*.json',
      // Generated report: `bake --report` owns its format (E3's rationale).
      'review/report.*.md',
      // The frozen contracts are read-only to the Engineer; formatting them
      // would be a contract change (reported as a D5 §10 omission).
      'src/domain/types.ts',
      'src/engines/ports.ts',
    ]) {
      expect(prettierignore).toContain(entry);
    }
  });

  it('AC-TOOL-15: the domain and bake projects fail on any real network access', () => {
    expect(existsSync(join(ROOT, 'test/setup/no-network.ts'))).toBe(true);
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
    expect((config.match(/test\/setup\/no-network\.ts/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(readFileSync(join(ROOT, 'test/setup/no-network.ts'), 'utf8')).toContain('fetch');
  });

  it('AC-TOOL-17: one shared speechSynthesis mock exists for the engines and ui projects', () => {
    expect(existsSync(join(ROOT, 'test/helpers/speech-synthesis-mock.ts'))).toBe(true);
    expect(readFileSync(join(ROOT, 'test/engines/conformance.spec.ts'), 'utf8')).toContain(
      'speech-synthesis-mock',
    );
    expect(readFileSync(join(ROOT, 'test/ui/audio.spec.tsx'), 'utf8')).toContain(
      'speech-synthesis-mock',
    );
  });
});
