# You Don't Say — Content and Bake (D6)

> **Status:** 🟡 Draft — pending owner review
> **Owner:** Designer · **Reviewer:** Project Manager
> **Purpose:** The authoring contract. The four content files, the complete build-time bake pipeline, the staleness and human-edit rules, the delegated review/triage workflow with its flag-list format, the coverage report, and the 10-beat English/Spanish spec.
> **Depends on:** D2 (schemas, the walk, variant/gloss records, the diagnostic registry, `segmentL2`) · D3 (the `Translator` port and its model facts)
> **Owns:** the bake pipeline **including the `Translator` port as consumed**, its CLI, the triage workflow and flag-list format, the coverage report, the 10-beat spec, `FLAG-*` codes, `AC-CONTENT-*`
> **Related:** D4 (nothing here is user-visible; the artifact feeds it) · D5 (script names, CI defaults, the assertions this doc depends on) · D7 (bake as a separate Node program in the data-flow map)

**Precedence.** Locked decisions > `docs/design/D2`–`D7` > `README.md`. Deliberate disagreements carry a **⚠ DIVERGES FROM README** marker.

**Ownership line (PM Flag A).** `D3` owns the `Translator` **port** and the model/revision/precision facts. **This doc owns the pipeline, including how the port is consumed.** D3 §10 defines `translate({ text, from, to })` and states that the port prepends `>>es<<` internally; **no call site in this pipeline constructs a model prompt or model-specific string.** If this doc and D3 §10 appear to differ, D3 §10 wins on the port shape and this doc wins on the call sequence.

**One walk rule (D2 §5.1).** This pipeline consumes `reachableVariants` — the **exhaustive projection of the single timeline walk**. It does not implement enumeration, `when` matching, read scopes or variant keys. Those are D2's, and the browser runs the same code.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| The four files and the edit rules for each | Schema semantics → D2 |
| The pipeline phases 0–8, `write` vs `check`, pruning | The `Translator` port shape, model ids, revisions, the `>>es<<` fact → D3 |
| Staleness, human-edit preservation, revision handling | Any UI, any user-visible string |
| The triage → adjudication → provenance workflow and the flag-list format | `npm` script names and CI wiring → D5 |
| The coverage report and the visibility-weighted gloss ranking | Bundle assertions → D5 |
| The 10-beat English/Spanish spec and the review checklist | Final **reviewed** Spanish prose (the owner produces it, through adjudication) |

---

## 2. The four files

Approved exactly as laid out in PM ruling Q4. Paths are normative.

| File | Authored by | Machine-written | In git | Contents |
|---|---|---|---|---|
| `src/data/conversations/ron-bobby-01.source.json` | **human** | never | yes | `ConversationSource` — English only, templates allowed |
| `src/data/glossary.es.json` | **human** | never | yes | Authored gloss overrides, keyed by `normalizeSpan(text)` |
| `src/data/conversations/ron-bobby-01.json` | machine, then possibly human | yes | yes | `Conversation` — slot-free runtime artifact |
| `src/data/conversations/ron-bobby-01.glossary.json` | machine | yes | yes | `GlossIndex` |
| `review/flags.ron-bobby-01.json` | review agent, then adjudicated by the owner | — | yes | The flag list (§8). A real artifact, because review is delegated. |
| `review/report.ron-bobby-01.md` | machine | yes | yes | Coverage report (§9). Regenerated, never hand-edited. |

Edit rules (D2 §3, restated as instructions because this is the doc an author reads):

1. **Never hand-edit `ron-bobby-01.glossary.json`.** Gloss corrections go in `glossary.es.json`.
2. `ron-bobby-01.json` **may** be hand-edited, but only the `l2` field of a variant record. Nothing else. A hand-edited `l2` is detected, not declared (§7.2).
3. The `.source.json` is the only place templates, hints, labels and variables live.
4. No timestamps in any generated file.
5. `review/flags.*.json` is edited only to adjudicate (§8.4).

### 2.1 Where the code lives

| Piece | Path | Why |
|---|---|---|
| The bake program | `tools/bake/**` | A **separate Node program**. Matches the sibling repo's `tools/` convention. Never reachable from `index.html`. |
| The Node `Translator` implementation | `tools/bake/translator.node.ts` | It imports `@huggingface/transformers`; keeping it out of `src/` is what makes R11 checkable rather than aspirational. |
| Engine port **types** | `src/engines/ports.ts` | Types only, no runtime imports (D3 owns). |
| The asset registry | `src/engines/registry.ts` | Plain data. Consumed by the browser for TTS entries and by bake for MT entries; importing it is safe and cheap. |

⚠ This requires a **second small D2 amendment** (see §12): D2 §13's boundary list originally named `src/engines/**/bake/**`, a path this doc does not use. The boundary now lives in `tools/scan-excludes.json` (D5 §6), and the bake program is in `tools/**`. The lint boundary D5 implements has to match where the code actually is, or it will pass while the property it guards is false.

---

## 3. Two axes, and the CLI surface

The pipeline has exactly two axes, and conflating them is the main way to get confused about `--author-only`:

| Axis | Values | Meaning |
|---|---|---|
| **mode** | `write` \| `check` | `write` may modify the artifact. **`check` never writes anything** and is the only mode CI runs. |
| **translator** | provided \| **absent** (`--author-only`) | Whether machine drafting is available in this run. |

```bash
bake                       # write + translator (dev machine, full drafting)
bake --check               # verify only; needs no translator at all
bake --check --author-only # CI default (PM ruling): verify structure, hashes, provenance, coverage, revisions. Zero network.
bake --author-only         # write + no drafting: author by hand; MT fields stay empty
bake --prune               # write: remove orphaned variant/gloss records
bake --report              # write review/report.<id>.md
bake --adjudicate review/flags.<id>.json   # apply an adjudicated flag list (§8.4)
```

