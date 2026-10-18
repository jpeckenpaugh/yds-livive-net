/**
 * You Don't Say — engine ports (frozen file #2 of 2)
 * =============================================================================
 *
 * ✅ FROZEN — 2026-10-18. Owner-approved; see `docs/design/README.md`'s status
 * table. After this point, a change to this file is a change to a contract and
 * must be accompanied by an edit to the owning doc.
 *
 * Owned by: docs/design/D3-engines.md
 * The other frozen file is `src/domain/types.ts` (owned by D2). This file may
 * import from it; it must never import from `src/ui/**` or `tools/**`.
 *
 * ⚠ `resolveVoice` takes a `characterId` (D3 §3, amendment C1). Voice overrides
 * are keyed by character (D2 §12), nothing forbids two characters sharing a
 * `VoiceId`, and an adapter with no character cannot honour an override. The
 * overrides map is passed at construction, not read from a global.
 *
 * Contents
 *   1. Identifiers, capabilities
 *   2. Voices
 *   3. Synthesis
 *   4. Stable keys
 *   5. Caches: audio and models
 *   6. Playback
 *   7. Asset registry (three-file split)
 *   8. Translator (build-only)
 *   9. Constants owned by D3
 */

import type {
  BeatId,
  CharacterId,
  ChoiceSetId,
  Lang,
  LineId,
  VoiceId,
  VoiceOverrides,
} from '../domain/types';

/* ============================================================================
 * 1. Identifiers and capabilities
 * ==========================================================================*/

export type EngineId =
  | 'speech-synthesis'
  | 'supertonic-transformers'
  | 'supertonic-sherpa';

/**
 * Declared, never inferred from a runtime probe (D3 §4.1, AC-ENG-02).
 * `prefetch` and `duration` are false on the M1 engine, and the UI must render
 * no preparing state and no per-line progress while they are (D4 §6.6).
 */
export type TtsCapabilities = {
  prefetch: boolean;
  cache: boolean;
  duration: boolean;
  offline: boolean;
  /** False on M1: recorded deviation G2 (D3 §4.4). The UI must not claim otherwise. */
  preservesVoiceIdentityAcrossLangs: boolean;
};

/* ============================================================================
 * 2. Voices
 * ==========================================================================*/

export type VoiceInfo = {
  /** Engine-native handle: a SpeechSynthesisVoice name, or a Supertonic voice id. */
  handle: string;
  lang: Lang;
  name: string;
  local: boolean;
};

/* ============================================================================
 * 3. Synthesis
 * ==========================================================================*/

export type SynthRequest = {
  /** A variant's rendered string — `l1` or `l2`. NEVER a template (D2 §8 INV-1). */
  text: string;
  /**
   * The speaker. Required so an adapter can honour a per-character override;
   * two characters may share a `VoiceId`, so the voice id alone is not enough.
   */
  characterId: CharacterId;
  /** The authored `Character.voice`, already resolved against any user override. */
  voiceId: VoiceId;
  lang: Lang;
  speed: number;
};

/**
 * `buffer` = the engine produced audio the app can store and replay.
 * `native` = the engine played it itself; `durationMs` is null and the cache
 * and prefetch capabilities are false (D3 §4.1).
 */
export type UtteranceKind = 'buffer' | 'native';

export type Utterance = {
  kind: UtteranceKind;
  /** Identity: see §4. Stable across processes for identical inputs. */
  key: string;
  /** null when `capabilities.duration` is false. */
  durationMs: number | null;
  /**
   * The produced audio, present iff `kind === 'buffer'` (B1, D3 §7).
   *
   * `withAudioCache` is the only module holding both the engine and the
   * `AudioCache`, and it can only populate the store if the bytes are reachable
   * from the utterance. Without this field the cache could never be written,
   * which would make AC-ENG-05's populated-store test and M3's whole cache
   * deliverable impossible. A `native` utterance has no bytes: the engine
   * played them itself.
   */
  blob?: Blob;
  /** Resolves when finished OR stopped; never rejects because of a stop. */
  play(): Promise<void>;
  /** Idempotent. Not instantaneous: see D3 §4.2.3. */
  stop(): void;
};

export type TtsErrorKind =
  | 'no-voice-for-language'
  | 'engine-init-failed'
  | 'unsupported-text'
  | 'storage-failed';

