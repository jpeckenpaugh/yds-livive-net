/**
 * The sherpa-onnx runtime seam (D3 §6.5).
 *
 * The adapter never touches the emscripten module directly: it talks to a
 * `SherpaRuntime`, which is the main-thread implementation in production and a
 * fake in tests.
 *
 * ⚠ **The engine runs on the main thread, not a worker.** The published sherpa
 * glue initialises its FS on the *page's* global scope and does not initialise
 * correctly inside a worker in this environment: the glue's own
 * `FS_createDataFile('/', …)` throws `ENOTDIR` and `createOfflineTts` then traps
 * (`RuntimeError: null function`). The identical load + FS-injection + synth
 * works on the main thread (proven by the AC-ENG-23 evidence, which was produced
 * this way). Correctness beats thread purity, so M3 ships the proven path with a
 * known jank cost (~1 s of main-thread synth per line, measured); the worker is
 * deferred (D3 §6.5). See the M3 report for the diagnosis.
 *
 * The runtime owns the emscripten FS injection: the model files arrive as bytes
 * (fetched and cached by `ModelSource`) and are written into the virtual FS
 * before `createOfflineTts` is called. That is why **no `.data` is shipped** —
 * the published build bakes the model into one, and check:bundle forbids it.
 */

import { patchGlue } from './sherpa-glue.ts';

export type SherpaModelFile = { path: string; bytes: ArrayBuffer };

export type SherpaRuntimeInit = { numSpeakers: number; sampleRate: number };

export type SherpaGeneratedAudio = { samples: Float32Array; sampleRate: number };

export type SherpaRuntime = {
  /** Load the runtime and inject the model files, then construct the engine. */
  init(files: readonly SherpaModelFile[]): Promise<SherpaRuntimeInit>;
  generate(text: string, sid: number, speed: number): Promise<SherpaGeneratedAudio>;
  dispose(): void;
};

type EmscriptenModule = {
  FS_createDataFile?: (
    parent: string,
    name: string,
    data: Uint8Array,
    canRead: boolean,
    canWrite: boolean,
    canOwn: boolean,
  ) => void;
  getPreloadedPackage?: () => ArrayBuffer;
  locateFile?: (path: string) => string;
  setStatus?: (status: string) => void;
  onRuntimeInitialized?: () => void;
};

type OfflineTts = {
  numSpeakers: number;
  sampleRate: number;
  generate(opts: { text: string; sid: number; speed: number }): SherpaGeneratedAudio;
};

/** The selected packaging's model file paths, as the runtime expects them. */
const SUPERTONIC_CONFIG = {
  offlineTtsModelConfig: {
    offlineTtsSupertonicModelConfig: {
      durationPredictor: './duration_predictor.int8.onnx',
      textEncoder: './text_encoder.int8.onnx',
      vectorEstimator: './vector_estimator.int8.onnx',
      vocoder: './vocoder.int8.onnx',
      ttsJson: './tts.json',
      unicodeIndexer: './unicode_indexer.bin',
      voiceStyle: './voice.bin',
    },
    numThreads: 1,
    debug: 0,
    provider: 'cpu',
  },
  maxNumSentences: 1,
};

export type MainThreadRuntimeOptions = {
  /** Where the vendored runtime lives (`dist/sherpa/`). */
  baseUrl?: string;
  timeoutMs?: number;
};

/**
 * The production runtime: loads the vendored glue and wasm on the main thread,
 * injects the model into the emscripten FS, and synthesises in-process.
 */
export function createMainThreadRuntime(options: MainThreadRuntimeOptions = {}): SherpaRuntime {
  const base = options.baseUrl ?? '/sherpa/';
  const timeoutMs = options.timeoutMs ?? 120_000;
  let tts: OfflineTts | null = null;

  function loadScript(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      script.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('sherpa runtime script failed to load'));
      };
      document.head.appendChild(script);
    });
  }

  return {
    async init(files) {
      const module: EmscriptenModule = {
        locateFile: (path) => `${base}${path}`,
        // Skip the `.data` fetch entirely: the model is injected below.
        getPreloadedPackage: () => new ArrayBuffer(0),
        setStatus: () => undefined,
      };
      (globalThis as { Module?: EmscriptenModule }).Module = module;

      const [glue, api] = await Promise.all([
        fetch(`${base}sherpa-onnx-wasm-main-tts.js`).then((r) => r.text()),
        fetch(`${base}sherpa-onnx-tts.js`).then((r) => r.text()),
      ]);

      const ready = new Promise<void>((resolve, reject) => {
        module.onRuntimeInitialized = () => resolve();
        setTimeout(() => reject(new Error('sherpa runtime did not initialise')), timeoutMs);
      });
      await loadScript(patchGlue(glue));
      await loadScript(api);
      await ready;

      for (const file of files) {
        module.FS_createDataFile?.('/', file.path, new Uint8Array(file.bytes), true, true, true);
      }

      const create = (
        globalThis as unknown as {
          createOfflineTts?: (m: EmscriptenModule, config: unknown) => OfflineTts;
        }
      ).createOfflineTts;
      if (!create) throw new Error('createOfflineTts missing after runtime load');
      tts = create(module, SUPERTONIC_CONFIG);
      return { numSpeakers: tts.numSpeakers, sampleRate: tts.sampleRate };
    },

    generate(text, sid, speed) {
      if (!tts) return Promise.reject(new Error('sherpa engine is not initialised'));
      const audio = tts.generate({ text, sid, speed });
      return Promise.resolve({
        samples: audio.samples,
        sampleRate: audio.sampleRate || tts.sampleRate,
      });
    },

    dispose() {
      tts = null;
    },
  };
}

/** A deterministic fake runtime for tests: no browser, no wasm. */
export function createFakeRuntime(
  init: SherpaRuntimeInit = { numSpeakers: 10, sampleRate: 44100 },
): SherpaRuntime & {
  calls: Array<{ text: string; sid: number; speed: number }>;
  disposed: boolean;
} {
  const calls: Array<{ text: string; sid: number; speed: number }> = [];
  return {
    calls,
    disposed: false,
    init: () => Promise.resolve(init),
    generate: (text, sid, speed) => {
      calls.push({ text, sid, speed });
      const seconds = Math.max(0.2, text.length * 0.05);
      const samples = new Float32Array(Math.round(seconds * init.sampleRate));
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = Math.sin(i / 20) * 0.3 + sid * 0.01;
      }
      return Promise.resolve({ samples, sampleRate: init.sampleRate });
    },
    dispose() {
      this.disposed = true;
    },
  };
}