**`--check --author-only` is the CI default and the reason the pipeline is testable.** It validates a committed artifact offline, against pinned revisions recorded *in* the artifact, with no model downloads. `check` + a translator present is allowed and additionally verifies that fresh MT output still matches (it reports `E_SOURCE_STALE`/`E_TRANSLATOR_REV_STALE` rather than writing).

**`--author-only` in `write` mode is not a way to produce a shippable conversation from scratch.** It cannot fill ~200 gloss spans, so coverage will fail. Its purposes are CI verification and hand-authoring a line or two before a full bake. This is why the PM's ruling that author-only is the CI default is coherent: its job is *verification*, not generation.

---

## 4. Pipeline phases

Each phase is a pure function over the previous phase's output, so any phase can be tested alone. Phase 0 is the only one that needs a model.

| # | Phase | Input | Output | Fails with |
|---|---|---|---|---|
| 0 | **Model smoke test** (skipped when the translator is absent) | the `Translator` | proof that `>>es<<` is honoured (§4.1) | abort before any drafting |
| 1 | **Validate source** | `.source.json` | `Diagnostic[]` | any `E_*` error from D2 §14 |
| 2 | **Enumerate** | source | `WalkStep[]` (exhaustive, D2 §5.1) + the variant spec set | `E_NO_MATCH`, `E_AMBIGUOUS_MATCH`, `E_DEAD_ALTERNATIVE`, `E_ENUM_LIMIT_*` |
| 3 | **Render English** | variant specs | one `l1` per variant spec; `sourceHash` per `l1` | `E_VARIANT_KEY_COLLISION` (§5.3) |
| 4 | **Draft L2** | `l1` strings + `Translator` | `mt` per variant; `translationRev` | translator errors are fatal, never silently skipped |
| 5 | **Segment** | each variant's `l2` | the distinct span key set, all levels (D2 §9) | `SEGMENTATION_VERSION` mismatch |
| 6 | **Draft glosses** | span keys + `Translator` (ROMANCE-en) | `mt` per `GlossEntry` | as phase 4 |
| 7 | **Merge, stamp, assemble** | everything above + `glossary.es.json` + the flag list | `Conversation` + `GlossIndex` + edits to the flag list only if adjudicating | `E_UNREVIEWED`, `E_EDITED_NOT_OWNER`, `E_GLOSS_*`, `E_L2_RESERVED_CHAR` |
| 8 | **Report** | the assembled artifact | `review/report.<id>.md` + exit code | `E_*` from the `check` pass |

Phase ordering is load-bearing: **glosses are generated from the drafted `l2`, not from the English.** A gloss is a rendering *of a piece of the Spanish*, because that is what the learner is hovering.

### 4.1 Phase 0 — the sentinel smoke test

D3 §10.3 owns the fact; this is where it runs. `opus-mt-en-ROMANCE` selects its target with a sentence-initial `>>es<<` token. If the sentinel is ignored, the model returns Portuguese for a Spanish page and **nothing errors**. So before any drafting:

```
assert translate({ text: 'Do you want to get together tomorrow?', from: 'en', to: 'es' })
    !== translate({ text: 'Do you want to get together tomorrow?', from: 'en', to: 'pt' })
```

A failure aborts the run with `E_SENTINEL_IGNORED` (**proposed D2 registry addition**, see §12) and no artifact is touched.

### 4.2 Translator injection (R6 — the testability contract)

```ts
type BakeInput = {
  source: ConversationSource;
  prior?: Conversation;                       // the committed artifact, if any
  translator: { en2romance: Translator; romance2en: Translator } | null;
  mode: 'write' | 'check';
  prune?: boolean;
  adjudication?: AdjudicatedFlagList;
};

type BakeResult = { conversation: Conversation; gloss: GlossIndex; diagnostics: Diagnostic[] };
```

The translator is a **parameter, never a module-level import**. Tests pass a fake — a deterministic lookup table plus a recorded "mangled" output for each fixture string — and the whole pipeline runs with zero network, zero downloads and byte-stable output. This is the single most important decision for the Engineer's self-verification (PM R6), which is why it is a frozen port rather than an internal helper.

The fake must be able to produce **wrong** output on demand, so the triage path is testable: a fake whose Spanish is deliberately Portuguese for one fixture must produce a flaggable entry, not a crash.

---

## 5. Enumeration and emission

### 5.1 What is enumerated

For every variant spec from D2's exhaustive walk (§D2 5.1), the pipeline emits exactly one `VariantRecord`:

- one per **fixed-beat alternative** × each distinct tuple of values for that alternative's `slotNames`;
- one per **option** × each distinct tuple of values for that option's `slotNames` (which include the option's own `sets`, D2 §5.1).

Ghosts and previews need no extra records: an option's variant **is** the line used for the chosen response, the ghosted road not taken, and the preview (D2 §11.2).

### 5.2 Emission rules

| Rule | Detail |
|---|---|
| Slot-free output | Nothing written to `lines` or `gloss` contains `{`, `}` or `${` (D2 INV-3). |
| Labels never MT'd | `BuiltOption.label` is copied from the source verbatim. Labels appear in neither `lines` nor `gloss`. |
| Hints never MT'd | `BuiltBeat.hint` is copied verbatim (L1 only). |
| One record per (variant spec) | No record is shared between two different options, even when the rendered text coincides. |
| Idempotence | A second `bake` with unchanged inputs produces **zero diff**. This is checked in CI. |

### 5.3 Variant-key injectivity — the defect this doc found, and the amendment that fixed it

D2 §5.3's original composition was `beatId + '|' + slotNames.sort().map(n => n + '=' + value).join('|')`. **That is not injective when an option's read scope is empty.** Two options in one beat that read nothing both produced `"b6|"`, and because `lines` is `Record<variantKey, VariantRecord>` (D2 §7.1), one record **silently overwrote the other**. Silent data loss in a build artifact is the worst failure mode available here.

