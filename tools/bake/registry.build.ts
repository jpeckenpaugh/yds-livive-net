/**
 * The build-only asset registry (D3 §11.1, amendment C9).
 *
 * Imported by `tools/bake/**` only — never reachable from `src/**` — so the
 * deferred packagings' repo ids and the MT model facts cannot leak into the
 * browser bundle.
 *
 * The revisions are the pinned commits of D3 §10.2 (fetched from the Hugging
 * Face API, 2026-10-18). A revision bump is a deliberate act: it re-drafts every
 * line and invalidates every `mt`, gloss key and review stamp, so it is its own
 * commit, never a side effect of a rebuild.
 */

import type { BuildAssetRegistry } from '../../src/engines/ports.ts';

export const buildRegistry: BuildAssetRegistry = [
  {
    id: 'opus-mt-en-romance',
    purpose: 'translation',
    repoId: 'Xenova/opus-mt-en-ROMANCE',
    revision: '9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd',
    runtime: 'transformers.js-node',
    packaging: 'n/a',
    precision: ['int8'],
    decision: 'deferred',
    files: [],
    totalBytes: 0,
    backends: ['node'],
    precisionChain: { node: ['int8'] },
    license: {
      weights: 'Apache-2.0',
      code: null,
      verifiedOn: '2026-10-18',
      note: 'Apache-2.0 requires the licence text and nothing more; no upstream NOTICE, so no attribution line (D3 §6.7).',
    },
    requiredForM1: false,
    storage: 'build-only',
  },
  {
    id: 'opus-mt-romance-en',
    purpose: 'translation',
    repoId: 'Xenova/opus-mt-ROMANCE-en',
    revision: 'f60feaabe8bb435a5871e7702b25f53a01e770f8',
    runtime: 'transformers.js-node',
    packaging: 'n/a',
    precision: ['int8'],
    decision: 'deferred',
    files: [],
    totalBytes: 0,
    backends: ['node'],
    precisionChain: { node: ['int8'] },
    license: {
      weights: 'Apache-2.0',
      code: null,
      verifiedOn: '2026-10-18',
      note: 'Apache-2.0 requires the licence text and nothing more; no upstream NOTICE, so no attribution line (D3 §6.7).',
    },
    requiredForM1: false,
    storage: 'build-only',
  },
];
