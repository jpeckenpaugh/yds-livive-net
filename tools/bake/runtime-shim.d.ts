/**
 * Ambient declarations for the inference runtime (D3 §10.8, amendment F3).
 *
 * `@huggingface/transformers` and `onnxruntime-node` are deliberately **not
 * installed in M1**: the runtime is imported lazily inside the injected port, and
 * `bake --check --author-only` never evaluates that import. These declarations
 * let `typecheck` pass without the packages, so a Node-major incompatibility with
 * a native module cannot break M1's gate.
 */

declare module '@huggingface/transformers';
declare module 'onnxruntime-node';
