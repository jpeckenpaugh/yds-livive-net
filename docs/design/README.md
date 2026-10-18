# You Don't Say — Design Artifacts

Lean, design-time resources for the "You Don't Say" SPA. Tables and lists over prose. **D2 is deliberately the long one** — it is the semantic core every other doc cites; the rest are one-pagers.

**The concept narrative is [`README.md`](../../README.md).** It is superseded by this directory wherever the two disagree. **Precedence:** locked decisions > `docs/design/D1`–`D7` > `README.md`.

**Each kind of number has exactly one home** so the docs cannot drift: semantic constants and the diagnostic registry → **D2**; asset/model facts, sizes, dtypes, revisions, licenses → **D3**; all timing → **D4**; script and CI contract → **D5**; the 10-beat content spec and its counts → **D6**.

| Artifact | Doc | Contains | Owner | Status |
|----------|-----|----------|-------|--------|
| **D1** | `D1-poc-contract.md` | Contract: north star, loop, MVP IN/OUT, Definition of Done, milestone map, **AC registry** (indexes the `AC-*` ids owned by D2–D6) | Project Manager | ✅ Frozen |
| **D2** | [`D2-domain-model.md`](./D2-domain-model.md) | Authored source schema, generated artifact, `when` discipline, variable discipline + bound pairs, the timeline walk and its three projections, variant keys, provenance record and review policy, gloss index, `segmentL2`, session ops, `resolveTimeline`, `visibility`, **canonical semantic constants**, **diagnostic registry (49 codes)**, `AC-DOM-01..24` | Designer | ✅ **Frozen** |
| **D3** | [`D3-engines.md`](./D3-engines.md) | TTS port + M1 `speechSynthesis` adapter + M2 Supertonic adapter, capability flags and recorded M1 deviations, cache + cache keys + stable-key fallback, Web Worker seam, `Translator` port, model/revision/precision facts, the two-file asset registry, Downloads seam, `AC-ENG-01..22` | Designer | ✅ **Frozen** |
| **D4** | [`D4-ui.md`](./D4-ui.md) | Component tree, store shape, the presentation matrix (8 rows, proven equivalent to all 32 preference states), **all playback sequencing and timing**, choice cards (pick / preview / replay-ghost), option icons, the `revealed` clamp decision, "What if", the G1/G2 state machine, keyboard, WCAG 2.2 AA, About/Licences, the shell / pair / list / completion / playback surfaces, chrome localization, `AC-UI-01..35` and `AC-I18N-01..08` | Designer | ✅ **Frozen** |
| **D5** | [`D5-tooling.md`](./D5-tooling.md) | Exact compiler flags, npm scripts and exit codes, dependency split, the INV-1 lint boundary, the scoped vocabulary check, engine-derived bundle assertions, four Vitest projects, the CI job (never generates), the milestone-aware AC→test map, the M4 service-worker reserve, `AC-TOOL-01..23` | Designer | ✅ **Frozen** |
| **D6** | [`D6-content-and-bake.md`](./D6-content-and-bake.md) | Authoring guide, the four files + the conversation entry module, the **entire bake pipeline** (phases 0–8, enumeration, injected `Translator`, staleness, human-edit preservation, review policy, pruning, `--conversation`, `--check`), triage/adjudication and flag-list format, coverage report, and the **10-beat English/Spanish spec**, `AC-CONTENT-01..25` | Designer | ✅ **Frozen** |
| **D7** | [`D7-architecture.md`](./D7-architecture.md) | Layer map and dependency rules, end-to-end data flow, runtime module graph, worker topology (no worker box in M1), the accurate swap checklist, build vs runtime topology, the cross-cutting invariant index, the failure topology, an Engineer reading order, `AC-ARCH-01..13` | Designer | ✅ **Frozen** |
| — | `src/domain/types.ts` | Frozen domain contracts (D2 owns) | Designer | ✅ **Frozen** |
| — | `src/engines/ports.ts` | Frozen engine ports (D3 owns) | Designer | ✅ **Frozen** |
| — | `docs/legal/clean-room-record.md` | Provenance and licensing position | Project Manager | PM's artefact |

## Locked decisions (do not re-litigate)

