/**
 * The non-selected TTS candidates (D3 §11.1, amendment B4).
 *
 * Tooling-only: imported by `tools/check-bundle.mjs` and tests, **never** by
 * `src/**`. It gives a `'deferred'` or `'rejected'` packaging a home without its
 * repo id reaching the browser bundle — the problem the three-file split exists
 * to solve. The selected packaging lives in `src/engines/registry.browser.ts`.
 */

import type { CandidateAssetRegistry } from '../src/engines/ports.ts';

/** The transformers.js packaging. Deferred — selectable later at the cost of one adapter. */
const PACKAGING_A: CandidateAssetRegistry[number] = {
  id: 'supertonic-fp32-transformers',
  purpose: 'tts',
  repoId: 'onnx-community/Supertonic-TTS-ONNX',
  revision: 'cff123c84b0655d9d647641f1b532c3cbb8f7faa',
  runtime: 'transformers.js',
  packaging: 'fp32-transformers',
  precision: ['fp32'],
  decision: 'deferred',
  files: [
    { path: 'onnx/latent_denoiser.onnx', bytes: 398102 },
    { path: 'onnx/latent_denoiser.onnx_data', bytes: 132098880 },
    { path: 'onnx/text_encoder.onnx', bytes: 433169 },
    { path: 'onnx/text_encoder.onnx_data', bytes: 28426752 },
    { path: 'onnx/voice_decoder.onnx', bytes: 59921 },
    { path: 'onnx/voice_decoder.onnx_data', bytes: 101353472 },
    { path: 'tokenizer.json', bytes: 2038 },
    { path: 'tokenizer_config.json', bytes: 119 },
    { path: 'voices/M1.bin', bytes: 51712 },
    { path: 'voices/M2.bin', bytes: 51712 },
    { path: 'voices/M3.bin', bytes: 51712 },
    { path: 'voices/M4.bin', bytes: 51712 },
    { path: 'voices/M5.bin', bytes: 51712 },
    { path: 'voices/F1.bin', bytes: 51712 },
    { path: 'voices/F2.bin', bytes: 51712 },
    { path: 'voices/F3.bin', bytes: 51712 },
    { path: 'voices/F4.bin', bytes: 51712 },
    { path: 'voices/F5.bin', bytes: 51712 },
  ],
  totalBytes: 262_397_018,
  backends: ['webgpu', 'wasm'],
  // Cross-backend chain (D3 §6.4): a device without `shader-f16` must fall to
  // WASM, never to `webgpu + fp32` (measured 15–20× slower than WASM).
  precisionChain: [
    { backend: 'webgpu', precision: 'fp16' },
    { backend: 'wasm', precision: 'fp32' },
  ],
  license: {
    weights: 'OpenRAIL-M',
    code: 'MIT',
    verifiedOn: '2026-10-18',
    note: 'Weights card is `openrail`; upstream LICENSE is MIT. OpenRAIL-M use restrictions apply.',
  },
  requiredForM1: false,
  storage: 'browser-cache',
};

/** The v3 int8 sherpa packaging. Rejected — C dominates it on every measured axis. */
const PACKAGING_B: CandidateAssetRegistry[number] = {
  id: 'supertonic-int8-sherpa-v3',
  purpose: 'tts',
  // D3 §6.1's original repo id is dead (HTTP 401); this is the public mirror the
  // spike pinned (spike-m3-packaging.md).
  repoId: 'threebobss/supertonic-3-tts-int8-sherpa',
  revision: 'a37d311c1c7c0b222b587636324847f19ade05c2',
  runtime: 'sherpa-onnx-wasm',
  packaging: 'int8-sherpa',
  precision: ['int8'],
  decision: 'rejected',
  files: [
    { path: 'duration_predictor.int8.onnx', bytes: 3700147 },
    { path: 'text_encoder.int8.onnx', bytes: 36416150 },
    { path: 'vector_estimator.int8.onnx', bytes: 78400833 },
    { path: 'vocoder.int8.onnx', bytes: 25991073 },
    { path: 'tts.json', bytes: 8253 },
    { path: 'unicode_indexer.bin', bytes: 262144 },
    { path: 'voice.bin', bytes: 517168 },
  ],
  totalBytes: 145_295_768,
  backends: ['wasm'],
  precisionChain: [{ backend: 'wasm', precision: 'int8' }],
  license: {
    weights: 'OpenRAIL-M',
    code: 'MIT',
    verifiedOn: '2026-10-18',
    note: 'Conversion of the OpenRAIL-M v3 weights; same restrictions apply.',
  },
  requiredForM1: false,
  storage: 'browser-cache',
};

export const candidateRegistry: CandidateAssetRegistry = [PACKAGING_A, PACKAGING_B];
