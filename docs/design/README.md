# You Don't Say — Design Artifacts

Lean, design-time resources for the "You Don't Say" SPA. Tables and lists over prose. **D2 is deliberately the long one** — it is the semantic core every other doc cites; the rest are one-pagers.

**The concept narrative is [`README.md`](../../README.md).** It is superseded by this directory wherever the two disagree. **Precedence:** locked decisions > `docs/design/D1`–`D7` > `README.md`.

**Each kind of number has exactly one home** so the docs cannot drift: semantic constants and the diagnostic registry → **D2**; asset/model facts, sizes, dtypes, revisions, licenses → **D3**; all timing → **D4**; script and CI contract → **D5**; the 10-beat content spec and its counts → **D6**.

| Artifact | Doc | Contains | Owner | Status |
|----------|-----|----------|-------|--------|
| **D1** | `D1-poc-contract.md` | Contract: north star, loop, MVP IN/OUT, Definition of Done, milestone map, **AC registry** (indexes the `AC-*` ids owned by D2–D6) | Project Manager | ⬜ Not written |
| **D2** | [`D2-domain-model.md`](./D2-domain-model.md) | Authored source schema, generated artifact, `when` discipline, variable discipline + bound pairs, the timeline walk and its three projections, variant keys, provenance record, gloss index, `segmentL2`, session ops, `resolveTimeline`, `visibility`, **canonical semantic constants**, **diagnostic registry**, `AC-DOM-*` | Designer | 🟡 Draft (freeze gate for `src/domain/types.ts`) |
| **D3** | [`D3-engines.md`](./D3-engines.md) | TTS port + M1 `speechSynthesis` adapter + M2 Supertonic adapter, capability flags and recorded M1 deviations, cache + cache keys, Web Worker seam, `Translator` port, model/revision/precision facts, asset registry with licenses, Downloads seam, `AC-ENG-*` | Designer | 🟡 Draft |
| **D4** | [`D4-ui.md`](./D4-ui.md) | Component tree, store shape, the presentation matrix (8 rows, proven equivalent to all 32 preference states), **all playback sequencing and timing**, choice cards (pick / preview / replay-ghost), the `revealed` clamp decision, "What if", the G1/G2 state machine, keyboard, WCAG 2.2 AA, About/Licenses, `AC-UI-*` | Designer | 🟡 Draft |
| **D5** | [`D5-tooling.md`](./D5-tooling.md) | Exact compiler flags, npm scripts and exit codes, dependency split, the INV-1 lint boundary, the scoped vocabulary check, bundle/asset assertions, four Vitest projects, the CI job (never generates), the AC→test map, the M4 service-worker reserve, `AC-TOOL-*` | Designer | 🟡 Draft |
| **D6** | [`D6-content-and-bake.md`](./D6-content-and-bake.md) | Authoring guide, the **entire bake pipeline** (phases 0–8, enumeration, injected `Translator`, staleness, human-edit preservation, pruning, `--author-only`, `--check`), triage/adjudication workflow and flag-list format, coverage report, and the **10-beat English/Spanish spec**, `AC-CONTENT-*` | Designer | 🟡 Draft |
| **D7** | [`D7-architecture.md`](./D7-architecture.md) | Layer map and dependency rules, end-to-end data flow, runtime module graph, worker topology (no worker box in M1), the accurate swap checklist, build vs runtime topology, the cross-cutting invariant index, the failure topology, an Engineer reading order, `AC-ARCH-*` | Designer | 🟡 Draft |
| — | `src/domain/types.ts` | Frozen domain contracts (D2 owns) | Designer | 🟡 Draft in tree, pending the D2 freeze |
| — | `src/engines/ports.ts` | Frozen engine ports (D3 owns) | Designer | ⬜ Blocked on D3 |
| — | `docs/legal/clean-room-record.md` | Provenance and licensing position | Project Manager | ⬜ Not written |

## Locked decisions (do not re-litigate)