- **Branching:** variable-seeded linear timeline. A choice = label + response line + the variables it sets. `when` scopes a choice set to a variable value. **The timeline never forks.**
- **M1 TTS:** `speechSynthesis` behind the narrow TTS port — **zero model downloads in M1**. Supertonic arrives in M2 behind the same port.
- **M2 TTS:** Supertonic 3, `onnx-community/Supertonic-TTS-ONNX`, default device WebGPU with automatic WASM fallback, voices `M1`–`M5` / `F1`–`F5`. One voice identity per character across languages.
- **Translation:** build-time only, in Node, via `bake`. The browser ships **zero translation code and zero translation models**.
- **Stack:** Vite + Preact + TypeScript. Hand-rolled `useReducer` + context for state; no additional runtime dependency.
- **A translator is a draft tool, and the only drafter.** It drafts every line and every gloss span — a pinned MT model **or** an authored bilingual table, recorded in the artifact as `meta.translator`/`translationRev` (D2 §7.2); a separate review agent triages suspected errors; **the owner adjudicates the flag list**. `reviewedBy` is recorded per line and per gloss and CI fails on `null`.

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
| **A6** | `Option.icon` | Added as an **optional label-class, decorative, language-independent** field on `Option` (D2 §4.3) and `BuiltOption` (D2 §7.1) — *not* inside `Label`, which is a per-language pair. Literal, never MT'd, never reviewed, no glossary entry, label text must stand alone. Reuses `E_LABEL_SLOT`. D4 §7.6 owns the render rule (`aria-hidden`, never in the accessible name, never load-bearing). All ten option cards carry one. |
| **A7** | `sourceDigest` EOL | D3 §10 rule 7 cross-references the `.gitattributes eol=lf` requirement (mechanism in D5 §10, AC-TOOL-12): a CRLF checkout would make every CI run report `E_SOURCE_STALE`. |
| **A8** | `AC-UI-22` evidence split | D4 §12.1 names which requirement is checked in jsdom (structure, ARIA, focus order, names) and which in Playwright (contrast, boundaries, targets, zoom, reflow). Wording only; the id is unchanged. |
| **A9** | `tools/` is spec-only | D5 §3.1 lists the whole `tools/` tree as **Engineer deliverables in M1**. No file under `tools/` exists yet; five docs name paths inside it, which is correct division of labour and must not read as an existing tree. |

## Freeze amendments, round 2 (2026-10-18) — M1a escalations

The Engineer's M1a recon produced eight escalations and one incident. Every fix below is a correction to a frozen doc; **a frozen doc is annotated, never unfrozen** (PM ruling), so all statuses above stay ✅ Frozen.

| # | Item | Resolution |
|---|---|---|
| **X0a** | `npm run format` rewrote both frozen contracts | `.prettierignore` now lists `src/domain/types.ts` and `src/engines/ports.ts`, with the rule that **formatting a read-only file is a contract change**. D5 §10. AC-TOOL-22. |
| **X0b** | Nothing prevented a silent recurrence | `tools/contracts.sha256` + `tools/check-contracts.mjs`; `check:contracts` runs **first** in `check`; the manifest is regenerated only by `contracts:update`, never by `build`/`bake`/`test`/`format`/CI. D5 §10.1. **AC-TOOL-24.** |
| **E1** | `--review-policy` was invented, not specified | Named in D5 §3 (required in `write`, ignored in `check`, called only by `bake:fixture`) and D6 §2.2. |
| **E2** | The fixture cannot come from the author-only path | **Confirmed** the Engineer's resolution: the fixture is generated once by `bake:fixture` with the fixture translator; `--author-only` write is never run against it. D6 §2.4 replaces the contradictory row. |
| **E3** | D5 §4's "exact flag set" was unsatisfiable | `allowImportingTsExtensions` (Node type-stripping cannot resolve extensionless specifiers) and `types: ["vite/client", "node"]` added, both with rationale. AC-TOOL-06 reworded. D5 §4, §7.5. |
| **E4** | No code for a fixture claiming `owner` | **No new code** (the registry stays at 49). `E_UNREVIEWED` covers it with a distinct message; D2 §7.2 and the §14 registry row say so. |
| **E5** | `BuiltOption.slotNames` was ambiguous | **Template-read scope only.** D2 §7.1's "INCLUDING self-set" was wrong and is corrected, with the two concepts separated. **AC-DOM-24.** |
| **E6** | "One step for every beat" was only true of session projections | Scoped: one step per **(beat, live path)**. Fixture: 10 per session mode, **77** exhaustive, 16 terminals. AC-DOM-14 extended and forbidden from asserting a total. ⚠ **Reported as 65; measured as 77** — flagged, not reconciled. |
| **E7** | Pinned revisions missing | Both SHAs recorded in D3 §10.2, pinned as of 2026-10-18, with the rule that a bump is a deliberate act. AC-CONTENT-23. |
| **E8** | `AC-DOM-21` spans two projects | **Confirmed legitimate.** An AC may map to more than one test file; the criterion is about coverage of a code set. D5 §7.4, AC-DOM-21. |
| **J1–J8** | Eight Engineer judgment calls | **All eight ratified** (`.prettierignore` + report, `.nvmrc` 22, `types: ["node"]` + architecture test, fixture identity glosses + `GLOSS-IDENTITY`, `www.w3.org` narrow allow-list, case-sensitive vocabulary check, `reduceChecked` five + `validateSession` one, empty `registry.browser.ts`). Rationale in D5 §2/§6.1/§6.3/§7.5 and D6 §2.4. |

