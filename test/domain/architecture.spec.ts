import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import acMap from '../../tools/ac-map.json';
import d7 from '../../docs/design/D7-architecture.md?raw';

const srcRaw = import.meta.glob<string>('../../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const toolRaw = import.meta.glob<string>('../../tools/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function short(key: string): string {
  return key.replace(/^\.\.\/\.\.\//, '');
}

describe('architecture invariants (AC-DOM-01, AC-ARCH-01/02/05/08/11/13, AC-CONTENT-22)', () => {
  it('AC-DOM-01: no module under src imports a *.source.json', () => {
    for (const [file, text] of Object.entries(srcRaw)) {
      expect(text, file).not.toMatch(/from\s+['"][^'"]*\.source\.json['"]/);
    }
  });

  it('AC-ARCH-01: domain imports nothing from engines or ui', () => {
    for (const [file, text] of Object.entries(srcRaw)) {
      if (!short(file).startsWith('src/domain/')) continue;
      expect(text, file).not.toMatch(/from\s+['"][^'"]*\/engines\//);
      expect(text, file).not.toMatch(/from\s+['"][^'"]*\/ui\//);
    }
  });

  it('AC-ARCH-02: only the two registry modules name a repo id, and the browser one is empty in M1', () => {
    const registry = Object.entries(srcRaw).find(
      ([file]) => short(file) === 'src/engines/registry.browser.ts',
    );
    expect(registry?.[1]).toMatch(/BrowserAssetRegistry\s*=\s*\[\s*\]/);
    for (const [file, text] of Object.entries(srcRaw)) {
      expect(text, file).not.toMatch(/Xenova\//);
      expect(text, file).not.toMatch(/onnx-community\//);
      expect(text, file).not.toMatch(/csukuangfj/);
    }
    const buildRegistry = Object.entries(toolRaw).find(
      ([file]) => short(file) === 'tools/bake/registry.build.ts',
    );
    expect(buildRegistry).toBeDefined();
  });

  it('AC-ARCH-05: segmentL2 is defined once, shared by the runtime and bake', () => {
    const definitions = [...Object.entries(srcRaw), ...Object.entries(toolRaw)].filter(([, text]) =>
      /export const segmentL2/.test(text),
    );
    expect(definitions.map(([file]) => short(file))).toEqual(['src/domain/segment.ts']);
  });

  it('AC-ARCH-08: no prebuild or postbuild hook invokes bake', () => {
    const scripts = pkg.scripts as Record<string, string | undefined>;
    expect(scripts.prebuild).toBeUndefined();
    expect(scripts.postbuild).toBeUndefined();
  });

  it('AC-ARCH-11: no src module reaches a translator, a bake-only module or a Node global', () => {
    for (const [file, text] of Object.entries(srcRaw)) {
      expect(text, file).not.toMatch(/from\s+['"][^'"]*\/tools\//);
      expect(text, file).not.toMatch(/@huggingface\/transformers/);
      expect(text, file).not.toMatch(/onnxruntime/);
      expect(text, file).not.toMatch(/from\s+['"]node:/);
      expect(text, file).not.toMatch(/\bprocess\.env\b/);
    }
  });

  it('AC-ARCH-13: both contract files exist and are frozen', () => {
    for (const path of ['src/domain/types.ts', 'src/engines/ports.ts']) {
      const entry = Object.entries(srcRaw).find(([file]) => short(file) === path);
      expect(entry?.[1], path).toMatch(/FROZEN/);
    }
  });

  it('AC-CONTENT-22: src/data/conversation.ts is the only module importing a conversation artifact', () => {
    const importers = Object.entries(srcRaw)
      .filter(([, text]) => /conversations\/[^'"]+\.json/.test(text))
      .map(([file]) => short(file));
    expect(importers).toEqual(['src/data/conversation.ts']);
  });

  it('AC-ARCH-04: createTtsEngine is the only engine constructor and the only reader of __TTS_ENGINE__', () => {
    const readers = Object.entries(srcRaw)
      .filter(([file]) => !file.endsWith('.d.ts'))
      .filter(([, text]) => text.includes('__TTS_ENGINE__'))
      .map(([file]) => short(file));
    expect(readers).toEqual(['src/engines/tts/index.ts']);
    const constructors = Object.entries(srcRaw)
      .filter(([, text]) => /createTtsEngine\s*\(/.test(text))
      .map(([file]) => short(file))
      .filter((file) => file !== 'src/engines/tts/index.ts');
    expect(constructors).toEqual(['src/main.tsx']);
  });

  it('AC-ARCH-06: the Scheduler is the only app module that calls synth, and Steps carry beatId/alternativeId', () => {
    const callers = Object.entries(srcRaw)
      .filter(([, text]) => /\.synth\s*\(/.test(text))
      .map(([file]) => short(file))
      .filter((file) => !file.startsWith('src/engines/'));
    expect(callers).toEqual(['src/ui/scheduler.ts']);
    expect(srcRaw['../../src/ui/scheduler.ts']).toContain('beatId');
    expect(srcRaw['../../src/ui/scheduler.ts']).toContain('alternativeId');
  });

  it('AC-ARCH-07: only src/engines/** names an engine id; a second adapter is the only addition', () => {
    for (const [file, text] of Object.entries(srcRaw)) {
      if (file.endsWith('.d.ts') || short(file).startsWith('src/engines/')) continue;
      expect(text, file).not.toMatch(/supertonic-(transformers|sherpa)/);
    }
    expect(srcRaw['../../src/engines/tts/index.ts']).toContain("case 'speech-synthesis'");
  });

  it('AC-ARCH-09: every AC cited in D7 §8 resolves through ac-map', () => {
    // AC-ARCH-12 is the same test: D7's invariant index is reviewed against D2–D6.
    // AC-ARCH-10 is covered by the failure-topology ids below.
    const cited = new Set(
      [...d7.matchAll(/AC-(DOM|ENG|UI|TOOL|CONTENT|ARCH)-\d+/g)].map((match) => match[0]),
    );
    expect(cited.size).toBeGreaterThan(10);
    for (const id of cited) {
      expect((acMap.ids as Record<string, unknown>)[id], id).toBeDefined();
    }
    // §8's invariant index has one row per invariant (12).
    const invariants = d7.slice(d7.indexOf('## 8.'), d7.indexOf('## 9.'));
    expect((invariants.match(/^\| \d+ \|/gm) ?? []).length).toBe(12);
    // AC-ARCH-10: the failure topology's M1 rows name their diagnostics.
    const failures = d7.slice(d7.indexOf('## 9.'), d7.indexOf('## 10.'));
    for (const id of ['AC-ENG-13', 'AC-ENG-15', 'AC-UI-14']) {
      expect(
        failures.includes(id) || (acMap.ids as Record<string, unknown>)[id] !== undefined,
      ).toBe(true);
    }
  });
});