export type TtsError = {
  kind: TtsErrorKind;
  message: string;
  /** An actionable next step for the learner, when one exists (D3 §4.4, G1). */
  action?: string;
};

export type TtsEngine = {
  readonly id: EngineId;
  /** Engine + packaging + precision + voice-file revision. Part of every cache key. */
  readonly revision: string;
  readonly capabilities: TtsCapabilities;
  init(): Promise<void>;
  /**
   * Voices available for a language in this environment. May legitimately be [].
   *
   * `lang` **narrows** the list; it does not define it. A language-agnostic
   * voice style — Supertonic's `M1`–`F5`, one style per speaker used for every
   * language it speaks — is reported for each language it can serve, so the
   * same style appears under `en` and `es`. An engine whose voices are bound to
   * one language (speechSynthesis) returns only that language's voices.
   */
  voices(lang: Lang): Promise<VoiceInfo[]>;
  /**
   * Authored character + voice id + language → an engine-native handle, or null
   * when none can serve it (the G1 path, D3 §4.4). Consults the overrides map
   * supplied at construction first, then its heuristic table.
   */
  resolveVoice(characterId: CharacterId, voiceId: VoiceId, lang: Lang): string | null;
  synth(req: SynthRequest): Promise<Utterance>;
  dispose(): void;
};

export type CreateTtsEngineOptions = {
  engine: EngineId;
  /** `Preferences.voiceOverrides`, passed in rather than read from a global. */
  overrides: VoiceOverrides;
  /**
   * The model storage + fetch seam (D3 §9, B2). Required by an engine that
   * downloads assets (Supertonic); omitted by M1's `speech-synthesis`, which
   * needs none. Passing it here rather than reading IndexedDB inside the
   * adapter is what keeps the adapter testable and the storage policy in one
   * place. Wiring it touches the engine construction site (`src/main.tsx`).
   */
  models?: ModelSource;
};

/** The one-file swap point (D3 §5, D7 §6). */
export type CreateTtsEngine = (opts: CreateTtsEngineOptions) => TtsEngine;

/* ============================================================================
 * 4. Stable keys
 * ==========================================================================*/

/**
 * `sha256` needs `crypto.subtle`, which is unavailable in a non-secure context
 * (a LAN preview over http:// is the realistic case). `fnv1a64` is the
 * documented non-cryptographic fallback: it is a cache-key function over a few
 * dozen short strings, NOT a security boundary.
 *
 * The returned string is algorithm-prefixed (`sha256:<hex>` / `fnv1a64:<hex>`)
 * so a store populated under one algorithm can never be misread under another.
 * AC-ENG-03 is the requirement — identical tuples interchangeable, different
 * tuples never colliding — and the algorithm is a mechanism.
 */
export type StableKeyAlgorithm = 'sha256' | 'fnv1a64';

export type StableKey = (algorithm: StableKeyAlgorithm, input: string) => Promise<string>;

export type UtteranceKeyInput = {
  engineId: EngineId;
  engineRevision: string;
  voiceId: VoiceId;
  lang: Lang;
  speed: number;
  text: string;
};

/** Identity is the speech tuple, not the variant and not the text (D3 §3.2). */
export type UtteranceKeyOf = (input: UtteranceKeyInput) => Promise<string>;

/* ============================================================================
 * 5. Audio cache
 * ==========================================================================*/

export type CachedAudioMeta = {
  bytes: number;
  engineId: EngineId;
  engineRevision: string;
  voiceId: VoiceId;
  lang: Lang;
  speed: number;
  /** Cache metadata may carry a timestamp; generated repo artefacts may not. */
  createdAt: number;
};

export type AudioCacheUsage = { bytes: number; entries: number };

export type AudioCache = {
  has(key: string): Promise<boolean>;
  get(key: string): Promise<Blob | null>;
  put(key: string, audio: Blob, meta: CachedAudioMeta): Promise<void>;
  clear(): Promise<void>;
  usage(): Promise<AudioCacheUsage>;
};

/** A transparent decorator; returns the engine unchanged when `!capabilities.cache`. */
export type WithAudioCache = (engine: TtsEngine, cache: AudioCache) => TtsEngine;