**New ids this round:** `AC-TOOL-24`, `AC-DOM-24`, `AC-CONTENT-23`, `AC-CONTENT-24`, `AC-CONTENT-25`. Diagnostics unchanged at **49**.

## Freeze amendments, round 3 (2026-10-18) — shipping provenance, and four doc/code reconciliations

The Editorial agent's M2-recon found that the docs assumed MT was the only possible source of `l2`, and that four specs described behaviour the code does not implement. Every fix is an annotation to a frozen doc; **statuses stay ✅ Frozen** and no AC id is renumbered.

| # | Item | Resolution |
|---|---|---|
| **Y1** | A shipping artifact had only one honest provenance | **Amended: two.** A shipping artifact's `translationRev`/`meta.translator` must be a **pinned, recorded, internally consistent** revision id — a **model SHA** (D3 §10.2) **or** an **authored-table revision** named `authored-<n>`, visibly distinct from a model. The `Translator` is an **injected port**; the M1 fixture translator is already an authored lookup table; recording a model SHA for text a model never produced is exactly the false provenance `reviewedBy` exists to prevent. D2 §7.2, D3 §10.2, D6 §2.4; AC-CONTENT-23, AC-ENG-19, AC-CONTENT-25. |
| **Y2** | D6 §2.1 / amendment F1 are stale | `src/data/conversation.ts` now imports every generated artifact and exports `CONVERSATIONS: Conversation[]`; `src/data/catalog.ts` derives the entries from it. It remains the **sole** importer of `conversations/*.json` (which is what AC-CONTENT-22 requires). The M2 swap is **one array entry added plus the fixture's deleted**, not "one import path plus one deletion". D6 §2, §2.1, §14; D7 §2; AC-CONTENT-22. |
| **Y3** | The hint check is weaker than D6 §11.5 rule 4 | **Stated, not fixed.** `checkHints` tokenizes the **raw authored template** (the literal `{slotName}` is a token), not the rendered line, so a hint that echoes a substituted surface form can pass. Rule 4's intent — the rendered comparison — is recorded with the limitation, the worked example, and the additive fix. D6 §11.5 rule 4, §12; AC-CONTENT-16. |
| **Y4** | D6 §9 specified report rows that cannot exist | `renderReport(conversation)` is a pure function of the artifact and takes **no flag list**, so "flags by category and severity" and "flag rate vs the ~20% target" **cannot** appear in it, nor can a session count or a coverage percentage. §9 now lists what the report emits and explicitly excludes those four; the flag figures belong to the flag list. D6 §9; AC-CONTENT-11. |
| **Y5** | `E_MULTIPLE_FALLBACK`/`E_FALLBACK_NOT_LAST` are `line`-only | **Doc narrowed to the code.** `validateConversationSource` inspects only `beat.line`; for `choiceSets` two `when`-less sets are caught by `E_AMBIGUOUS_MATCH` and a misplaced fallback set is not flagged (recorded gap; matching does not depend on order). D2 §5.2, §14; AC-DOM-04. |
| **Y6** | `GLOSS-IDENTITY` fires on `origin: 'mt'` only | **Stated.** The only authored-gloss route is the **global** `glossary.es.json`, so the exemption is not a per-conversation escape hatch; in practice every shipping gloss is `origin: 'mt'` and must be genuinely non-identity. D6 §2.4, §12. |
| **Y7** | What `reviewedBy: 'agent'` may claim | **Stated.** The approximation available is a **fresh context that reads only the output** — the *same underlying model*, so it is **not** independent in the strong sense. No shipping flag list unless a triage actually ran; a fabricated flag list is worse than none. `FLAG-REVIEWER-IS-DRAFTER` enforces the naming discipline, not true independence. D6 §8.1, §8.3. |