Minimal counterexample, from this doc's own content before I adjusted it: `b6` with an option template like `"No rush at all, later suits me better."` reads no slots, so both its options keyed to `"b6|"`.

**Amendment — approved and applied** (D2 §5.3, rule 1):

```
variantKey = [beatId, parentId, ...slotNames.sort().map(n => `${n}=${assignment[n]}`)].join('|')

parentId = Line.id        for a fixed-beat alternative
parentId = Option.key     for an option
```

Examples: `"b1|b1-l1"`, `"b3|b3-l1|spot=dinner-plan"`, `"b5|b5-l1|cuisine=chinese"`, `"b8|friends|who=friends"`.

This makes the key **injective by construction** — `Line.id` is unique in the conversation and `Option.key` is unique within its beat (D2 §4.3) — and it also removes the cosmetic trailing `|` produced when the read scope is empty. `VariantKeyOf` in `src/domain/types.ts` now takes the `parentId`.

**The amendment was admissible only because nothing had been baked yet.** No variant key or gloss key derived from one had been persisted, so the key space could change for free. That window is now closed: the formula is frozen for the life of the schema, and any future change is a rebake plus a full re-review.

**`E_VARIANT_KEY_COLLISION` remains a permanent guard, not a temporary one.** The amendment prevents two *different* alternatives from colliding; it does not prove the walk cannot emit the same key twice, and a build step that writes bytes must never trust that. Defence in depth costs one check.

---

## 6. `write` vs `check`

| | `check` | `write` |
|---|---|---|
| Validates phases 1–3 and 5–8 (and 4 when a translator is present, to compare rather than to write) | yes | yes |
| Writes the artifact | **never** | yes |
| Requires a translator | no | only to fill `mt` |
| Reports staleness | `E_SOURCE_STALE`, `E_TRANSLATOR_REV_STALE` | writes the fix, *then* reports what it changed |
| Exit code | non-zero on any `error` diagnostic | non-zero only on a hard failure |

`check` writing nothing is asserted by comparing the working tree before and after (AC-CONTENT-02).

---

## 7. Staleness and human-edit preservation

### 7.1 The three stored fields and the one derived flag

Per D2 §7.2: `l1` is the source of truth; `sourceHash` is the hash of the rendered `l1`; `mt` is the last machine output for `l1`; `l2` is the shipped Spanish. `edited = l2 !== mt` is **derived and never stored** (R4), so no author ever has to remember a flag.

`mt` is **immutable once written**. This is what makes `edited` permanent: a byte that a human chose can never later be mistaken for machine output, even if a regenerated translation would happen to coincide with it.

### 7.2 The rules table

| Situation | `write` does | `check` reports |
|---|---|---|
| `l1` unchanged, `l2 === mt` | nothing | clean |
| `l1` unchanged, `l2 !== mt` (human edit) | **nothing.** The edit is preserved forever. | clean, `edited: true` in the report |
| `l1` changed, `l2 === mt` | re-drafts `mt` from the new `l1`, sets `l2 = mt`, updates `sourceHash`, sets `reviewedBy: 'agent'`, `translationRev` = pinned | `E_SOURCE_STALE` |
| `l1` changed, `l2 !== mt` (edited **and** stale) | keeps `l2` **and** keeps `mt`, updates `sourceHash`, **clears `reviewedBy` to `null` and `triageRef`** | `E_SOURCE_STALE` + `E_UNREVIEWED` |
| `mt === ''` (never drafted) and a translator is available | drafts it | `E_SOURCE_STALE` if `sourceHash` differs, else clean |
| revision in the record ≠ the pinned revision | re-drafts, updates `translationRev` | `E_TRANSLATOR_REV_STALE` |
| a record is unreachable | reported; removed only with `--prune` | `E_ORPHAN_VARIANT` (warn) |
| a gloss key has no entry | cannot synthesise it without a translator; reported | `E_GLOSS_MISSING` (error) |

Three judgement calls inside that table, each deliberate:

