/**
 * The browser registry (D3 §11.1, amendments C9/B4/Z9).
 *
 * `src/**` may import **only** this file. It carries the **selected** engine's
 * entries — packaging C (Supertonic 2 int8 via sherpa-onnx), its voice styles,
 * and the runtime's own entry — and it is **empty for the M1 `speechSynthesis`
 * build**, so that build fetches and bundles nothing (AC-ENG-10). The selection
 * is a build-time constant (`__TTS_ENGINE__`), so the M3 entries are dead code —
 * and therefore absent from the emitted JS — in an M1 build.
 *
 * The non-selected packagings (A `'deferred'`, B `'rejected'`) live in
 * `tools/registry.candidates.ts`, which `src/**` must never import.
 */

import type { AssetRegistryEntry, BrowserAssetRegistry, PrecisionStep } from './ports.ts';

/** The selected packaging's own model files (voice styles are a separate entry). */
const MODEL_FILES = [
  { path: 'duration_predictor.int8.onnx', bytes: 1_521_526 },
  { path: 'text_encoder.int8.onnx', bytes: 27_431_318 },
  { path: 'vector_estimator.int8.onnx', bytes: 40_686_657 },
  { path: 'vocoder.int8.onnx', bytes: 25_977_132 },
  { path: 'tts.json', bytes: 8_699 },
  { path: 'unicode_indexer.bin', bytes: 262_144 },
] as const;

const MODEL_TOTAL = MODEL_FILES.reduce((sum, f) => sum + f.bytes, 0);

/** The selected packaging's pinned revision — the spike's pin (spike-m3-packaging.md). */
const SELECTED_REVISION = '5dec5897b86e2b293790eedb5e1f561a3295651f';
const SELECTED_REPO = 'csukuangfj2/sherpa-onnx-supertonic-tts-int8-2026-03-06';

/** The runtime release the browser wasm/glue are taken from (D5 §3.2). */
const RUNTIME_REPO = 'k2-fsa/sherpa-onnx';
const RUNTIME_REVISION = 'v1.13.8';

const SELECTED_PRECISION_CHAIN: readonly PrecisionStep[] = [{ backend: 'wasm', precision: 'int8' }];

/**
 * The selected packaging (C): Supertonic 2 int8 via sherpa-onnx, WASM-only.
 * `precisionChain` is `[wasm+int8]` with **no `dtype` request** — the artifact
 * *is* int8, and D3 §6.3 forbids describing it with the dtype string.
 */
const SELECTED_TTS: AssetRegistryEntry = {
  id: 'supertonic-int8-sherpa-v2',
  purpose: 'tts',
  repoId: SELECTED_REPO,
  revision: SELECTED_REVISION,
  runtime: 'sherpa-onnx-wasm',
  packaging: 'int8-sherpa',
  precision: ['int8'],
  decision: 'm3',
  files: [...MODEL_FILES],
  totalBytes: MODEL_TOTAL,
  backends: ['wasm'],
  precisionChain: SELECTED_PRECISION_CHAIN,
  license: {
    // The upstream `Supertone/supertonic-2` model card declares `openrail`; the
    // conversion repo also ships an MIT LICENSE file. The most restrictive
    // reading is taken and the conflict recorded (escalated to the PM).
    weights: 'OpenRAIL-M',
    code: 'MIT',
    verifiedOn: '2026-10-18',
    note: 'Upstream weights card is `openrail`; conversion repo ships an MIT file. OpenRAIL-M use restrictions apply.',
  },
  requiredForM1: false,
  storage: 'browser-cache',
};

/**
 * The ten voice styles. One `voice.bin` packs all ten (517,168 B = a 48-byte
 * header + 10 × 51,712); fetched from the same pinned revision, never committed.
 * A style is language-agnostic (D3 §6.6) — it is not bound to `es` or `en`.
 */
const SELECTED_VOICE_STYLES: AssetRegistryEntry = {
  id: 'supertonic-voice-styles-v2',
  purpose: 'voice-style',
  repoId: SELECTED_REPO,
  revision: SELECTED_REVISION,
  runtime: 'sherpa-onnx-wasm',
  packaging: 'int8-sherpa',
  precision: ['int8'],
  decision: 'm3',
  files: [{ path: 'voice.bin', bytes: 517_168 }],
  totalBytes: 517_168,
  backends: ['wasm'],
  precisionChain: SELECTED_PRECISION_CHAIN,
  license: {
    weights: 'OpenRAIL-M',
    code: 'MIT',
    verifiedOn: '2026-10-18',
    note: 'Voice styles are part of the OpenRAIL-M weights.',
  },
  requiredForM1: false,
  storage: 'browser-cache',
};

/**
 * The runtime's own entry (D3 §6.7, amendment Z16): sherpa-onnx's licence now
 * has a home. The browser glue/wasm are **bundled** (not weights; D5 §3.2) and
 * `check:bundle` allow-lists this entry's `.wasm` in `dist/`.
 */
const SELECTED_RUNTIME: AssetRegistryEntry = {
  id: 'sherpa-onnx-wasm-runtime',
  purpose: 'runtime',
  repoId: RUNTIME_REPO,
  revision: RUNTIME_REVISION,
  runtime: 'sherpa-onnx-wasm',
  packaging: 'int8-sherpa',
  precision: ['int8'],
  decision: 'm3',
  files: [
    { path: 'sherpa-onnx-wasm-main-tts.js', bytes: 83_913 },
    { path: 'sherpa-onnx-wasm-main-tts.wasm', bytes: 13_403_088 },
    { path: 'sherpa-onnx-tts.js', bytes: 40_354 },
  ],
  totalBytes: 13_527_355,
  backends: ['wasm'],
  precisionChain: SELECTED_PRECISION_CHAIN,
  license: {
    weights: null,
    code: 'Apache-2.0',
    verifiedOn: '2026-10-18',
    note: 'sherpa-onnx (npm and k2-fsa/sherpa-onnx) is Apache-2.0. No weights: this is the runtime.',
  },
  requiredForM1: false,
  storage: 'bundled',
};

/** The selected packaging's entries. Exported for tests; dead code in an M1 build. */
export const m3Registry: BrowserAssetRegistry = [
  SELECTED_TTS,
  SELECTED_VOICE_STYLES,
  SELECTED_RUNTIME,
];

/**
 * What `src/**` imports. Empty for the M1 `speechSynthesis` build — the condition
 * is a build-time constant, so the M3 entries are removed by dead-code
 * elimination and never reach an M1 bundle (D3 §11.1, AC-ENG-10/AC-ENG-11).
 */
export const browserRegistry: BrowserAssetRegistry =
  __TTS_ENGINE__ === 'speech-synthesis' ? [] : m3Registry;

/** Find an entry by purpose. The adapter never hardcodes a repo id (AC-ENG-11). */
export function registryEntry(
  purpose: AssetRegistryEntry['purpose'],
): AssetRegistryEntry | undefined {
  return browserRegistry.find((entry) => entry.purpose === purpose);
}