**AC totals unchanged at 151; diagnostics unchanged at 49.** No id added, renumbered or retired.

## Freeze amendments, round 4 (2026-10-18) — translator framing, and one signed-off contract comment

Round 3 fixed the *provenance* rules for two translation sources, but the framing that "MT drafts every line" survived in four places and under-described an authored shipping run. Documentation only, plus one PM-signed-off contract comment.

| # | Item | Resolution |
|---|---|---|
| **Y8** | "MT drafts every line" framing survived round 3 | **Generalised to the translator** — a pinned model **or** an authored bilingual table — in the four places that asserted MT as the only mechanism: the README locked-decision bullet, D2 §9.4, D3 §10 (README divergence), and D6 §8.1/§11. The properties that matter are kept and unchanged: every line and every gloss span is drafted by whatever translator ran; the drafting source is recorded in the artifact; the reviewer must not be the drafting system; the owner adjudicates. **D6 §8.1 now states plainly that reviewer ≠ drafter is automatic for a model but *not* for an authored table drafted by an agent** — which is exactly why the fresh context is required. D6 §11 no longer implies it is the only authored Spanish in the repo. |
| **Y9** | `types.ts`'s `translationRev` comment was narrower than D2 §7.2 | **PM-signed-off contract edit, comment only.** The field now documents both kinds (a model revision, or an authored-table revision named `authored-<n>`). `src/domain/types.ts` is hash-pinned by `tools/contracts.sha256`, so **`check:contracts` fails until the PM runs `contracts:update`** — the manifest is regenerated by the owner, never by this amendment. |

**AC totals unchanged at 151; diagnostics unchanged at 49.** No id added, renumbered or retired.

## Freeze amendments (2026-10-18, gate defects found by the Engineer's M1 recon)

Applied after the first freeze attempt. These are corrections, not redesigns; no AC id was renumbered.

