import type { BrowserAssetRegistry } from './ports.ts';

/**
 * The browser registry (D3 §11.1, amendment C9).
 *
 * `src/**` may import only this file. It is **empty in M1**: `speechSynthesis`
 * needs no assets, so nothing is fetched and nothing is bundled. The split from
 * `tools/bake/registry.build.ts` is what keeps the deferred packagings' repo ids
 * out of the browser bundle.
 */
export const browserRegistry: BrowserAssetRegistry = [];