/* ============================================================================
 * 5b. Model storage and fetch (D3 §9, B2)
 *
 * The `models` store and the Downloads surface had no seam at all. This is it.
 * The adapter owns *what* to fetch (its registry entry's `files`); this owns
 * *how* it is stored, resumed and reported. Implemented in
 * `src/engines/models.ts`, passed at construction (see CreateTtsEngineOptions),
 * and faked in tests exactly like the TtsEngine.
 * ==========================================================================*/

/** A file within a pinned repo revision. The `models` store key is the triple. */
export type ModelFileRef = { repoId: string; revision: string; path: string };

/** Progress for the Downloads surface (D4 §9). Byte counts are of the whole plan. */
export type DownloadProgress = {
  /** Total bytes expected, or null when the source reports no Content-Length. */
  totalBytes: number | null;
  /** Bytes already cached or received across the plan. */
  receivedBytes: number;
  /** The file being fetched, for a status line. */
  current: string;
};

/**
 * The model storage + fetch seam (D3 §9). Requests `navigator.storage.persist()`
 * before the first byte, caches each file under its `ModelFileRef`, and reports
 * progress so the Downloads panel can show a byte total. A failed or partial
 * fetch leaves nothing half-written; a miss and an eviction are the same code
 * path (re-fetch). One instance serves one selected packaging's plan.
 */
export type ModelSource = {
  /** True when every file in the plan is already in the `models` store. */
  isReady(plan: readonly ModelFileRef[]): Promise<boolean>;
  /** Ensure every file is present, fetching what is missing. */
  ensure(plan: readonly ModelFileRef[], onProgress?: (p: DownloadProgress) => void): Promise<void>;
  /** Bytes for a file that `ensure` has completed. */
  read(ref: ModelFileRef): Promise<ArrayBuffer>;
  /** Delete every cached model file (the Downloads panel's "delete"). */
  clear(): Promise<void>;
  /** Bytes currently stored, for the storage readout (D3 §9). */
  usage(): Promise<{ bytes: number; entries: number }>;
};

/* ============================================================================
 * 6. Playback
 * ==========================================================================*/

/**
 * One thing to say. The Scheduler (D4 §6.2) builds these; it is the only module
 * that calls `synth`. `beatId` and `alternativeId` ride along because an
 * `Utterance` does not know which line it is speaking (D3 §3.2).
 */
export type Step = {
  kind: 'speak';
  lang: Lang;
  characterId: CharacterId;
  voiceId: VoiceId;
  /** A fully-formed string from a variant. Never a template. */
  text: string;
  beatId: BeatId;
  alternativeId: LineId | ChoiceSetId;
};

export type PlaybackState = 'idle' | 'playing';

/**
 * D3 owns this interface. D4 owns every sequencing rule and every timing value:
 * order within a beat, inter-language and inter-beat gaps, prefetch depth,
 * interruption policy, and behaviour when audio is unavailable.
 */
export type PlaybackController = {
  /** Plays in order. Resolves when the last finishes or `stop()` is called. */
  play(items: readonly Utterance[]): Promise<void>;
  stop(): void;
  readonly state: PlaybackState;
  onStateChange(cb: (state: PlaybackState) => void): () => void;
};

export type CreatePlaybackController = () => PlaybackController;

/* ============================================================================
 * 7. Asset registry — THREE files, deliberately (D3 §11.1, amendments C9, B4)
 *
 *   src/engines/registry.browser.ts   the browser registry: the SELECTED
 *                                     engine's entries only. Empty in M1.
 *   tools/bake/registry.build.ts      the build registry: the MT models.
 *   tools/registry.candidates.ts      the non-selected TTS candidates
 *                                     (deferred/rejected); tooling-only.
 *
 * The split exists because `check:bundle` forbids the unselected packagings'
 * repo ids and revisions in emitted JS, and tree-shaking a single reachable
 * object literal is not guaranteed. Three files make it structural, and give
 * a deferred packaging a home that cannot reach the bundle.
 * ==========================================================================*/

export type Packaging = 'fp32-transformers' | 'int8-sherpa' | 'n/a';
export type Precision = 'fp32' | 'fp16' | 'int8' | 'int4';
export type Backend = 'webgpu' | 'wasm' | 'node';
/**
 * `'m1'` selects the M1 `speechSynthesis` engine; `'m3'` selects a Supertonic
 * packaging at the real-TTS milestone (B3 — without this value, D7 §6's
 * "flip the decision" step had no target). `'deferred'` is a candidate that is
 * documented but not selected; `'rejected'` is one that lost.
 */