| # | Item | Resolution |
|---|---|---|
| **A10** | `src/engines/ports.ts` missing | **Authored and frozen.** D3's one owned artefact now exists; an Engineer-authored port is not a contract. Both contract files compile clean under D5 §4's exact flags. |
| **A11** | The freeze was never recorded | `types.ts` header flipped to ✅ FROZEN; every D2–D7 status and both contract files set to ✅ Frozen above. |
| **B1** | Diagnostic count | **49**, not 48. The `DiagnosticCode` union and the D2 §14 table are identical 49-element sets (verified bidirectionally). The wrong figure appears only in D1 (lines 142, 172). |
| **B2** | `E_SENTINEL_IGNORED` | D2 §14 is right to exclude it. D6 §12 now declares a D6-local `BakeDiagnosticCode` covering it plus `FLAG-*` and `HINT-*`. |
| **C1** | `resolveVoice` | Now `(characterId, voiceId, lang)`; overrides passed at construction. D3 §3.1.1. AC-ENG-22. |
| **C2** | `reduce` diagnostics | `reduce` returns the session unchanged; `reduceChecked` (in `validate.ts`) returns the six dev diagnostics; `validateSession` covers `E_STALE_CHOICE` only. D2 §10. |
| **C3** | `WalkStep` and `unreached` | `status` replaces `pending: boolean`; `alternativeId` is optional; the walk emits **one step per beat**. D2 §5.1, §11.1. AC-DOM-14. |
| **C4** | `advance` / `initialSession` | `advance` sets `revealed = max(revealed, next)`; the initial session is fully specified. D2 §10. AC-DOM-16, **AC-DOM-23**. |
| **C5** | `visibility` | Takes `Preferences` only. D2 §12. AC-DOM-19. |
| **C6** | `Option.hint` | Removed. D2 §4.3. |
| **C7** | `segmentL2(text, lang)` | `lang` selects the tables: all four levels for `l2`, `line` + `sentence` for any other language. D2 §9.1. |
| **C8** | `Utterance.key` | Algorithm-prefixed; `fnv1a64` documented fallback for a non-secure context. The `file://` smoke claim is retired (ES modules do not load from `file://`). D3 §7.7, D5 §5. |
| **C9** | Registry leak | **Two registry files**: `src/engines/registry.browser.ts` (empty in M1) and `tools/bake/registry.build.ts`. D3 §11.1, D7 §2. |
| **C10** | Stale counts | D2 §5.5 refreshed to match D6 (28 records); `AC-DOM-09` parameterised. |
| **D1** | `who` self-read | AC-DOM-05 and AC-CONTENT-15 now require deleting **every** read. |
| **D2** | AC-CONTENT-19 | Three attention-list rows added (`false-friend`, `scope`, `other`); all twelve categories now covered. |
| **D3** | AC-CONTENT-16 | Mechanised (length, slots, no double quotes, ≥4-token overlap) with the paraphrase half marked review-only. |
| **D4** | AC-ARCH milestones | **All thirteen `AC-ARCH-*` ids are M1.** See the note below. |
| **D5** | Vitest project assignment | `AC-DOM-10/11/12` move to the `bake` project; `AC-TOOL-*` live in `bake` under `test/tools/**`; still exactly four projects. |
| **E1** | `check:ac-map` unpassable | `tools/ac-map.json` carries a per-id milestone and a `currentMilestone`; only due ids need a mapped test. **No `describe.skip` placeholders.** |
| **E2** | `bake:check` had nothing to check | `--conversation <path>` added; M1 points at the fixture. |
| **E3** | `format:check` vs frozen docs | `.prettierignore` covers `docs/**`, `dist/**`, `test-artifacts/**`, `node_modules/**`, `package-lock.json`, `src/data/**/*.json`. |
| **E4** | Licences vs `check:bundle` | In M1 the Licences surface names **licences by purpose**, not models or repos; the bundle check's forbidden list is engine-derived. D4 §13, D5 §6.3. |
| **E5** | No home for `AC-TOOL-*` | The `bake` project hosts `test/tools/**`. D5 §7. |
| **E6** | `tools/test-runner/` unowned | Added as an M1 deliverable. D5 §3.1. |
| **E7** | `tests/` vs `test/` | D7 §2 corrected to `test/`. |
| **F1** | The fixture ships | `src/data/conversation.ts` is the single entry module; the fixture is bundled and is never the *shipping* content. D6 §2.1. **Restated by Y2** (§2.1 is now a `CONVERSATIONS` array; the swap is one array entry, not one import path). |
| **F2** | Fixture provenance | `meta.reviewPolicy: 'fixture'` + `reviewedBy: 'agent'` + `l2 === mt`; `'owner'` is an error in a fixture. D2 §7.2, D6 §2.2. |
| **F3** | `onnxruntime-node` on Node 26 | The runtime is imported lazily inside the injected port, typed against a local shim, and **not installed in M1**. D3 §10.8, D5 §2. |

### Note on the `AC-ARCH-*` milestone question

D1 §7 assigned `AC-ARCH-*` to M4. **All thirteen are M1**, because each describes a property of the M1 codebase: the import graph, the two registry files, the absence of a worker, the single engine constructor, the single `segmentL2`, the Scheduler's exclusivity, the swap checklist (proved by a stub-engine build), the absent `prebuild` hook, the invariant index, the failure topology, the no-translator-path assertion, D7's internal consistency, and the single conversation import.

`AC-ARCH-07` is the one that is arguable: its *subject* is the M2 swap, but the test that proves it runs in M1 against a stub engine id, so it protects the M1 architecture and belongs at M1. **No AC currently describes an M4 deliverable** — the service-worker reserve is deliberately a seam rather than work (D5 §11), and it should get an AC when M4 is specified.
| **A3** | Registry legibility | Every diagnostic code is spelled out in full in D2 §14, one row each, so D5's CI can grep them literally. |
| **A4** | Licenses | Supertonic weights **OpenRAIL-M** (use restrictions must be surfaced as restrictions), code **MIT**. OPUS-MT **Apache-2.0** — **no attribution line required**. |
| **—** | Frozen contracts | Two files: `src/domain/types.ts` (D2) and `src/engines/ports.ts` (D3). `ports.ts` is not a domain file. |

## Scope discipline

If it is not in D1's MVP IN list, it is not in the milestone. New ideas go to the backlog, not into these docs. Acceptance criteria live with the doc that owns the behaviour and carry stable `AC-*` ids; D1 indexes them, and no criterion is restated in two places.

## Evidence convention

`tools/test-runner/` produces `test-artifacts/` (`result.json`, `test.log`, numbered artifacts). D5 owns the mapping from `AC-*` ids to executable checks.
