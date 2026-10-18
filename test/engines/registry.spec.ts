import { describe, expect, it } from 'vitest';
import { browserRegistry } from '../../src/engines/registry.browser.ts';
import { createSpeechSynthesisEngine } from '../../src/engines/tts/speech-synthesis.ts';
import { buildRegistry } from '../../tools/bake/registry.build.ts';

const srcRaw = import.meta.glob<string>('../../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const toolRaw = import.meta.glob<string>('../../tools/**/*.{ts,mjs}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function short(key: string): string {
  return key.replace(/^\.\.\/\.\.\//, '');
}

/** Strip comments so prose about a forbidden term is not a false positive. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function sourceFiles(): Array<[string, string]> {
  return Object.entries(srcRaw).filter(([file]) => !file.endsWith('.d.ts'));
}

describe('engine surface and registry (AC-ENG-01/10/11/17/20)', () => {
  it('AC-ENG-01: only src/engines/** references the runtime APIs', () => {
    for (const [file, text] of sourceFiles()) {
      if (short(file).startsWith('src/engines/')) continue;
      const body = code(text);
      expect(body, file).not.toMatch(/speechSynthesis/);
      expect(body, file).not.toMatch(/\btransformers\b/);
      expect(body, file).not.toMatch(/\bsherpa\b/);
    }
  });

  it('AC-ENG-10: the M1 build constructs no worker and fetches nothing', () => {
    expect(browserRegistry).toEqual([]);
    for (const [file, text] of sourceFiles()) {
      // No worker anywhere: the M3 engine runs on the main thread (D3 §6.5
      // deferred — the sherpa glue does not initialise inside a worker).
      expect(code(text), file).not.toMatch(/new\s+Worker\s*\(/);
    }
    for (const entry of browserRegistry) {
      if (entry.requiredForM1) expect(entry.storage).toBe('bundled');
    }
  });

  it('AC-ENG-11: only the three registry modules name a repo id or a revision', () => {
    const allowed = new Set([
      'src/engines/registry.browser.ts',
      'tools/bake/registry.build.ts',
      'tools/registry.candidates.ts',
    ]);
    for (const [file, text] of [...Object.entries(srcRaw), ...Object.entries(toolRaw)]) {
      if (allowed.has(short(file))) continue;
      const body = code(text);
      expect(body, file).not.toMatch(/Xenova\//);
      expect(body, file).not.toMatch(/onnx-community\//);
      expect(body, file).not.toMatch(/csukuangfj/);
      expect(body, file).not.toMatch(/9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd/);
    }
    // The build registry carries the pinned revisions of D3 §10.2.
    expect(buildRegistry.map((entry) => entry.revision)).toEqual([
      '9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd',
      'f60feaabe8bb435a5871e7702b25f53a01e770f8',
    ]);
  });

  it('AC-ENG-17: the port owns the target token; no pipeline call site builds a prompt', () => {
    const withToken = Object.entries(toolRaw).filter(([, text]) => text.includes('>>es<<'));
    expect(withToken.map(([file]) => short(file))).toEqual(['tools/bake/translator.node.ts']);
  });

  it('AC-ENG-20: the app source names none of the forbidden engine strings', () => {
    for (const [file, text] of sourceFiles()) {
      if (short(file).startsWith('src/engines/')) continue;
      const body = code(text);
      expect(body, file).not.toMatch(/transformers/);
      expect(body, file).not.toMatch(/onnxruntime/);
      expect(body, file).not.toMatch(/opus-mt/);
      expect(body, file).not.toMatch(/supertonic/i);
    }
  });

  it('AC-ENG-06: M1 declares preservesVoiceIdentityAcrossLangs false', () => {
    const engine = createSpeechSynthesisEngine({ overrides: {} });
    expect(engine.capabilities.preservesVoiceIdentityAcrossLangs).toBe(false);
  });
});
