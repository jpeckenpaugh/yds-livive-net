# You Don't Say — Engines (D3)

> **Status:** 🟡 Draft — pending owner review
> **Owner:** Designer · **Reviewer:** Project Manager
> **Purpose:** The engine boundary. The TTS port, the M1 `speechSynthesis` adapter and its recorded deviations, the M2 Supertonic adapter and the deferred packaging decision, caching, the storage/download seams, the build-only `Translator` port, and the asset registry with licenses.
> **Depends on:** D2 (variant model, `VoiceId`, capabilities are inputs to §4) · `README.md` §TTS, §Translation, §Footprint (raw material only)
> **Owns:** `src/engines/ports.ts`, the `Translator` port and model/revision/precision **facts**, the asset registry, the capability record, the engine conformance suite, `AC-ENG-*`
> **Related:** D4 (playback sequencing, degraded-state UI, About/Licenses surface) · D5 (deps, CI assertions, mocks) · D6 (bake pipeline, which *consumes* the `Translator` port) · D7 (layer map)

**Precedence.** Locked decisions > `docs/design/D2`–`D7` > `README.md`. Deliberate disagreements carry a **⚠ DIVERGES FROM README** marker.

**Ownership line (PM Flag A).** `D3` owns **only** the `Translator` port plus the model, revision and precision facts. `D6` owns the **entire bake pipeline**, *including the port's contract as consumed*. An Engineer reading this file locally must not build a pipeline; an Engineer reading D6 locally must not invent a model prompt. Both docs cross-reference in their headers.

**Vocabulary rule (PM C11/C12).** `int8` and `q8` are **never** used interchangeably anywhere in this repo, including comments and docs. See §6.3.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| The two ports (`TtsEngine`, `Translator`) and their types | Any UI behaviour, sizing, or wording of a notice (D4) |
| The M1 adapter: voice resolution, the R5 landmines, the cancel-then-speak protocol, the G1/G2 deviations | Playback ordering, gaps, interruption policy, preview affordances (D4 — Flag D) |
| The M2 adapter: both packaging options, the deferred decision, what each costs | The bake pipeline, its phases and its CLI (D6) |
| Cache keys and the cache decorator | Bundle assertions and the CI job list (D5 — this doc states the facts D5 asserts) |
| Voice styles acquisition, storage, persistence, quota, eviction, the Downloads seam | Module map, data-flow diagram (D7) |
| Build-time `Translator`: shape, revisions, the `>>es<<` convention, the revision smoke test | Gloss review workflow (D6) |
| The asset registry including license fields | … |

---

## 2. Layer position

`domain/` is the base layer. `engines/` may import from `domain/`. **`domain/` never imports from `engines/`.** The consequence that matters here: `segmentL2` (D2 §9) is importable by an engine adapter, and no engine type may appear in `src/domain/types.ts`. The full map is D7's.

---

## 3. The TTS port

Frozen in `src/engines/ports.ts` (written after this doc is approved).

```ts
type EngineId = 'speech-synthesis' | 'supertonic-transformers' | 'supertonic-sherpa';

/** Declared, never inferred from a runtime probe. See AC-ENG-02. */
type TtsCapabilities = {
  prefetch: boolean;      // audio can be prepared before the learner asks for it
  cache: boolean;         // a synthesised utterance can be stored and replayed
  duration: boolean;      // Utterance.durationMs is meaningful
  offline: boolean;       // works with no network at all
  preservesVoiceIdentityAcrossLangs: boolean;
};

type SynthRequest = {
  /** A variant's rendered string — `l1` or `l2`. NEVER a template. See AC-ENG-04. */
  text: string;
  /** The speaker. See §3.1.1 — the voice id alone cannot identify an override. */
  characterId: CharacterId;
  voiceId: VoiceId;       // the authored Character.voice
  lang: Lang;
  speed: number;
};

type Utterance = {
  kind: 'buffer' | 'native';
  /** Identity. See §3.2. */
  key: string;
  /** null when `capabilities.duration` is false. */
  durationMs: number | null;
  play(): Promise<void>;  // resolves when finished OR stopped; never rejects on stop
  stop(): void;           // idempotent
};

type TtsEngine = {
  readonly id: EngineId;
  /** Engine + packaging + precision + voice-file revision. Part of every cache key. */
  readonly revision: string;
  readonly capabilities: TtsCapabilities;
  init(): Promise<void>;
  /** Voices available for a language in this environment. May legitimately be []. */
  voices(lang: Lang): Promise<VoiceInfo[]>;
  /**
   * Authored character + voice id + lang → an engine-native handle, or null.
   * `characterId` is REQUIRED: see §3.1.1.
   */
  resolveVoice(characterId: CharacterId, voiceId: VoiceId, lang: Lang): string | null;
  synth(req: SynthRequest): Promise<Utterance>;
  dispose(): void;
};

type CreateTtsEngineOptions = {
  engine: EngineId;
  /** `Preferences.voiceOverrides`, passed in rather than read from a global. §3.1.1. */
  overrides: VoiceOverrides;
};

type VoiceInfo = { handle: string; lang: Lang; name: string; local: boolean };

type TtsErrorKind =
  | 'no-voice-for-language' | 'engine-init-failed' | 'unsupported-text' | 'storage-failed';
type TtsError = { kind: TtsErrorKind; message: string; action?: string };
```

### 3.1.1 `resolveVoice` needs a character — amendment C1

An earlier revision typed it `resolveVoice(voiceId, lang)`, and that cannot serve the feature it is for. `Preferences.voiceOverrides` is keyed by **`CharacterId`** (D2 §12), and nothing forbids two characters from sharing a `VoiceId` — the 10-beat spec happens to give Ron `M2` and Bobby `M4`, but that is content, not a constraint. An adapter that receives only a `VoiceId` has no way to look up a per-character override, so §4.3 step 1's rule was unimplementable as written.

Two changes, both in the port:

1. **`resolveVoice(characterId, voiceId, lang)`** — the character is required, and `SynthRequest` carries it too, so a caller cannot supply a voice the learner did not choose.
2. **The overrides map is passed at construction** (`CreateTtsEngineOptions.overrides`), not read from a global. An adapter that reaches for `localStorage` or a module singleton is untestable and would make the conformance suite depend on browser state. This also keeps `Preferences` ownership in D4 and the adapter's job purely mechanical.

`voiceId` remains the *authored* `Character.voice` — it is what identifies the voice in a cache key (D3 §7.2) and what the learner overrides *away from*.

### 3.2 Utterance identity — confirmation with a correction

The PM's phrasing: *engines receive a variant's `l2` string and never a template, and utterance identity is the variant, not the text.*

- **The template half is confirmed, absolutely.** No template reaches an engine. `SynthRequest.text` is always a fully-formed string from a `VariantRecord` (`l1`/`l2`) or a `BuiltOption.label`. AC-ENG-04 asserts it by property test.
- **The identity half needs correcting, and the correction matters.** Identity is **not the variant**, and it is also not the text. It is the tuple:

```
utteranceKey = sha256(engineId | engineRevision | voiceId | lang | speed | text)
```

Three reasons:

1. **One variant yields two utterances.** "Hear both" speaks `l2` then `l1` from the same variant. A variant-keyed identity cannot name both.
2. **Two variants can yield identical text.** `l1` is a render, and two renders can coincide. Text alone would wrongly merge them — harmless for audio, but it makes provenance ("which line is playing?") unanswerable.
3. **The tuple is exactly the cache key.** §7 uses the same inputs, so identity and cacheability cannot drift.

**So: identity = the speech tuple; the variant is provenance metadata.** The engine never sees a variant, and the scheduler (D4) is what associates an utterance with the beat and line it came from. This is a refinement, not a contradiction: the substantive requirement — no template, ever — is unchanged.

§7's cache key uses the same tuple, so an M2 engine swap produces zero cache hits (AC-ENG-05).

---

## 4. M1 engine: `speechSynthesis`

**Zero downloads, fully offline, zero new dependencies.** This is the M1 default and the seam through which Supertonic is later swapped.

### 4.1 Capabilities (declared)

| Capability | M1 value | Consequence |
|---|---|---|
| `prefetch` | **false** | Prefetch is a no-op in M1. D4 must not show a "preparing audio" state in M1. |
| `cache` | **false** | Nothing is stored. Replay re-synthesises. |
| `duration` | **false** | `durationMs` is always `null`. D4 must not design a progress bar that depends on it. |
| `offline` | **true** | The OS provides the voices. See G1 for the exception. |
| `preservesVoiceIdentityAcrossLangs` | **false** | Recorded deviation G2. §4.4. |

### 4.2 Adapter responsibilities — the four R5 landmines

Each is D3's adapter responsibility, each is covered by the conformance suite (§4.6), and each is a way this engine fails in the field if ignored.

**(1) Long utterances are truncated.** Chrome cuts utterances past roughly 15 s. Protocol: the adapter estimates duration from character count and, past `MAX_UTTERANCE_MS` (12 000 ms, a deliberate margin), splits the text at sentence boundaries — reusing `segmentL2(text, lang)` at `level: 'sentence'` (§2 permits it) with a comma as a fallback — then speaks the parts sequentially and reports the chain as **one** `Utterance`. `play()` resolves when the chain finishes; `stop()` stops the current part and cancels the chained remainder. Our lines are short, so this is a guard, not the common path; a trigger is logged.

**(2) The voice list populates asynchronously.** `speechSynthesis.getVoices()` may return `[]` on first call; `voiceschanged` fires later. Protocol: `init()` resolves after the first `voiceschanged` **or** `VOICE_LIST_TIMEOUT_MS` (1 500 ms), whichever comes first — it never blocks on a voice list that may never arrive. `voices(lang)` may legitimately return `[]` and callers must handle it. Cached handles are invalidated and re-resolved on every `voiceschanged`.

**(3) `speak()` is a queue and `cancel()` is unreliable.** Protocol — **cancel-then-speak with a generation guard**:

```
stop():                       cancel(); generation++        // synchronous, idempotent
play():                       assertTalking()              // if currentGeneric !== generation, ignore the old
                              await nextMacrotask()        // let cancel() settle before speaking
                              speechSynthesis.speak(utt)   // with utterance.onend / .onerror
```

A callback carrying a stale generation is dropped. `pause()`/`resume()` are **not used** — they behave inconsistently across engines and the app stops rather than pauses. The consequence D4 must absorb: **`stop()` is not instantaneous.** There is a one-macrotask lag, so a "hard cut" between beats cannot be frame-exact (pre-registered for D4).

**(4) The API is not available in Workers.** `SpeakerSynthesis` is not exposed on `WorkerGlobalScope`, and `typeof speechSynthesis === 'undefined'` is a legitimate environment (Node, CI, jsdom without the mock). Protocol: the adapter is constructed on the **main thread**, and when the API is absent it reports `voices → []` and `synth` rejects with `{ kind: 'no-voice-for-language' }` rather than throwing at import time. **This is why M1 has no worker at all** (§6.5); the port is a *service* interface, not a *worker* interface, which is what makes the M2 worker swap an implementation detail.

### 4.3 Voice resolution and the approximate mapping

`resolveVoice(characterId, voiceId, lang)` maps an authored `VoiceId` (`M1`–`F5`) to an OS voice handle. There is **no gender metadata** in the `SpeechSynthesisVoice` list, so the mapping is a heuristic over `voice.name` plus a per-language preference order, and it degrades gracefully:

| Step | Rule |
|---|---|
| 1 | **The override supplied at construction**: `overrides[characterId]?.[lang]`, if it still resolves to a live voice |
| 2 | An exact-language (`es-ES`, `es-MX`, …) local voice matching a curated preferred-name list |
| 3 | Any exact-language voice |
| 4 | The first voice whose `lang` starts with the language subtag |
| 5 | `null` → the G1 path (§4.4) |