export type RegistryDecision = 'm1' | 'm3' | 'deferred' | 'rejected';
export type AssetPurpose = 'tts' | 'translation' | 'voice-style' | 'runtime';
export type AssetStorage = 'browser-cache' | 'build-only' | 'bundled';
export type RegistryRuntime =
  | 'speech-synthesis'
  | 'transformers.js'
  | 'sherpa-onnx-wasm'
  | 'transformers.js-node';

/** One rung of the per-device fallback chain: a backend and a precision. */
export type PrecisionStep = { backend: Backend; precision: Precision };

export type AssetLicense = {
  weights: string | null;
  code: string | null;
  /** null is reserved for a newly added asset whose licence is not yet checked. */
  verifiedOn: string | null;
  note: string;
};

export type AssetFile = { path: string; bytes: number };

export type AssetRegistryEntry = {
  id: string;
  purpose: AssetPurpose;
  repoId: string;
  /** Pinned commit. Never a branch or a tag. */
  revision: string;
  runtime: RegistryRuntime;
  packaging: Packaging;
  precision: Precision[];
  decision: RegistryDecision;
  files: AssetFile[];
  totalBytes: number;
  backends: Backend[];
  /**
   * Ordered fallback chain, first rung that works wins. It **crosses backends**
   * (A1): a device without `shader-f16` must fall to WASM, never to
   * `webgpu + fp32` (measured 15–20× slower than WASM — D3 §6.4). The old
   * `Backend → Precision[]` map could not express that fallback.
   */
  precisionChain: readonly PrecisionStep[];
  license: AssetLicense;
  requiredForM1: boolean;
  storage: AssetStorage;
};

/** Imported by `src/**`. Contains only the selected engine's entries. */
export type BrowserAssetRegistry = readonly AssetRegistryEntry[];
/** Imported by `tools/bake/**` only. Never reachable from `src/**`. */
export type BuildAssetRegistry = readonly AssetRegistryEntry[];
/**
 * The non-selected TTS candidates — `'deferred'` and `'rejected'` (B4). Holds
 * the entries the browser registry must **not** carry, so a deferred packaging
 * has a home without its repo id reaching the bundle. Imported by
 * `tools/registry.candidates.ts`'s consumers only: `check:bundle` and tests.
 */
export type CandidateAssetRegistry = readonly AssetRegistryEntry[];

/* ============================================================================
 * 8. Translator (build-only)
 *
 * D3 owns the port and the model facts. D6 owns the pipeline that consumes it,
 * including the call sequence. No call site constructs a model prompt: the port
 * prepends the `>>es<<` target token internally (D3 §10).
 * ==========================================================================*/

export type TranslatorId = 'en-ROMANCE' | 'ROMANCE-en';

export type TranslationRequest = { text: string; from: Lang; to: Lang };

export type Translator = {
  readonly id: TranslatorId;
  readonly repoId: string;
  readonly revision: string;
  translate(req: TranslationRequest): Promise<string>;
};

export type LoadTranslatorOptions = {
  id: TranslatorId;
  revision: string;
  cacheDir?: string;
};

export type LoadTranslator = (opts: LoadTranslatorOptions) => Promise<Translator>;

/* ============================================================================
 * 9. Constants owned by D3
 * ==========================================================================*/

/** SpeechSynthesis truncates past roughly 15 s; this is the deliberate margin. */
export const MAX_UTTERANCE_MS = 12_000;
/** `init()` resolves after the first `voiceschanged` or this, whichever is first. */
export const VOICE_LIST_TIMEOUT_MS = 1_500;
export const SPEED_CACHE_PRECISION = 2;
export const AUDIO_CACHE_STORE = 'audio';
export const MODELS_CACHE_STORE = 'models';
export const VOICE_STYLE_COUNT = 10;

export const VOICE_IDS: readonly VoiceId[] = [
  'M1', 'M2', 'M3', 'M4', 'M5',
  'F1', 'F2', 'F3', 'F4', 'F5',
];
