# M3 packaging spike — evidence and decision

> **Status:** Decided · **Owner:** Project Manager · **Date:** 2026-10-18
> **Purpose:** Record the measurement, the recommendation, the owner's decision, and the risks the
> decision accepts. `D3 §6.1` documents the options; this records why one was chosen.
> **Method:** measured on Node 26 / Playwright Chromium 156, served over `http://127.0.0.1` (a secure
> context is mandatory — `navigator.gpu` is undefined otherwise).

## ⚠ Every performance number here is SwiftShader CPU

The only GPU adapter this machine exposes is `google/swiftshader`, and **`shader-f16` is absent**.
Nothing below is a device-GPU number. On this machine **WebGPU is 15–20× *slower* than WASM**, so
WebGPU timings say nothing about real hardware and are not presented as if they did.

## The measurement

| | **A** fp32/transformers | **B** v3 int8/sherpa | **C** v2 int8/sherpa |
|---|---|---|---|
| repo @ revision | `onnx-community/Supertonic-TTS-ONNX` `cff123c8…` | `threebobss/supertonic-3-tts-int8-sherpa` `a37d311c1c7c0b222b587636324847f19ade05c2` | `csukuangfj2/sherpa-onnx-supertonic-tts-int8-2026-03-06` **`5dec5897b86e2b293790eedb5e1f561a3295651f`** |
| model bytes | 250.8 MB | 138.6 MB | **91.9 MB** |
| runtime asset | 26.9 MB wasm | 13.4 MB wasm + 145 MB `.data` | same |
| cold first-load | 278 MB, **11.4 s** | 151.5 MB | 104.8 MB |
| RTF, browser WASM | 0.21–0.38 | 0.48–0.65 | **0.20–0.26** |
| RTF, browser WebGPU | 15–21 *(SwiftShader)* | — | — |
| non-silent | ✅ | ✅ | ✅ |
| voice-distinct | ✅ | ✅ | ✅ |
| voice styles | 10 | 10 | **10, verified** |
| `fp16` step | **fails** — no `shader-f16` | n/a (artifact is int8) | n/a |

**Option C's ten styles are verified**: `voice.bin` is 517,168 B = a 48-byte header + 10 × 51,712, the
header's first int32 is 10, and all ten vectors are pairwise distinct and non-zero. **Caveat: they are
Supertonic 2's styles, not v3's** — the identity *property* holds, the specific voices differ by version.

**Option B is dropped.** C dominates it on every measured axis — 92 vs 139 MB, RTF 0.20–0.26 vs
0.48–0.65, 289 vs 342 MB load RSS — and they share a runtime, so B is strictly worse.

## The decision, and the fact that it overrides the rule

The Engineer **wrote a decision rule before running the spike**, precisely so it could not be
rationalised afterwards:

> *A wins if it loads, produces non-silent, voice-distinct audio for both languages, stays under
> ≤1.5 GB peak, and first-loads in ≤~60 s; B wins only if A fails or A's time/memory is disqualifying.*

**By that rule, A wins** — it loaded in 11.4 s against a 60 s bar, produced non-silent voice-distinct
audio in both languages, and did not breach the memory clause (though A's true peak is unmeasured; only
the JS heap is observable).

**The recommendation was A. The owner chose C**, weighting the **173 MB smaller learner download**
(105 MB against 278 MB) over A's lower integration cost. That is a legitimate product judgement about a
learner-facing cost, and it is recorded here as an override so that no future reader concludes A lost on
its merits. The rule is not retrofitted to fit the outcome.

## Risks this decision accepts, and how each is mitigated

| risk | why it matters | mitigation |
|---|---|---|
| **v2's short-utterance weakness** | v3's headline improvement is "fewer repeat and skip failures **on short utterances**" — and a conversation is nothing but short utterances. The spike proved non-silence and voice-distinctness, **not** quality, so this risk is accepted unmeasured. | **A listening check is an M3 acceptance item**: every shipping line synthesised and auditioned for repeats, skips and truncation before M3 is called done. This is the one risk the decision cannot leave implicit. |
| **A second runtime** | sherpa-onnx is a new integration with its own fetch/session path and conformance work. | Scoped as its own step in the M3 plan; the port is the seam, so the UI does not know. |
| **Runtime and model are not separable** | sherpa bakes the model into a **145 MB `.data`** file, so a per-model `.data` rebuild (or emscripten FS injection) is required, and the Downloads panel cannot report "runtime" and "model" as separate totals. | Specify the `.data` build step in `D5`, and define the Downloads byte total as the whole `.data` plus wasm. |
| ~~Licence unverified~~ → **resolved** | `AC-ENG-21` requires a **verified** licence for any selectable entry, and C's was unverified. | **Verified 2026-10-18: `sherpa-onnx` is Apache-2.0** — the npm package and `k2-fsa/sherpa-onnx` upstream agree. The gate is satisfied and the entry carries `license: Apache-2.0` with a `verifiedOn` date. The weights' own licence is recorded separately by the model entry. |
| **WebGPU unverified for sherpa** | D3 §6.3 already flags it. The spike ran C in WASM only. | C is **WASM-only in practice**; the precision chain for C is `['int8']` with no `dtype` request — the artifact *is* int8, and `D3 §6.3` forbids describing it with `q8`. |

## Consequences for the specs, independent of the choice

These were measured and are wrong as written regardless of which packaging won:

1. **`D3 §6.4`'s precision chain is the wrong shape.** `fp16` fails without `shader-f16`, and
   WebGPU-without-fp16 measured **15–20× slower than WASM**. The chain should fall to **WASM**, not to
   `webgpu+fp32`; as written it would send a learner down the slow path.
2. **`check:bundle` item 3 forbids `.wasm` in `dist/`** — every option ships one (13.4 MB for sherpa,
   26.9 MB for ort). It needs an allow-listed runtime asset.
3. **`MAX_BUNDLE_GZ_KB = 90`** is exceeded by packaging A's JS alone (162.66 KB measured) and needs a
   measured replacement; for C the JS cost is lower but the `.data` asset is 145 MB.
4. **`AC-TOOL-04` ("devDependency-only", "one runtime dependency")** — `sherpa-onnx` has no hard
   dependencies (a point in C's favour), but the rule as written needs checking against whichever
   runtime lands.
5. **`D3 §6.1`'s repo id for B is dead** — `csukuangfj2/sherpa-onnx-supertonic-3-tts-int8` returns
   **HTTP 401**. Any future option must pin a public mirror with a revision.

## Not verified

- Real-GPU WebGPU performance and the `fp16` path — no real adapter on this machine.
- A's true peak memory — only the JS heap is observable.
- **Audio intelligibility, and the v2-vs-v3 quality difference** — non-silence and voice-distinctness
  are proven; that it *sounds right* is not, and cannot be, from a spike.
- Real IndexedDB eviction and a full model-cache round trip against the Hub.
- C in-browser without emscripten FS injection — it works via injection, not via a rebuilt `.data`.