- **Branching:** variable-seeded linear timeline. A choice = label + response line + the variables it sets. `when` scopes a choice set to a variable value. **The timeline never forks.**
- **M1 TTS:** `speechSynthesis` behind the narrow TTS port — **zero model downloads in M1**. Supertonic arrives in M2 behind the same port.
- **M2 TTS:** Supertonic 3, `onnx-community/Supertonic-TTS-ONNX`, default device WebGPU with automatic WASM fallback, voices `M1`–`M5` / `F1`–`F5`. One voice identity per character across languages.
- **Translation:** build-time only, in Node, via `bake`. The browser ships **zero translation code and zero translation models**.
- **Stack:** Vite + Preact + TypeScript. Hand-rolled `useReducer` + context for state; no additional runtime dependency.
- **MT is a draft tool.** MT drafts every line and every gloss span; a separate review agent triages suspected errors; **the owner adjudicates the flag list**. `reviewedBy` is recorded per line and per gloss and CI fails on `null`.

## Recorded deviations and amendments

| # | Item | Resolution |
|---|------|-----------|
| **G1** | "M1 zero downloads" | Amended: playable with zero downloads **where the OS supplies an L2 voice**. Otherwise degrade to text + L1 audio with an actionable notice and an explicit "play anyway with the default voice" escape hatch (`Preferences.playAnyway`). |
| **G2** | "One voice identity across languages" | An accepted, **recorded** M1 deviation. The M1 engine reports `preservesVoiceIdentityAcrossLangs: false` and the UI must not claim otherwise. |
| **C1–C5** | README schema contradictions (`{slot}` inside `l2`, `when` on the beat, duplicated beat ids, `SlotState`, `cuisine: null`) | Superseded by D2; each carries a `⚠ DIVERGES FROM README` marker. |
| **C6** | Runtime hover translation | Impossible under locked decision 3. Clause-windowing moves into `bake`; the shipped `segmentL2` maps cursor → span offline. |
| **C11/C12** | Supertonic packaging and dtype | Model and dtype become **registry entries with the decision deferred to the M2 gate**; both packaging options are documented honestly in D3. |
| **Q9** | Service worker | **M4, not M1.** M1 has nothing to cache; the seam is reserved in D5 §11. |
| **A1** | Variant-key injectivity | **Amended in D2 §5.3**: `[beatId, parentId, …vars].join('|')`, `parentId` = `Line.id` or `Option.key`. `E_VARIANT_KEY_COLLISION` remains a permanent guard. Admissible only because nothing had been baked. |
| **A2** | Bake program path | `tools/bake/**` (D6 §2.1). The INV-1 boundary lives in `tools/scan-excludes.json` (D5 §6) and names no bake path. |
| **A5** | INV-1 boundary location | Found while writing D5: a Node ESM ESLint config **cannot import a TypeScript constant** without a transpile step, so the boundary's single machine-readable copy is `tools/scan-excludes.json`. `src/domain/types.ts` no longer exports it; D2 §13 points at the file. |
| **A3** | Registry legibility | Every diagnostic code is spelled out in full in D2 §14, one row each, so D5's CI can grep them literally. |
| **A4** | Licenses | Supertonic weights **OpenRAIL-M** (use restrictions must be surfaced as restrictions), code **MIT**. OPUS-MT **Apache-2.0** — **no attribution line required**. |
| **—** | Frozen contracts | Two files: `src/domain/types.ts` (D2) and `src/engines/ports.ts` (D3). `ports.ts` is not a domain file. |

## Scope discipline

If it is not in D1's MVP IN list, it is not in the milestone. New ideas go to the backlog, not into these docs. Acceptance criteria live with the doc that owns the behaviour and carry stable `AC-*` ids; D1 indexes them, and no criterion is restated in two places.

## Evidence convention

`tools/test-runner/` produces `test-artifacts/` (`result.json`, `test.log`, numbered artifacts). D5 owns the mapping from `AC-*` ids to executable checks.
