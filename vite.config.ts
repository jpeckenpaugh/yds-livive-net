import { cpSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const engine = process.env.TTS_ENGINE ?? 'speech-synthesis';

/**
 * The sherpa runtime (D5 §3.2, amendment Z15). The vendored glue/wasm are
 * Apache-2.0 code, not model weights, and are copied into `dist/sherpa/` **only
 * for a build that selects the engine** — so an M1 build carries no wasm and
 * `check:bundle` has nothing to allow-list. The model itself is never bundled:
 * it is fetched from the pinned revision at runtime (D3 §9).
 */
function sherpaRuntime() {
  return {
    name: 'sherpa-runtime',
    closeBundle() {
      if (engine === 'speech-synthesis') return;
      mkdirSync('dist/sherpa', { recursive: true });
      cpSync('vendor/sherpa', 'dist/sherpa', { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [preact(), sherpaRuntime()],
  // Subpath hosting (D5 §5). The built index.html works from a project path.
  base: './',
  build: { target: 'es2022', sourcemap: true, reportCompressedSize: true },
  // The sherpa engine runs on the **main thread** (D3 §6.5 deferred): the glue
  // does not initialise inside a worker in this environment. `format` is set and
  // unused, as D5 §5 requires, for when the worker is fixed.
  worker: { format: 'es' },
  define: {
    __TTS_ENGINE__: JSON.stringify(engine),
  },
});
