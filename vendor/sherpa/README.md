# The sherpa-onnx browser runtime (vendored)

These three files are the **runtime**, not the model. They are copied verbatim
from the pinned sherpa-onnx release and are the only binaries committed to the
repo that are not source:

| file | from | licence |
|---|---|---|
| `sherpa-onnx-wasm-main-tts.js` | `k2-fsa/sherpa-onnx` `v1.13.8` release | Apache-2.0 |
| `sherpa-onnx-wasm-main-tts.wasm` | same | Apache-2.0 |
| `sherpa-onnx-tts.js` | same | Apache-2.0 |

**No model weights are here.** The Supertonic model is fetched at runtime from
the pinned revision and cached in the `models` IndexedDB store (D3 §9); the
worker writes it into the emscripten FS at load (`sherpa.worker.ts`). The
release's `.data` pack — which bakes the model in — is deliberately **not**
shipped: `check:bundle` forbids model weights in `dist/`, and the glue's preload
list is emptied at load instead.

`sherpa-onnx-wasm-main-tts.wasm` is the one `.wasm` allowed by `.gitignore`; see
the negation there.