1. **Write mode clears the review stamp when the English changed** (row 4). The Spanish a human approved was a translation of *different English*. Leaving the stamp would assert a review that did not happen. Clearing it makes the review debt show up in the diff, which is the point. The text is never touched.
2. **An edited record's `mt` is never overwritten** (rows 2 and 4). If a regenerated translation were allowed to replace `mt`, then `l2 !== mt` could become `l2 === mt` by coincidence and a human's choice would silently reclassify as machine output. Immutability prevents that.
3. **`mt === ''` is the sentinel for "no machine translation exists"** and pairs with `translationRev === null`. D2 §7.2 fixes `mt: string` and `translationRev: string | null`, so `''` is the consistent encoding rather than a type change. The invariant `(mt === '') === (translationRev === null)` is asserted everywhere (AC-ENG-19) and is what makes `E_TRANSLATOR_REV_STALE` well-defined in author-only mode:

   | record `translationRev` | meta `translator.en2romance` | Result |
   |---|---|---|
   | `null` | `null` | **clean** — an author-only artifact, no error (this is the PM's explicit requirement) |
   | set | set, equal | clean |
   | set | set, different | `E_TRANSLATOR_REV_STALE` |
   | **exactly one `null`** | | `E_TRANSLATOR_REV_STALE` with a distinct message ("artifact mixes translation provenance; rerun `bake`") |

   The asymmetric case is a corrupt or half-written artifact, not a valid state, and it must not be reported as a model problem.

### 7.3 Revision pinning (R3)

Revisions are **pinned commits**, never branches, and are recorded in `Conversation.meta.translator`. A moving model makes every build look stale, and — worse — lets the Spanish change without anyone editing anything. `E_TRANSLATOR_REV_STALE` is its own code precisely so model churn is never confused with authoring churn.

---

## 8. The review pipeline: draft → triage → adjudicate

### 8.1 Why it is a pipeline and not a checkbox

MT drafts; a separate agent triages suspected errors; the owner adjudicates. The distinction that must survive forever is **which text a human actually read**, so it is a first-class field (`reviewedBy`) and not a comment (PM ruling Q1).

| Stage | Who | Output | Stamp |
|---|---|---|---|
| Draft | MT | `mt` for every line and every gloss span | — |
| Triage | **review agent** | a flag list of *suspected errors only*, target ~20% of targets | unflagged entries → `reviewedBy: 'agent'` |
| Adjudicate | **owner** | each open flag becomes `accepted` / `rejected` / `deferred` | `accepted`/`rejected` → `reviewedBy: 'owner'` + `triageRef`; `deferred` → `reviewedBy: null` (debt stays visible) |
| Gate | CI | `E_UNREVIEWED` on any `null` | — |

**The reviewer must not be the system that produced `mt`.** With MT drafting, that is automatic. If drafting is ever changed to an LLM, the reviewer must be a different model in a **fresh context** — a model reviewing its own output is theatre, and the PM's ruling says so explicitly. The flag list records the reviewer's identity so this is auditable (§8.3).

Triage targets **suspected errors only**, not a rubric walk. An agent that flags 200 of 200 entries has produced a second draft, not a triage. The ~20% target and the flag rate are reported (§9) so over- and under-flagging are both visible.

### 8.2 What the agent is given, and what it must not be given

Given: the `l1`, the `l2`, the variant key, the substitution context (which surface form was inserted), the gloss span and its `l1`, the attention list in §11.6, and the `category` enum.

Not given, and not allowed to use: the browser, the UI, learner data, or the ability to draft. The agent flags; it does not rewrite. A `suggestion` is a suggestion.

### 8.3 Flag-list format (normative)

`review/flags.<conversationId>.json`. Structured and adjudicable, because review is delegated and the audit trail is the whole point.

```jsonc
{
  "conversationId": "ron-bobby-01",
  "sourceDigest": "sha256:v1:…",        // must equal meta.sourceDigest, else FLAG-STALE
  "translatorRev": "…",                 // the drafting revision these flags describe
  "reviewer": {
    "kind": "agent",                    // 'agent' | 'owner'
    "model": "…",                       // must differ from the drafting system
    "contextId": "…",                   // fresh-context evidence
    "ranAt": "…"                        // flags are a working artifact; a timestamp is allowed here
  },
  "targets": { "lines": 28, "glosses": 214 },
  "flags": [
    {
      "id": "F001",
      "target": "line",                                  // 'line' | 'gloss'
      "ref": "b8|friends|who=friends",                   // variant key, or normalizeSpan(span text)
      "en": "Perfect. I'll invite the whole crew.",
      "l2": "…",
      "severity": "high",                                // 'high' | 'medium' | 'low'
      "category": "idiom",
      "reason": "…",                                     // why it is suspect, one sentence
      "suggestion": "…",                                 // optional proposed correction
      "status": "open"                                   // 'open' | 'accepted' | 'rejected' | 'deferred'
    }
  ]
}
```

`category` enum (closed, and it maps to §11.6's attention list so flags are triageable):

`agreement` · `article` · `register` · `idiom` · `subjunctive` · `punctuation` · `false-friend` · `omission` · `addition` · `name` · `scope` · `other`

`scope` is for glosses whose rendering describes the whole clause rather than the hovered span — the failure mode `README §Translation` names.

### 8.4 Adjudication

The owner edits `status` on each flag — and, for an `accepted` flag, optionally supplies the final text in a `correction` field. Then:

```bash
bake --adjudicate review/flags.ron-bobby-01.json
```

- `accepted` **with** `correction` → `l2` is replaced, `reviewedBy: 'owner'`, `triageRef: <id>`. Because `mt` is immutable, the record becomes `edited` forever — correct, a human chose those bytes.
- `accepted` **without** `correction` → the owner read it and left it; `reviewedBy: 'owner'`, `triageRef: <id>`.
- `rejected` → the owner read it and disagrees; `reviewedBy: 'owner'`, `triageRef: <id>`.
- `deferred` → `reviewedBy` stays `null`, `triageRef: <id>`. **CI keeps failing.** There is no way to ship an unreviewed line, and "defer" is not a way to sneak one past the gate. If the owner wants to accept-as-is, that is `accepted` without a correction.

Provenance invariants (asserted):

1. Every `null`-stamped entry is an error (D2 `E_UNREVIEWED`).
2. Every `triageRef` resolves to a flag id whose `status` is `accepted` or `rejected`.
3. Every flag with those statuses has a corresponding `triageRef` on its target.
4. `edited === true` ⇒ `reviewedBy === 'owner'` (D2 `E_EDITED_NOT_OWNER`).
5. A flag list whose `sourceDigest` no longer matches is `FLAG-STALE` and must be regenerated — flags describe a specific revision of the English.

D6-local codes (these are **not** D2 `E_*` diagnostics; the flag list is D6's artifact):

| Code | Severity | Meaning |
|---|---|---|
| `FLAG-STALE` | error | `sourceDigest` ≠ `meta.sourceDigest`: regenerate the triage |
| `FLAG-REF-UNKNOWN` | error | a `ref` matches no variant key and no gloss key |
| `FLAG-DUP-REF` | error | two flags for the same `ref` |
| `FLAG-UNKNOWN-CATEGORY` | error | `category` outside the closed enum |
| `FLAG-REVIEWER-IS-DRAFTER` | error | the reviewer's `model` equals the drafting system's |
| `FLAG-OPEN` | warn | an `open` flag remains; the run reports but does not fail |

---

## 9. Coverage report and the visibility-weighted ranking

`bake --report` writes `review/report.ron-bobby-01.md`. It is the owner's working surface and the project's most honest status page.

| Section | Contents |
|---|---|
| Counts | beats, choice beats, decisions, sessions (`2^decisions`), `lines` records, orphaned records |
| Per beat | alternative/option count and the number of distinct variant keys, so an expensive beat is visible |
| Glosses | distinct span keys total, by level; entries by `origin`; coverage % |
| Review status | `agent` / `owner` / `null` counts **separately for lines and glosses**; flags by category and severity; **flag rate vs the ~20% target** |
| Review debt | every `null` entry with its `triageRef`, unfiltered — the queue |
| **Gloss priority** | the top 20 span keys ranked by **how many variants contain that span** |

**The gloss priority ranking is the feature that makes delegated review tractable.** ~200 spans is too many to triage evenly and too few to skip; ranking by variant coverage puts the owner's attention on the spans a learner is most likely to hover, because a span appearing in 8 of 28 lines is encountered 8 times more often than a span appearing once. The report gives that ordering for free, from data the pipeline already has.

It also keeps the review budget visible: **28 dialogue records and ~200 distinct gloss keys** (R12). That is small enough that mandatory review is affordable, and printing it is what keeps it affordable rather than assumed. The exact gloss count is an estimate until the first full bake; the report prints the real number, and if it is materially above ~250 the spine of a gloss needs rethinking rather than more review.

---

## 10. Testability (R6)

| Test | Asserts |
|---|---|
| Fake translator, `write` | byte-stable artifact from fixtures; run twice → **no diff** (AC-CONTENT-03) |
| Fake translator, `check` | writes nothing; identical input → identical diagnostics (AC-CONTENT-02) |
| Wrong-on-purpose fake | a deliberately Portuguese fixture produces a **flaggable** entry, not a crash (§4.2) |
| Network guard | any fetch during a `--author-only` run fails the test (AC-CONTENT-13) |
| Enumerated counts | 28 line records for the shipped conversation, and the per-beat counts match §11.4 (AC-CONTENT-04) |
| Collision | two forced identical variant keys → `E_VARIANT_KEY_COLLISION`, never an overwrite (AC-CONTENT-05) |
| Edit preservation | hand-edit an `l2`, re-bake, assert `l2` and `mt` unchanged and `edited === true` (AC-CONTENT-06) |
| Staleness | change one English template; assert exactly the affected records are flagged, and that write mode clears their stamps without touching text (AC-CONTENT-07) |
| Revision | a record/meta revision mismatch → `E_TRANSLATOR_REV_STALE`; both-null → clean (AC-CONTENT-08) |
| Author-only | the whole pipeline completes with zero model downloads and zero network (AC-CONTENT-13) |
| Spec validation | §11's spec, materialised as a source file, validates with zero `error` diagnostics (AC-CONTENT-14) |

---

## 11. The 10-beat English/Spanish spec

**Normative content of this doc.** It specifies the English source and the structure. It does **not** author final reviewed Spanish prose: `l2` is produced by MT drafting plus adjudication (§8). The only Spanish authored here is the option **labels**, which are UI chrome and never MT'd (D2 §4.3).

### 11.1 Variables

| Variable | Kind | Values (`l1` surface form) | Written at | Read at |
|---|---|---|---|---|
| `activity` | selector (`when` only) | `dinner`, `movie` *(no `l1` — never interpolated)* | b2 | b4 (`when`) |
| `spot` | display, **bound to `activity`** | `dinner-plan` → "a nice dinner" · `movie-plan` → "a new movie" | b2 | b2 (self), b3, b9 |
| `cuisine` | display | `chinese` → "Chinese" · `pizza` → "pizza" | b4 | b4 (self), b5 |
| `genre` | display | `comedy` → "a comedy" · `action` → "an action movie" | b4 | b4 (self), b5 |
| `time` | display | `early` → "early" · `late` → "later" | b6 | b6 (self), b7, b9 |
| `who` | display | `us` → "just the two of us" · `friends` → "the whole crew" | b8 | b8 (self), b9 |

`activity`/`spot` is the bound pair from D2 §6.3: every option that writes one writes the other, and the tuples (`dinner`/`dinner-plan`, `movie`/`movie-plan`) are injective. Coherence is therefore structural, and the pair costs **one** degree of freedom — which is why b9 is 8 variants and not 16.

**No dead variables.** Every variable is written and read. In particular, ⚠ **DIVERGES FROM README** §First milestone, where beat 8 writes `who` and **no beat reads it**: here `who` is read at b9 and b8. This satisfies the PM's `who` ruling and D2's `E_DEAD_VARIABLE`, and it is what AC-DOM-05 asserts against the shipped conversation. There is no cosmetic choice in this conversation.

### 11.2 Per-beat spec

Reads are **derived** from the templates (D2 §4.3) and are shown as a consequence, not as a declaration.

| Beat | Speaker | Kind | `when` | Reads | Writes | Variants |
|---|---|---|---|---|---|---|
| b1 | ron | fixed | — | — | — | 1 |
| b2 | bobby | choice | — | `spot` (self) | `activity`, `spot` | 2 |
| b3 | ron | fixed | — | `spot` | — | 2 |
| b4 | bobby | choice | `activity` (2 sets) | `cuisine` / `genre` (self) | `cuisine` \| `genre` | 4 |
| b5 | ron | fixed | `cuisine`, `genre` (4 alts) | `cuisine` / `genre` | — | 4 |
| b6 | bobby | choice | — | `time` (self) | `time` | 2 |
| b7 | ron | fixed | — | `time` | — | 2 |
| b8 | bobby | choice | — | `who` (self) | `who` | 2 |
| b9 | ron | fixed | — | `spot`, `time`, `who` | — | **8** |
| b10 | bobby | fixed | — | — | — | 1 |
| | | | | | **total** | **28** |

`2^4 = 16` sessions; **28 authored records**. The README's §Branching claim survives: `4 decisions × 2 options = 8 authored option templates`. The remaining 20 records are fixed beats with conditional alternatives and multi-variable lines, not 16 hand-written scripts.

### 11.3 Templates, options, labels and hints

Convenience rendering of §11.2 (non-normative: if this JSON and the tables disagree, the tables win). `hint`s comply with §11.5.

```jsonc
{ "id": "b1",  "speaker": "ron",   "hint": "Ron wants to make plans for tomorrow.",
  "line": [ { "id": "b1-l1", "template": "Hi Bobby. Do you want to get together tomorrow?" } ] },

{ "id": "b2",  "speaker": "bobby", "hint": "Bobby is about to suggest a plan.",
  "choiceSets": [ { "id": "b2-s1", "options": [
    { "key": "dinner", "label": { "l1": "Dinner", "l2": "Cena" }, "icon": "🍽️",
      "template": "Sure Ron! Why don't we get together for {spot}.",
      "sets": { "activity": "dinner", "spot": "dinner-plan" } },
    { "key": "movie",  "label": { "l1": "Movie",  "l2": "Película" }, "icon": "🎬",
      "template": "Ok Ron. Let's meet at the theater to watch {spot}.",
      "sets": { "activity": "movie", "spot": "movie-plan" } } ] } ] },

{ "id": "b3",  "speaker": "ron",   "hint": "Ron likes the idea.",
  "line": [ { "id": "b3-l1", "template": "Perfect, {spot} sounds great." } ] },

{ "id": "b4",  "speaker": "bobby", "hint": "Bobby picks a detail.",
  "choiceSets": [
    { "id": "b4-dinner", "when": { "activity": "dinner" }, "options": [
      { "key": "chinese", "label": { "l1": "Chinese", "l2": "Chino" }, "icon": "🥡",
        "template": "Let's get {cuisine}.",        "sets": { "cuisine": "chinese" } },
      { "key": "pizza",   "label": { "l1": "Pizza",   "l2": "Pizza" }, "icon": "🍕",
        "template": "I could go for {cuisine}.",   "sets": { "cuisine": "pizza" } } ] },
    { "id": "b4-movie",  "when": { "activity": "movie" },  "options": [
      { "key": "comedy",  "label": { "l1": "Comedy", "l2": "Comedia" }, "icon": "😂",
        "template": "Let's see {genre}.",          "sets": { "genre": "comedy" } },
      { "key": "action",  "label": { "l1": "Action", "l2": "Acción" }, "icon": "💥",
        "template": "I'm in the mood for {genre}.","sets": { "genre": "action" } } ] } ] },

{ "id": "b5",  "speaker": "ron",   "hint": "Ron agrees with the choice.",
  "line": [
    { "id": "b5-chinese", "when": { "cuisine": "chinese" }, "template": "Let's go with {cuisine}." },
    { "id": "b5-pizza",   "when": { "cuisine": "pizza" },   "template": "Let's go with {cuisine}." },
    { "id": "b5-comedy",  "when": { "genre": "comedy" },    "template": "Let's go with {genre}." },
    { "id": "b5-action",  "when": { "genre": "action" },    "template": "Let's go with {genre}." } ] },

{ "id": "b6",  "speaker": "bobby", "hint": "Bobby suggests a time.",
  "choiceSets": [ { "id": "b6-s1", "options": [
    { "key": "early", "label": { "l1": "Early", "l2": "Temprano" }, "icon": "🌅",
      "template": "{time} works better for me, honestly.", "sets": { "time": "early" } },
    { "key": "late",  "label": { "l1": "Later", "l2": "Más tarde" }, "icon": "🌙",
      "template": "Let's go with {time}, then.",           "sets": { "time": "late" } } ] } ] },

{ "id": "b7",  "speaker": "ron",   "hint": "Ron settles the time.",
  "line": [ { "id": "b7-l1", "template": "Great, {time} it is." } ] },

{ "id": "b8",  "speaker": "bobby", "hint": "Bobby decides who is coming.",
  "choiceSets": [ { "id": "b8-s1", "options": [
    { "key": "us",      "label": { "l1": "Just us", "l2": "Solo nosotros" }, "icon": "👤",
      "template": "Perfect. I'd like to keep it {who}.", "sets": { "who": "us" } },
    { "key": "friends", "label": { "l1": "Friends", "l2": "Con amigos" }, "icon": "👥",
      "template": "Perfect. I'll invite {who}.",         "sets": { "who": "friends" } } ] } ] },

{ "id": "b9",  "speaker": "ron",   "hint": "Ron repeats the plan.",
  "line": [ { "id": "b9-l1", "template": "Perfect. See you {time} on Saturday for {spot} with {who}." } ] },

{ "id": "b10", "speaker": "bobby", "hint": "They say goodbye.",
  "line": [ { "id": "b10-l1", "template": "See you then, Ron!" } ] }
```

Characters: `ron { name: "Ron", voice: "M2" }`, `bobby { name: "Bobby", voice: "M4" }` (one identity per character across languages, D2 §4.1).

**Worked b9 renders** — the case that demonstrates why MT must see the whole sentence (D2 §7.3):

| assignment | English rendered | what Spanish must get right |
|---|---|---|
| `time=early, spot=dinner-plan, who=us` | "Perfect. See you early on Saturday for a nice dinner with just the two of us." | `una` + feminine agreement on `cena`; `el sábado` needs an article English lacks; `con` |
| `time=late, spot=movie-plan, who=friends` | "Perfect. See you later on Saturday for a new movie with the whole crew." | `una película nueva` (adjective after the noun); singular `todo el equipo` vs plural options |

### 11.4 Variant keys under the proposed amendment

For the record, so a reviewer can check injectivity by eye:

```
b1|b1-l1
b2|dinner|spot=dinner-plan      b2|movie|spot=movie-plan
b3|b3-l1|spot=dinner-plan       b3|b3-l1|spot=movie-plan
b4|chinese|cuisine=chinese      b4|pizza|cuisine=pizza
b4|comedy|genre=comedy          b4|action|genre=action
b5|b5-chinese|cuisine=chinese   b5|b5-pizza|cuisine=pizza
b5|b5-comedy|genre=comedy       b5|b5-action|genre=action
b6|early|time=early             b6|late|time=late
b7|b7-l1|time=early             b7|b7-l1|time=later
b8|us|who=us                    b8|friends|who=friends
b9|b9-l1|spot=dinner-plan|time=early|who=us    … 8 combinations …
b10|b10-l1
```

28 keys, no duplicates. Note b5's four alternatives share two template strings but produce four distinct `l1` renders ("Let's go with Chinese.", "…with pizza.", "…with a comedy.", "…with an action movie."): one authored template, several fully-formed outputs — the mechanic the whole design rests on.

### 11.5 Hint discipline

Hints are the scaffolding channel and the easiest thing to ruin (README §Open questions, "how much hint text is too much"). Rules, checked at build time:

1. **≤ 60 characters**, one clause, sentence case, no trailing punctuation beyond a period.
2. **No slots**, and therefore no interpolation (D2 §4.3).
3. **Never quotes or paraphrases the line itself.** A hint is orientation, not a translation — if it reads like a translation, the learner reads instead of listens and the L2 dialogue becomes decoration.
4. **Never reveals a choice's answer.** At a choice beat the hint describes the *situation*, not which option is right.
5. **One hint per beat**, so the hint can never vary by branch. If a beat seems to need two hints, the beat should be split.

### 11.6 MT attention list

Predicting where `opus-mt-en-ROMANCE` will fail is what makes the triage tractable, and each line maps to a `category` in §8.3. The review agent gets this list; the owner's adjudication queue is ordered by §9's ranking.

| # | Phenomenon | Where | Category | Expect |
|---|---|---|---|---|
| 1 | Subjunctive after `que` — "Do you want to **get together** tomorrow?" needs `nos juntemos`, not the indicative | b1 | `subjunctive` | **high** — the README's own known case (`juntamos` → "we join") |
| 2 | Inverted opening marks `¿` `¡`, often omitted or mispaired | b1, b2, b8, b10 | `punctuation` | medium |
| 3 | Idiomatic verbs: "get together", "go for", "work for me", "keep it" | b2, b4, b6, b8 | `idiom` | **high** |
| 4 | Article and gender on a substituted noun phrase: `a nice dinner` → `una buena cena` / `a new movie` → `una película nueva` | b2, b3, b9 | `article`, `agreement` | medium |
| 5 | `on Saturday` needs `el sábado` | b9 | `article` | medium |
| 6 | `the whole crew` / `just the two of us` — collective idioms | b8, b9 | `idiom` | **high** |
| 7 | Adverb placement: "early/later works better for me" | b6, b7 | `register` | medium |
| 8 | Register drift into formal or written Spanish (`usted`, `¿Desea…?`) | all | `register` | medium |
| 9 | Length: MT sometimes drops or doubles a coordinated clause in longer sentences | b9 | `omission`, `addition` | medium |
| 10 | Standardisation of "Ron" / "Bobby" | b3, b10 | `name` | low |

### 11.7 Owner review checklist

Per flagged line, in order. The last item is the real gate.

1. **Proposition** — does the Spanish say what the English says, no more and no less? (`omission` / `addition`)
2. **Agreement** — gender and number hold across the *whole* sentence, especially where a substituted surface form sits.
3. **Register** — does it sound like two friends making plans? No `usted`, no idioms rendered literally.
4. **Punctuation** — `¿…?` and `¡…!` present and correctly paired.
5. **Substitution** — read the substituted variable in place; does it read naturally there?
6. **Names** — unchanged.
7. **Gloss scope** — for a gloss, is it a rendering of *that span*, not of the clause?
8. **Pedagogy** — for a gloss, does hovering this teach the learner the right thing?
9. **The gate** — would you be comfortable showing this to a learner who cannot detect the error? If no, reject it and supply a correction.

---

## 12. Constants and codes

| Key | Value | Notes |
|---|---|---|
| `HINT_MAX_CHARS` | `60` | §11.5.1 |
| `REVIEW_FLAG_TARGET` | `0.20` | reported, not enforced; §8.1 |
| `GLOSS_PRIORITY_TOP_N` | `20` | §9 |
| `MAX_GLOSS_KEYS_WARN` | `250` | above this the report says the gloss spine needs rethinking, not more review |
| `MT_ATTENTION_EMPTY` | `''` | the `mt` sentinel for "no machine translation exists" (§7.2, item 3) |
| review-artifact paths | `review/flags.<id>.json`, `review/report.<id>.md` | §2 |

**Registry additions — approved and applied.** Both are now in D2 §14 and in `DiagnosticCode`:

| Code | Severity | Meaning |
|---|---|---|
| `E_VARIANT_KEY_COLLISION` | error | two variant specs produced the same key (§5.3). **Permanent guard**, even though the amendment removes the known cause. |
| `E_SENTINEL_IGNORED` | error | phase 0: `>>es<<` does not change the output (§4.1). |

**D2 path-list amendment — approved and applied.** The INV-1 boundary now lives in `tools/scan-excludes.json` as its single machine-readable copy (D5 §6), and names no bake path: the bake program lives in `tools/**` (§2.1), entirely outside the scan root. D2 §13 points at the JSON; `src/domain/types.ts` deliberately exports nothing for it.

---

## 13. Acceptance criteria (`AC-CONTENT-*`)

| ID | Criterion |
|---|---|
| **AC-CONTENT-01** | The four content files exist at the paths in §2, and no other file is hand-edited by a pipeline run except the flag list during `--adjudicate`. |
| **AC-CONTENT-02** | `bake --check` writes nothing: the working tree is byte-identical before and after. |
| **AC-CONTENT-03** | `bake` is idempotent: two consecutive runs with unchanged inputs produce zero diff. |
| **AC-CONTENT-04** | Enumeration emits exactly one record per variant spec; the shipped conversation yields **28** line records with the per-beat counts in §11.2. |
| **AC-CONTENT-05** | Variant keys are injective; two forced colliding records raise `E_VARIANT_KEY_COLLISION` and never overwrite. |
| **AC-CONTENT-06** | A hand-edited `l2` survives a re-bake unchanged, `mt` is never overwritten once written, and `edited` is derived as `l2 !== mt`. |
| **AC-CONTENT-07** | Editing one English template flags exactly the affected records, reports `E_SOURCE_STALE`, and in write mode clears their review stamps **without touching text**. |
| **AC-CONTENT-08** | Revision handling: a record/meta mismatch is `E_TRANSLATOR_REV_STALE` with the distinct mixed-provenance message; both-`null` is clean. |
| **AC-CONTENT-09** | Provenance: unflagged entries are stamped `agent`; adjudicated ones `owner` + `triageRef`; `deferred` stays `null` and keeps CI red; `null` anywhere fails `E_UNREVIEWED`. |
| **AC-CONTENT-10** | Flag-list invariants: `FLAG-STALE`, `FLAG-REF-UNKNOWN`, `FLAG-DUP-REF`, `FLAG-UNKNOWN-CATEGORY`, `FLAG-REVIEWER-IS-DRAFTER` all fire on constructed violations. |
| **AC-CONTENT-11** | `--report` emits every §9 section, including the top-20 visibility-weighted gloss ranking, and is byte-reproducible. |
| **AC-CONTENT-12** | The 28 dialogue records and ~200 distinct gloss keys are printed by the report; a gloss count above `MAX_GLOSS_KEYS_WARN` emits the "rethink the gloss spine" warning. |
| **AC-CONTENT-13** | `--author-only` completes the entire pipeline with zero model downloads and zero network access (asserted by a network guard). |
| **AC-CONTENT-14** | §11's spec materialised as `ron-bobby-01.source.json` validates with **zero `error` diagnostics** against D2's registry, including exactly-one-match, no dead variables, read-before-write, bound-pair coherence and enumeration limits. |
| **AC-CONTENT-15** | `who` is read at b9; deleting that read makes D2's `E_DEAD_VARIABLE` fire (AC-DOM-05's shipped-conversation assertion). |
| **AC-CONTENT-16** | Hint discipline is checked at build time: `>HINT_MAX_CHARS`, a slot, or a quoted line is an error. |
| **AC-CONTENT-17** | Labels **and option icons** are literal and authored on the human side: they appear in neither `lines` nor `gloss`, are never machine-translated, never carry `reviewedBy`, and all **ten** option cards in the shipped conversation carry an icon. |
| **AC-CONTENT-18** | Phase 0 runs before any drafting and aborts on `E_SENTINEL_IGNORED`. |
| **AC-CONTENT-19** | Every flag `category` is in the closed enum and appears in §11.6's attention list, so flags are triageable. |
| **AC-CONTENT-20** | CI's default is `bake --check --author-only` and it exits non-zero on any unreviewed, stale or revision-mismatched item. |

---

## 14. Cross-doc notes — pre-registered pushback

**For D4 (UI):** one thing crosses the boundary — **option `icon`s** (D2 §4.3) are copied verbatim into `BuiltOption.icon` and are label-class: decorative, language-independent, and never load-bearing. D4 owns the render rule (`aria-hidden`, never in the accessible name). Everything else here is content, not presentation: `l2` always arrives fully formed, so the UI must never attempt to fill a placeholder. If D4 finds itself wanting a slot in a rendered string, the schema is wrong, not the UI.

**For D5 (tooling):**
1. The default CI job is `bake --check --author-only`; **no CI job may generate** — drafting needs ~214 MB of MT models.
2. The two proposed registry codes (§12) and the `FLAG-*` set are distinct families: `E_*` are D2's, `FLAG-*` are D6's. A CI grep must not conflate them.
3. `review/report.<id>.md` is generated; it must be regenerated in CI's check run or the diff will churn. Recommend: CI regenerates it into a temp path and compares, rather than writing in-tree.
4. The hint-discipline check (`AC-CONTENT-16`) is build-time, not lint-time, because it needs the parsed source.
5. Vitest's bake project needs a fixture translator; D6 owns the fixtures, D5 owns the harness.

**For D7 (architecture):** bake is a separate Node program with its own dependency set, four inputs and three outputs, and it consumes `domain`'s walk. The browser artifact is a projection of it. The "one file swap" claim for M2 belongs to D3 §14, and D7 should repeat the accurate version.

**Open items for the owner:**

1. **§7.2 — write mode clearing the review stamp** when the authored English changes. It is the honest behaviour and it makes review debt visible in the diff, but it will produce a diff full of `reviewedBy: null` on the first English edit. If you prefer noiseless diffs over visible debt, say so and I will invert it (report-only, no write).
2. **§11.2 — b9 is 8 variants**, the most expensive line, because it is the only one reading three variables. Splitting the plan across b9 and b10 would reduce b9 to 4 and add 2 at b10 (net −2 records) at the cost of a weaker ending. I recommend keeping it: the ending is where the "story bends" payoff lands.
3. **§11.6's attention list is a prediction, not a measurement.** It should be re-annotated after the first triage run and the observed flag categories folded back in.
4. `MAX_GLOSS_KEYS_WARN = 250` and `HINT_MAX_CHARS = 60` are invented guards; both are one-line policy changes.