The heuristic table is adapter data, not logic, so it can be corrected without touching the port. Ordering is deterministic for a given voice list so tests are stable. Every resulting mapping is correctable by the learner, because `resolveVoice` prefers the override and D4 owns the picker. A stale override (one naming a voice this device no longer has) falls through to step 2 rather than failing — that is why step 1 is conditional.

### 4.4 G1 and G2 — the two recorded deviations

**G1 (hard requirement amended).** M1 is playable with zero downloads **where the OS supplies an L2 voice.** Where it does not, the app degrades, and the degradation is explicit:

1. L1 audio and all text channels still work.
2. The L2 audio channel is unavailable and says so, with an actionable notice ("no Spanish voice is installed on this device") — D4 owns the wording.
3. An explicit escape hatch exists: `Preferences.playAnyway === true` permits playing L2 text with the default voice. This is **opt-in, never silent.** Playing Spanish in an English voice is precisely the failure `README §TTS` cites as Supertonic's justification, so it may not happen by default.
4. `playAnyway` is never persisted as `true` by a fallback; only a user action sets it.

**G2 (recorded deviation, not a silent one).** The locked decision promises *the same voice identity for a character in every language*. The M1 engine cannot honour it: OS voices differ per language and there is no gender metadata. Therefore `capabilities.preservesVoiceIdentityAcrossLangs === false` is declared, surfaced to the UI, and the UI **must not claim otherwise** — no copy, no icon, no tooltip may imply Ron sounds like the same person in English and Spanish while M1 is active. This is an accepted, recorded trade-off (PM ruling G2), and AC-ENG-06 asserts both the flag and the absence of the claim.

### 4.5 Recorded-M1 deviations summary

| # | Locked decision / requirement | M1 reality | Disposition |
|---|---|---|---|
| G1 | "Playable with zero model downloads" | Holds only where the OS supplies an L2 voice | Amended; degraded path + escape hatch specified |
| G2 | "Same voice ID per character in every language" | Not achievable with OS voices | Accepted, declared via capability, UI prohibited from claiming it |
| — | Prefetch ("step-to-step latency disappears", README §Repo layout) | Not possible: `capabilities.prefetch === false` | M2 concern only |
| — | Per-beat audio caching | Not possible: `capabilities.cache === false` | M2 concern only |

### 4.6 Conformance suite

One suite, run against three targets: a **fake engine** (deterministic, in-process), a **mocked `speechSynthesis`**, and — unchanged at M2 — the Supertonic adapter, with expectations gated on the declared capabilities. Assertions:

| # | Assertion |
|---|---|
| C1 | Capabilities are declared and match the environment's actual affordances; no code outside the adapter probes the runtime. |
| C2 | `init()` resolves when the API is absent, and `voices()` returns `[]` rather than throwing. |
| C3 | A voice appearing after `init()` (a later `voiceschanged`) is visible without a reload, and stale handles are re-resolved. |
| C4 | Cancel-then-speak: a second `play()` cancels the first partway; parts never interleave; stale-generation callbacks are ignored. |
| C5 | A line longer than `MAX_UTTERANCE_MS` is split at sentence boundaries and behaves as one utterance (one `play()` resolution, one `stop()`). |
| C6 | `kind: 'native'` ⇒ `durationMs === null`, and `cache`/`prefetch` capabilities are false. |
| C7 | `stop()` is idempotent; a stopped `play()` resolves rather than rejecting. |
| C8 | No voice for the language ⇒ `resolveVoice` returns `null` and `synth` rejects with `no-voice-for-language`; nothing plays. |
| C9 | The string handed to the engine is byte-identical to the string passed to `synth`, except for the documented split. A property test over every variant × every reachable session asserts no `{`/`}`/`${` ever reaches the engine. |
| C10 | `utteranceKey` is stable across processes for identical inputs and differs when any of the six inputs differs. |
| C11 | The same suite passes, unmodified, against the fake and the Supertonic adapter at M2. |

---

## 5. M1/M2 boundary

| Concern | M1 | M2 |
|---|---|---|
| Engine | `speech-synthesis` | `supertonic-transformers` **or** `supertonic-sherpa` (deferred, §6) |
| Downloads | **zero** | 138 MB or 248 MB, plus ~0.5 MB of voice styles |
| Worker | **none** (API absent in workers §4.2.4) | one, behind the port |
| Prefetch | no-op | one beat ahead |
| Cache | none | IndexedDB, keyed per §7 |
| `durationMs` | `null` | available |
| Voice identity across languages | `false` (G2) | `true` |
| Storage panel / Downloads UI | **seam only** | real (Q14) |
| Service worker | M4, not M1 (PM ruling Q9) | M4 |

---

## 6. M2 engine: Supertonic — decision **deferred to the M2 gate**

⚠ **DIVERGES FROM README** §TTS and §Footprint. The README's snippet passes `dtype: 'q8'` against `onnx-community/Supertonic-TTS-ONNX` and claims a 138 MB download. **Both are wrong** (owner-verified): that repo ships fp32 only, and the 138 MB figure belongs to a different artifact set in a different runtime shape.

### 6.1 The two packaging options

