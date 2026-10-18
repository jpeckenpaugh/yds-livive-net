import { describe, expect, it } from 'vitest';
import { m3Registry } from '../../src/engines/registry.browser.ts';
import { candidateRegistry } from '../../tools/registry.candidates.ts';
import { licencesFor } from '../../src/ui/licenses.ts';

// A committed model binary under src/ is the failure AC-ENG-14 guards against.
const binsUnderSrc = import.meta.glob('../../src/**/*.{bin,onnx,onnx_data,wasm}', { eager: true });

describe('M3 registry (D3 §11, AC-ENG-13/14/21)', () => {
  it('selects exactly one m3 packaging, WASM-only, int8, with a data-driven chain', () => {
    const tts = m3Registry.filter((e) => e.purpose === 'tts');
    expect(tts).toHaveLength(1);
    const [entry] = tts;
    expect(entry?.decision).toBe('m3');
    expect(entry?.precision).toEqual(['int8']);
    expect(entry?.precisionChain).toEqual([{ backend: 'wasm', precision: 'int8' }]);
    expect(entry?.backends).toEqual(['wasm']);
    expect(entry?.storage).toBe('browser-cache');
    expect(entry?.requiredForM1).toBe(false);
    expect(entry?.revision).toMatch(/^[0-9a-f]{40}$/);
  });

  it('AC-ENG-13: the precision chain is registry data, and a runtime entry names the licence', () => {
    const runtime = m3Registry.find((e) => e.purpose === 'runtime');
    expect(runtime).toBeDefined();
    expect(runtime?.license.code).toBe('Apache-2.0');
    expect(runtime?.license.verifiedOn).toBeTruthy();
    expect(runtime?.storage).toBe('bundled');
    expect(runtime?.precisionChain.length).toBeGreaterThan(0);
  });

  it('AC-ENG-14: voice styles are fetched and cached, never committed or bundled', () => {
    const voice = m3Registry.find((e) => e.purpose === 'voice-style');
    expect(voice?.storage).toBe('browser-cache');
    expect(voice?.requiredForM1).toBe(false);
    expect(voice?.files.map((f) => f.path)).toEqual(['voice.bin']);
    // No model binary is committed under src/.
    expect(Object.keys(binsUnderSrc)).toEqual([]);
    // No weights are bundled.
    for (const entry of [...m3Registry, ...candidateRegistry]) {
      if (entry.files.length > 0 && entry.purpose !== 'runtime') {
        expect(entry.storage).not.toBe('bundled');
      }
    }
  });

  it('AC-ENG-21: every entry naming weights has a verified licence', () => {
    for (const entry of [...m3Registry, ...candidateRegistry]) {
      const namesWeights = entry.purpose === 'tts' || entry.purpose === 'voice-style';
      if (!namesWeights) continue;
      expect(entry.license.weights, entry.id).toBeTruthy();
      expect(entry.license.verifiedOn, entry.id).toBeTruthy();
    }
  });

  it('AC-ENG-21: the About surface names the packaging and its runtime at M3, nothing in M1', () => {
    const entries = licencesFor('supertonic-sherpa', m3Registry);
    const licences = entries.map((e) => e.licence);
    expect(licences).toContain('OpenRAIL-M');
    expect(licences).toContain('Apache-2.0');
    // The use-restricted licence is flagged, and the detail names the product.
    expect(entries.some((e) => e.restricted && e.licence === 'OpenRAIL-M')).toBe(true);
    expect(entries.some((e) => e.detail?.includes('csukuangfj2/'))).toBe(true);
    // M1 names no model, repo or byte size (D4 §13, amendment E4).
    const m1 = licencesFor('speech-synthesis', []);
    expect(m1.every((e) => e.detail === undefined)).toBe(true);
    expect(m1.some((e) => e.licence === 'OpenRAIL-M' && e.restricted)).toBe(true);
  });

  it('keeps A selectable (deferred) and B rejected, each with a pinned revision', () => {
    const byDecision = Object.fromEntries(candidateRegistry.map((e) => [e.decision, e]));
    expect(byDecision.deferred?.packaging).toBe('fp32-transformers');
    expect(byDecision.rejected?.packaging).toBe('int8-sherpa');
    for (const entry of candidateRegistry) expect(entry.revision).toMatch(/^[0-9a-f]{40}$/);
    // A's chain crosses backends and never uses webgpu+fp32 (D3 §6.4).
    expect(byDecision.deferred?.precisionChain).toEqual([
      { backend: 'webgpu', precision: 'fp16' },
      { backend: 'wasm', precision: 'fp32' },
    ]);
  });
});