| | **A — `fp32-transformers`** | **B — `int8-sherpa`** |
|---|---|---|
| Repo | `onnx-community/Supertonic-TTS-ONNX` | `csukuangfj2/sherpa-onnx-supertonic-3-tts-int8` |
| Precision shipped | fp32, external `_data` weights | **int8**, pre-quantized |
| Files | `latent_denoiser.onnx_data` 125 MB · `voice_decoder.onnx_data` 96 MB · `text_encoder.onnx_data` 27 MB | `vector_estimator.int8` 74 MB · `text_encoder.int8` 34 MB · `vocoder.int8` 24 MB · `duration_predictor.int8` 3 MB |
| Listed total | **≈248 MB** | **135 MB** (owner quotes **138 MB** — the ~3 MB balance is presumably config/tokenizer/vocab files; confirm at the gate) |
| Runtime | `@huggingface/transformers` (transformers.js) | sherpa-onnx (WASM) |
| Fit to this port | **Direct.** Same runtime family documented for OPUS-MT; `synth` maps onto `pipeline('text-to-speech', …)`. | **Indirect.** sherpa-onnx is a C++ engine with a WASM build and its own session/streaming API; a real second integration, not a different file. |
| WebGPU | yes, with WASM fallback | browser-WebGPU availability **unverified** |
| `dtype` parameter | meaningful (load-time cast/quantization) | none of the sort; the artifact *is* int8 |
| Integration cost | low | medium — a new adapter surface, a new fetch/cache path, and its own conformance work |
| Cost delta | +110 MB per learner | −110 MB, +adapter work |

**Do not pick one here.** Both are registry entries (§11) with `decision: 'deferred'`, and §6.2 makes the choice a data swap. The M2 gate decides with evidence from a spike.

### 6.2 What the decision costs, both ways

| If the gate picks | Extra work | Risk retired |
|---|---|---|
| **A (fp32/transformers)** | Almost none beyond the adapter itself. | Integration risk. Pays 110 MB. |
| **B (int8/sherpa)** | A second runtime, a second asset-fetch path, a second conformance pass, and WebGPU unverified. | Download size. Adds integration risk to the milestone that is supposed to be about voice quality. |

Both paths are behind the same port, so the gate can change its mind later at the cost of one adapter plus one registry entry. That is the whole point of deferring.

### 6.3 Precision vocabulary — never mix these

| Term | Meaning | Must never be used for |
|---|---|---|
| **fp32** | 32-bit float ONNX weights. The only format in packaging A. | the 138 MB artifact |
| **int8** | 8-bit integer **pre-quantized** weights, shipped as files. The format of packaging B. | a `dtype` request at load time |
| **load-time precision (`dtype`)** | a transformers.js *request* to cast/quantize at load; not an artifact | a file on disk or a download size |

**Consequences for prose and code:** the 138 MB artifact is **int8**; the string `q8` must not be used to describe it; and the README's `dtype: 'q8'` load against packaging A is not available as written. AC-ENG-12 asserts the repo never mixes the terms.

### 6.4 Per-device precision fallback chain

Specified as **data** in the registry entry, so an unsupported precision fails loudly naming the entry rather than silently downgrading to a different model (AC-ENG-13).

| Packaging | Backend | Chain (first that works wins) | Notes |
|---|---|---|---|
| A `fp32-transformers` | `webgpu` | `fp16` (load-time cast) → `fp32` | fp16 is the WebGPU sweet spot; falls back on unsupported-op errors |
| A `fp32-transformers` | `wasm` | `fp32` | A ships no quantized files, so there is no int8 step here |
| B `int8-sherpa` | `wasm` | `int8` (+SIMD) → `int8` → hard fail | The artifact is int8; backend features vary |
| B `int8-sherpa` | `webgpu` | **unverified** — part of the gate | — |

Hard fail is a first-class outcome: an error naming the registry entry and the attempted chain, surfaced to the learner as "this device cannot run the audio engine", with the degraded G1-style path still available.

### 6.5 Worker topology

ONNX work runs in a **Web Worker**, behind a promise shaped as "is this beat's audio ready?". Consequences to write down because they are easy to get wrong:

- The port stays a **service** interface: `prefetch` becomes a real capability because a `buffer` utterance can be produced ahead of time; `duration` becomes available.
- `speechSynthesis` is unavailable in workers — hence M1's in-process adapter — and Supertonic's adapter must own its worker lifecycle and `dispose()`.
- The UI never blocks: the "ready?" promise is what the prefetcher awaits (sequencing is D4's).
- Worker + WebGPU + WASM memory: the worker is where the ~248 MB (or ~138 MB) of weights and the runtime live, so a worker crash must degrade rather than blank the app.

### 6.6 Voice styles

10 files, `M1.bin`–`F5.bin`, **~49 KB each, ~0.5 MB total**, fetched from the pinned revision at runtime and cached in the browser.

⚠ **DIVERGES FROM README** §Footprint, which lists "Voice styles, all ten … **upfront**". "Upfront" implies bundling; PM ruling C10 forbids committing model artifacts, so they are fetched-and-cached instead. Two further notes:

- ⚠ **DIVERGES FROM README** §TTS's snippet passes `speaker_embeddings: '.../voices/M1.bin'` — a **path**. There is no filesystem path in a browser. The adapter must fetch the bytes (from the pinned revision) and hand the runtime a blob/buffer/tensor. The snippet is not implementable as written.
- CI asserts no binary >100 KB under `src/` (PM C10, R11). Voice styles are ~49 KB each, so a single accidental commit would pass the size check — D5 should therefore also assert that `src/data/**` contains no `.bin`. Pre-registered for D5.

### 6.7 Licenses — verified

⚠ **DIVERGES FROM README** §TTS, which states "MIT code / OpenRAIL-M model" once, for the whole engine, and says nothing about the MT models.

**Verified (owner):**

| Asset | Weights | Code | Consequence |
|---|---|---|---|
| Supertonic 3, both packagings | **OpenRAIL-M** (weights card is `openrail`) | **MIT** (upstream `LICENSE`) | OpenRAIL-M carries **use restrictions**, so it must be surfaced to the learner **as restrictions**, not merely included as text. Packaging B is a conversion of the same weights, so the same restrictions apply. |
| OPUS-MT `en-ROMANCE` and `ROMANCE-en` (`Helsinki-NLP`, mirrored under `Xenova/`) | **Apache-2.0** | — | Apache-2.0 requires the license text be included and nothing more. There is **no upstream NOTICE file**, so **no attribution line is required** on the About surface. |

Three consequences, all testable:

1. **`verifiedOn` is no longer a nullable placeholder.** Every registry entry naming weights carries a verified license, and `verifiedOn: null` is reserved for a future asset added before its license is checked — it must never be silently treated as "probably fine".
2. **OpenRAIL-M is a use-restricted license.** This app — a language-learning reader that synthesises speech locally and redistributes nothing — is plainly within its intent, but the restriction is recorded rather than glossed over, so a future redistribution decision (committing weights, shipping a pre-baked audio bundle) is a decision and not an accident. That decision is also why C10 forbids committing weights.
3. **D4's About/Licenses surface has two jobs, not one:** include the licenses (all of them), and state OpenRAIL-M's **use restrictions** in plain language. §14 records that as a forward dependency. No OPUS-MT attribution is needed, which is the simplification this ruling buys.
4. Apache-2.0's "include the license text" is satisfied by shipping the license file(s) in the repo and listing them on the surface; both are D4/D5 concerns, and the *fact* is recorded here.

---

## 7. Cache

```ts
type AudioCache = {
  has(key: string): Promise<boolean>;
  get(key: string): Promise<Blob | null>;
  put(key: string, audio: Blob, meta: CachedAudioMeta): Promise<void>;
  clear(): Promise<void>;
  usage(): Promise<{ bytes: number; entries: number }>;
};

withAudioCache(engine, cache): TtsEngine   // no-op decorator when !engine.capabilities.cache
```

`utteranceKey({engineId, engineRevision, voiceId, lang, speed, text})` = `stableKey(algorithm, `${engineId}\u0000${engineRevision}\u0000${voiceId}\u0000${lang}\u0000${speed.toFixed(2)}\u0000${text}`)`

Rules:

1. **The engine revision is in the key** (PM's explicit requirement). A revision bump — new packaging, new precision, new voice-file revision — invalidates every entry, so an M2 swap can never serve M1 audio, and a re-pinned revision can never serve stale audio. AC-ENG-05.
2. `voiceId` is the **authored** `VoiceId`, not the resolved handle, so a change in OS voice resolution does not invalidate the cache or, worse, serve a different voice's audio under an unchanged key.
3. `speed` is fixed to two decimals so `1` and `1.0` cannot produce the same key with different audio.
4. `withAudioCache` is transparent: when `capabilities.cache` is false it returns the engine unchanged, so **M1 has no cache store populated at all**. The key discipline is specified now so the store cannot later serve mismatched audio.
5. `CachedAudioMeta` records `bytes`, `engineId`, `engineRevision`, `voiceId`, `lang`, `speed`, `createdAt` (cache metadata is allowed a timestamp; generated *repo* artifacts are not — D2 §3.3).
6. Cache misses are not errors: a miss and an eviction are the same code path (re-synthesise).
7. **The hash algorithm is a mechanism, and the fallback is specified** (amendment C8). `crypto.subtle` does not exist in a non-secure context — a LAN preview over `http://192.168.x.x` is the realistic case, and `speechSynthesis` works there — so `stableKey` takes an algorithm and the key is **algorithm-prefixed**:

   | Algorithm | Availability | Key shape |
   |---|---|---|
   | `sha256` | `crypto.subtle`, i.e. a secure context | `sha256:<hex>` |
   | `fnv1a64` | always; a documented non-cryptographic hash over UTF-8 | `fnv1a64:<hex>` |

   The prefix means a store populated under one algorithm can never be misread under the other. **AC-ENG-03 is the requirement** — identical tuples interchangeable, different tuples never colliding — and the algorithm is how it is met; `fnv1a64` over a few dozen short strings is not a security boundary and does not need to be one.

   ⚠ This also retires an earlier claim: D5 no longer asserts that the build runs from `file://`. ES modules do not load from `file://` in Chromium regardless of `crypto.subtle`, and the smoke path serves `dist/` over HTTP (D5 §9.4). `base: './'` remains, for subpath hosting.

---

## 8. Playback interface (Flag D)

```ts
type PlaybackController = {
  /** Plays the items in order. Resolves when the last finishes or stop() is called. */
  play(items: readonly Utterance[]): Promise<void>;
  stop(): void;
  readonly state: 'idle' | 'playing';
  onStateChange(cb: (s: 'idle' | 'playing') => void): () => void;
};
```

**D3 owns this interface only. D4 owns every sequencing rule**: the order within a beat (`playOrder`, D2 §12), the 400 ms L2→L1 gap, inter-beat gaps, prefetch depth, interruption policy on toggle change, and what happens when audio is unavailable. Recorded here so that D3 and D4 cannot disagree about who decides. The controller is engine-agnostic and never inspects `kind`.

---

## 9. Storage, persistence and the Downloads seam (R10, Q14)

Not M1 work. The seam is reserved so M2 does not have to re-plumb the UI.

| Concern | Specified now | Owner |
|---|---|---|
| Store | IndexedDB: an `audio` store (Blob by `utteranceKey`) and a `models` store (ArrayBuffer by `repoId@revision/path`) | D3 |
| Persistence | `navigator.storage.persist()` is requested **before** the first model download, and the result is surfaced | D3 (call) / D4 (copy) |
| Usage | `navigator.storage.estimate()` feeds the storage readout | D3 (read) / D4 (UI) |
| Quota | `QuotaExceededError` is a distinct, non-fatal state: the download stops, the partial state is discarded, the learner is told the size and offered "delete cached audio" | D3 (contract) / D4 (state) |
| Eviction | Safari evicts non-installed origins (~7 days). A missing model file is indistinguishable from "never downloaded": **re-download**, never crash. `storage.estimate()` drives a "cached audio was removed" notice | D3 |
| Downloads panel (seam) | byte total, progress, resumability, delete, the persist button | D4 (UI, M2) |
| Service worker | **M4**, not M1 (PM ruling Q9) | D5 |

Why this is written now: `persist()` must be requested *before* the first large download to have any chance of being granted, so the ordering is a contract even though the feature is M2.

---

## 10. The build-only `Translator` port

Frozen in `src/engines/ports.ts`. **This is the only part of `bake` that D3 owns.**

```ts
type TranslatorId = 'en-ROMANCE' | 'ROMANCE-en';

type TranslationRequest = { text: string; from: Lang; to: Lang };

type Translator = {
  readonly id: TranslatorId;
  readonly repoId: string;
  readonly revision: string;          // pinned commit; never a branch or a tag
  translate(req: TranslationRequest): Promise<string>;
};

type LoadTranslator = (opts: {
  id: TranslatorId;
  revision: string;
  cacheDir?: string;
}) => Promise<Translator>;
```

Model facts:

| Id | Repo | Direction | Target selection | Size | Runtime |
|---|---|---|---|---|---|
| `en-ROMANCE` | `Xenova/opus-mt-en-ROMANCE` | English → es/pt/fr/it/ro/ca… | **sentence-initial target token `>>es<<`** | ~107 MB | transformers.js in **Node** |
| `ROMANCE-en` | `Xenova/opus-mt-ROMANCE-en` | es/pt/fr → English | source detection (no token) | ~107 MB | transformers.js in **Node** |

Rules:

1. **The port owns the `>>es<<` convention.** `translate({ text, from: 'en', to: 'es' })` and the adapter prepends the token internally. **No call site constructs a model prompt** (AC-ENG-17). This is the seam that lets the pipeline stay model-agnostic, and it is the reason the token is a *fact* (D3) while its *use* is pipeline (D6).
2. **Revisions are pinned** (R3) and recorded in `Conversation.meta.translator`. Never a branch: a moving model makes every build look stale.

   **The pinned revisions, as of 2026-10-18** (fetched from the Hugging Face API by the owner; amendment E7):

   | Model | Pinned revision |
   |---|---|
   | `Xenova/opus-mt-en-ROMANCE` | `9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd` |
   | `Xenova/opus-mt-ROMANCE-en` | `f60feaabe8bb435a5871e7702b25f53a01e770f8` |

   These are the values `registry.build.ts` must carry, and the values a shipping artifact's `translationRev` must match. **A revision bump is a deliberate act**, per R3's mitigation: it re-drafts every line, which invalidates every `mt`, every gloss key derived from one, and every review stamp. It must therefore be its own commit, never a side effect of a rebuild. AC-CONTENT-23 asserts that a `'shipping'` artifact's revisions are these SHAs and that a `'fixture'` artifact's are consistent without being SHAs (D2 §7.2).

   The **Supertonic** revisions arrive with M3 and are recorded the same way (§11); nothing about them is needed to bake.

   ⚠ An earlier revision of this doc said "record them in D3 §10" without supplying values, so `registry.build.ts` shipped with placeholders. That is the gap this table closes; if a placeholder is ever found in a committed registry, `E_TRANSLATOR_REV_STALE` is what catches it.
3. **`>>es<<` must be proven honoured before a full bake** (R2). Phase 0 of the pipeline runs a smoke test: `translate('Do you want to get together tomorrow?', en→es)` must differ from the same call with `to: 'pt'`. If the sentinel is ignored, the failure mode is Portuguese text on a Spanish page with **no error anywhere**, which is the worst possible silent failure for this project. The smoke test is specified here because it is a property of the model; D6 runs it as its first phase.
4. **Node only.** No browser code path reaches a `Translator`. Its implementation is a build-only module (`tools/bake/translator.node.ts`, D6 §2.1); `src/engines/ports.ts` holds types only. D5's bundle assertions make this checkable (R11).
5. The `Translator` is **injected** (R6): tests pass a fake and the whole pipeline runs offline. It is a frozen port for exactly that reason.
6. MT precision/revision details for the build machine (cache directory, dtype) belong to the registry entry; CI never loads them at all (§11, D5).
7. **`meta.sourceDigest` is a hash of the source file's bytes, so line endings are part of this contract.** `.gitattributes` forces `eol=lf` (D5 §10). A CRLF checkout — a Windows contributor, or a tool that rewrites endings — makes **every** CI run report `E_SOURCE_STALE` while the author changed nothing, and the symptom looks like an authoring problem rather than a checkout difference. Cross-referenced here because `sourceDigest` is a revision-identity concept and belongs beside the revision pinning that rule 2 requires.
8. **The inference runtime is loaded lazily, inside the injected port, and is not installed in M1** (amendment F3). `tools/bake/translator.node.ts` types against a local `TransformersLike` interface and does `await import(...)` *inside* `loadTranslator`; a `declare module` shim in `tools/bake/` satisfies typecheck. Consequences:
   - `bake --check --author-only` — M1's and CI's only mode — never evaluates the import, so **a Node-major incompatibility with `onnxruntime-node` cannot break M1's gate**;
   - `@huggingface/transformers` and `onnxruntime-node` are **absent from `package.json` in M1** and are added at the first full bake (`npm i -D @huggingface/transformers`, documented in D6). AC-TOOL-04's intent is unchanged and strengthened: if either ever appears, it must be a devDependency, never a runtime dependency.
   - The alternative — installing them now so types resolve — would put a native-module install into M1's `npm ci` for no M1 benefit. The shim removes the risk rather than deferring it.

⚠ **DIVERGES FROM README** §Decisions ("Translation: client-side MT") and §Footprint ("lazily, first hover"). Under locked decision 3 the browser performs no translation and downloads no translation model, so the 214 MB is a **build-machine** cost, not a learner cost, and the README's footprint table no longer describes the app.

⚠ A second README divergence: §Open questions asks whether MT is the hover layer or the source of the second language. **That question is closed** (PM ruling C7): MT drafts the whole L2 dialogue *and* every gloss span at build time.

---

## 11. Asset registry

```ts
type Precision = 'fp32' | 'fp16' | 'int8' | 'int4';

type AssetRegistryEntry = {
  id: string;                        // 'supertonic-fp32-transformers'
  purpose: 'tts' | 'translation' | 'voice-style';
  repoId: string;
  revision: string;                  // pinned commit
  runtime: 'speech-synthesis' | 'transformers.js' | 'sherpa-onnx-wasm' | 'transformers.js-node';
  packaging: 'fp32-transformers' | 'int8-sherpa' | 'n/a';
  precision: Precision[];
  decision: 'm1' | 'deferred' | 'rejected';
  files: Array<{ path: string; bytes: number }>;
  totalBytes: number;
  backends: Array<'webgpu' | 'wasm' | 'node'>;
  precisionChain: Record<string, Precision[]>;   // §6.4
  license: { weights: string | null; code: string | null; verifiedOn: string | null; note: string };
  requiredForM1: boolean;
  storage: 'browser-cache' | 'build-only' | 'bundled';
};
```

Entries: M1 `speech-synthesis` (`bundled`, zero bytes, `decision: 'm1'`); the two Supertonic packagings (`decision: 'deferred'`, §6.1); the ten voice styles (`storage: 'browser-cache'`, `revision` pinned, ~49 KB each); the two OPUS-MT models (`storage: 'build-only'`).

### 11.1 The registry is TWO files — amendment C9

An earlier revision said "the registry is the only module that names a repo id", which contradicted D5's `check:bundle`: it forbids `supertonic`, `sherpa`, `opus-mt` and any registry `repoId` in emitted JS, while AC-ENG-11 requires exactly those strings to exist in `src/engines/registry.ts`. Tree-shaking a single reachable object literal is not guaranteed, so the contradiction was real and would have surfaced as a permanently red gate.

| File | Imported by | Contains | In the bundle? |
|---|---|---|---|
| `src/engines/registry.browser.ts` | `src/**` | **only** the selected engine's entries. **Empty in M1** — `speechSynthesis` needs no assets. | yes, and in M1 it is an empty array |
| `tools/bake/registry.build.ts` | `tools/bake/**` only | the two OPUS-MT entries | no; `tools/` is outside the app scan root |

Rules:

1. `requiredForM1` is `false` for everything except the engine the build selects. A CI check asserts the M1 build fetches nothing (AC-ENG-10).
2. **No code outside the two registry modules selects a packaging, a precision, or a revision.** AC-ENG-11. The browser registry is the only one `src/**` may import.
3. `license.weights` and `license.code` are non-null and verified (§6.7) for every entry that ships or fetches an artifact. `verifiedOn === null` is reserved for a newly added asset whose license has not yet been checked.
4. `storage: 'browser-cache'` and `'build-only'` are never `'bundled'` for weights (PM ruling C10).
5. **`check:bundle`'s forbidden list is derived from the build's engine selection** (D5 §6.3): `transformers`, `onnxruntime` and `opus-mt` are always forbidden in the bundle, because translation never runs in a browser; `supertonic` and `sherpa` are forbidden **while `__TTS_ENGINE__ === 'speech-synthesis'`**, and become permitted when the M2 engine is selected, because at that point the engine genuinely is in the bundle. A registry `repoId` is forbidden unless it belongs to the selected packaging. This is what makes the M1 assertion meaningful without making M2's gate impossible.

---

## 12. Constants

| Key | Value | Notes |
|---|---|---|
| `MAX_UTTERANCE_MS` | `12_000` | §4.2.1 split threshold (margin under Chrome's ~15 s) |
| `VOICE_LIST_TIMEOUT_MS` | `1_500` | §4.2.2 `init()` ceiling |
| `DEFAULT_SPEED` | `1.0` | D2 §13 owns the value; the clamp range is D4's |
| `SPEED_CACHE_PRECISION` | `2` | §7.3 |
| `AUDIO_CACHE_STORE` / `MODELS_CACHE_STORE` | `'audio'` / `'models'` | IDB store names |
| `VOICE_STYLE_COUNT` | `10` | `M1`–`M5`, `F1`–`F5` |

---

## 13. Acceptance criteria (`AC-ENG-*`)

| ID | Criterion |
|---|---|
| **AC-ENG-01** | The ports are the only engine surface: no module outside `src/engines/**` references `speechSynthesis`, `transformers`, or `sherpa`. |
| **AC-ENG-02** | Capabilities are declared data; the M1 adapter's five values match §4.1, and no code branches on a runtime probe outside an adapter. |
| **AC-ENG-03** | Utterance identity is the six-part tuple of §3.2; identical tuples are interchangeable and different tuples never collide. The key is algorithm-prefixed, `sha256` is used in a secure context, and the documented `fnv1a64` fallback is used where `crypto.subtle` is absent (§7.7). |
| **AC-ENG-04** | No template reaches an engine: a property test over every variant × reachable session asserts no `{`, `}` or `${` is ever passed to `synth`, and no engine module imports a `*.source.json`. |
| **AC-ENG-05** | Cache keys include `engineId` and `engineRevision`; changing either yields zero hits against a populated store. |
| **AC-ENG-06** | M1 declares `preservesVoiceIdentityAcrossLangs === false`, and no UI string, icon or tooltip claims identity preservation while M1 is active. |
| **AC-ENG-07** | G1: with no L2 voice, text and L1 audio still work, the notice is actionable, `playAnyway` is off by default, and turning it on plays the L2 text. |
| **AC-ENG-08** | The four R5 landmines are covered: >`MAX_UTTERANCE_MS` splits at sentence boundaries; a late `voiceschanged` refreshes handles; cancel-then-speak never interleaves and drops stale callbacks; the adapter is safe when the API is absent. |
| **AC-ENG-09** | The conformance suite (§4.6, C1–C11) passes against the fake engine and the mocked `speechSynthesis`. |
| **AC-ENG-10** | The M1 build constructs no worker and fetches nothing: no `new Worker` in the M1 bundle, and every registry entry with `requiredForM1` is `bundled` with zero bytes. |
| **AC-ENG-11** | Packaging, precision and revision are selected only from the two registry modules (§11.1); a test asserts no literal repo id or revision appears outside them, and that `src/**` imports only `registry.browser.ts`. |
| **AC-ENG-12** | `int8` and `q8` are never used interchangeably in code or comments; the check is scoped to code files and ignores `docs/**` (D5 §6.1), because a doc must be able to name the wrong term to forbid it. |
| **AC-ENG-13** | The precision chain is registry data, and an unsupported precision fails loudly naming the entry and the attempted chain. |
| **AC-ENG-14** | Voice styles are fetched from the pinned revision and cached, never committed: no binary >100 KB and no `.bin` under `src/`. |
| **AC-ENG-15** | `persist()` is requested before the first model download; `QuotaExceededError` and eviction are distinct non-fatal states and neither can crash or blank the app. |
| **AC-ENG-16** | The `Translator` is injected: the whole pipeline runs with a fake translator under a test that fails on any network access. |
| **AC-ENG-17** | The port owns the `>>es<<` convention; no call site constructs a model prompt. |
| **AC-ENG-18** | The phase-0 smoke test asserts `to: 'es'` differs from `to: 'pt'` before any full bake. |
| **AC-ENG-19** | `translationRev` rules hold: both null is clean; exactly one null is `E_TRANSLATOR_REV_STALE` with a distinct message; differ is the same code; and `(mt === '') === (translationRev === null)` everywhere. A `'shipping'` artifact's revisions are the pinned SHAs of §10.2; a `'fixture'` artifact's are its fixture translator identifier (D2 §7.2). |
| **AC-ENG-20** | The production bundle contains none of `transformers`, `onnxruntime`, `opus-mt` or `supertonic` (mechanism: D5). |
| **AC-ENG-22** | `resolveVoice` takes a character id and consults the override map supplied at construction (§3.1.1); two characters sharing a `VoiceId` receive their own overrides, and no adapter reads `localStorage`, a global, or a module singleton to obtain them. |
| **AC-ENG-21** | Every registry entry naming weights has a **verified** license (§6.7), and the About/Licenses surface lists all of them and states OpenRAIL-M's use restrictions in plain language. |

---

## 14. Cross-doc notes — pre-registered pushback

**For D4 (UI):**
1. **M1 cannot prefetch and cannot report duration.** There is no "preparing audio" state and no progress bar that follows a line. If D4 wants either, it must be capability-gated, not unconditional.
2. **`stop()` has a one-macrotask lag** (§4.2.3), so a hard cut between beats is not frame-exact.
3. **`kind: 'native'` audio cannot be replayed from cache** — a replay re-synthesises, so replay latency is non-zero in M1 even though it is instant in M2.
4. **Utterance ≠ variant.** To show "which line is playing", the scheduler must map an utterance back to its beat and line; that mapping is D4's, because the engine deliberately does not carry it.
5. **G1 is a state machine, not a message**: no L2 voice → notice → optional escape hatch → (M2) no longer reachable.
6. **D4 owns all timings**, including the 400 ms gap that D2 deliberately did not contain.
7. **About/Licenses has two jobs** (§6.7): include every license *and* state OpenRAIL-M's **use restrictions** in plain language. No OPUS-MT attribution is required (Apache-2.0, no NOTICE), so D4 should not add one.

**For D5 (tooling):**
1. **CI must never generate.** The default is `bake --check --author-only` (offline, zero downloads). A full bake needs ~214 MB of MT models and must not run in CI.
2. `@huggingface/transformers` and `onnxruntime-node` are **devDependencies only**; promoting either to `dependencies` must fail AC-ENG-20.
3. The `<100 KB` rule (C10) does not catch ~49 KB voice styles — add a no-`.bin`-under-`src/` assertion.
4. The MT build cache directory (and any `HF_HOME`) needs `.gitignore` coverage.
5. D5 owns the `speechSynthesis` mock used by both the conformance suite and UI tests; D3 owns the assertions, and D5 must not duplicate fixtures.
6. **AC-ENG-12 is a trap I set for myself.** This document uses the string `q8` several times — all of them to say it is wrong. A repo-wide grep in CI would fail on its own spec. **Resolved in D5 §6.1:** the check is scoped to code files (`.ts`/`.tsx`/`.js`/`.mjs`) and ignores `docs/**`, because a doc must be able to name the wrong term in order to forbid it.
7. Node floor: pin `engines.node` so the CI Node matches local — `onnxruntime-node` is sensitive. **Amended at freeze:** the risk is now removed rather than managed, because `@huggingface/transformers` and `onnxruntime-node` are not installed in M1 and the runtime is imported lazily inside the injected port (§10.8). D5 §2 must drop them from the M1 dependency list and note the first-bake install command.
8. **`check:bundle`'s forbidden list must be engine-derived** (§11.1 rule 5). A flat list forbidding `supertonic` permanently would make the M2 gate impossible; a flat list that omits it would make the M1 assertion meaningless.

**For D7 (architecture):**
1. `domain/` is the base layer; `engines/` depends on it and never the reverse. `ports.ts` is **not** a domain file.
2. **M1's diagram contains no worker box.** The worker is an M2 implementation detail *behind* the port; showing it in M1 misrepresents the milestone that must ship with zero downloads.
3. `bake` is a **separate Node program** with its own dependency set; the flow is source → bake → committed artifact → bundle. The browser never talks to a translator.
4. The honest M2 swap checklist: adding `supertonic-*` touches `src/engines/tts/` **plus** one registry entry, one `package.json` entry, and a Vite worker setting. The locked claim is "one file"; the accurate claim is "one directory plus three one-line registrations". Say the accurate one.
5. **The registry is two files** (§11.1): `src/engines/registry.browser.ts` (imported by `src/**`, empty in M1) and `tools/bake/registry.build.ts` (the MT models). D7 §2's rule that "only the registry names a repo id" must name both, and must say that `src/**` may import only the browser one.
6. `ports.ts` now exists and is **frozen** — D7's layer map should show it as a real artefact rather than a planned one.
