# You Don't Say — POC Contract (D1)

> **Status:** Frozen · **Owner:** Project Manager · **Created:** 2026-10-18
> **Purpose:** The north star, the loop, MVP scope, the milestone map, and the Definition of Done for each
> milestone. This is the contract the Engineer is measured against.
> **Related:** `README.md` (concept narrative) · `docs/design/README.md` (index) · `D2`–`D7` (specifications) · `docs/legal/clean-room-record.md`
> **Precedence:** locked decisions > `docs/design/D2`–`D7` > this document > `README.md`. This document is the
> authority on *scope, milestones, and acceptance*, never on mechanism — mechanism belongs to `D2`–`D7`.

---

## 1. North star

A learner hears a real conversation between two people, guides where it goes by choosing what one of
them says next, and can reveal as little or as much text as they want. It runs entirely in the browser,
offline, with no server and no accounts.

The thing that must be true when this is done: **a learner with no Spanish can follow the conversation
by ear, and a learner with some Spanish can be genuinely challenged by it** — using the same
conversation, changing only the settings.

Diagnostic of failure: if the text is always on, the app is a reader and the idea is lost. The default
posture is *listening*, and text is a scaffold you reveal.

## 2. The loop

1. Beat 1 plays. Ron speaks. Audio in the Hear language; text per the Read setting.
2. Beat 2 pauses. Two option cards appear, each with a label, an optional icon, and a **preview** button
   that plays that option's line without committing to it.
3. The learner picks. The chosen line animates in, plays, and joins the transcript. The unchosen option
   remains visible, ghosted.
4. The choice sets variables. Later beats reference them, so the story bends while the timeline stays
   linear.
5. Repeat to beat 10 — five turns each, four decision points.
6. Afterwards: "Replay with a different pick" swaps one decision and shows how the conversation resolves
   differently. Beats that become unresolved are marked auto-picked.

## 3. MVP — in and out

**IN**

- One conversation: English ⇄ Spanish, 10 beats, 5 turns each, 4 decision points.
- Step-by-step play with accumulating transcript.
- Choice cards with preview, ghosted alternates, and a "what if" replay.
- Independent Read (L1/L2/both/none) and Hear (L1/L2/both/none) channels, plus hints on/off.
- Hover/select translation of any word, offline, with no runtime model.
- Per-beat audio with the engine behind a port.
- Voice assignment per character.
- **First-run language pair**, offered from the catalog so onboarding cannot dead-end; the same
  conversation serves both directions because both languages are authored.
- **A conversations list**, filtered by the learner's pair, with per-conversation progress.
- **A completion state** once every beat is determined, showing the chain of decisions and allowing
  any of them to be changed in place.
- **Whole-conversation playback** — continuous, with no choice UI.
- **Local persistence** of the pair, the channel preferences, and the composed session per
  conversation.
- **Full chrome localization** (English and Spanish): the app's own UI translates, not only the content.

**OUT (explicitly, and not negotiable mid-milestone)**

- Accounts, and sync across devices. Local persistence is in scope; a server is not.
- A second conversation. The catalog surface exists and holds exactly one.
- Languages beyond English and Spanish.
- Audio export, sharing, or download of generated speech.
- Pronunciation scoring, speech recognition, spaced repetition.
- An authoring UI. Authoring is by editing JSON and running a build step.
- A native app or a server component of any kind.

## 4. Milestone map

Each milestone ends at a **gate**. The Engineer stops at the gate and reports; it does not roll into the
next milestone without my acceptance. Work may not start on a milestone whose dependency is unaccepted.

| | Milestone | Deliverable | Gate |
|---|---|---|---|
| **M1** | **Domain + playable app + tooling** | `types.ts` implemented; the pure domain functions (`resolveTimeline`, `reduce`, `deriveVariables`, `visibility`, `segmentL2`); the UI; the `speechSynthesis` engine; and **the entire `tools/` tree**, including the bake CLI in `--author-only` mode — because the M1 gate runs `bake:check` (`D5 §3`, `§3.1`). Playable end to end against a **development fixture** conversation | `AC-DOM-*`, `AC-UI-*`, `AC-TOOL-*`, the M1-adapter `AC-ENG-*`, and every `AC-CONTENT-*` that does not require the real translator. **First demoable milestone.** Zero browser downloads. |
| **M2** | **Shipping content** | Run the real translator once on a development machine, produce the reviewed bilingual artifact, replace the fixture, retire it. No application code changes | The remaining `AC-CONTENT-*`, `bake:check` green against the shipped artifact, and complete provenance (`reviewedBy` non-null on every line and gloss) |
| **M3** | **Real TTS** | Supertonic behind the frozen `TtsEngine` port, worker, cache, prefetch, Downloads panel | The M2-boundary `AC-ENG-*` |
| **M4** | **Polish and offline** | Service worker, storage persistence and eviction UX, "what if" comparison view, hint tuning | M4 has no acceptance criteria yet — the service-worker and storage work is deliberately a *seam* in `D3`/`D5` and gets its ACs when M4 is specified |
| **M5** | **Conversation flow and persistence** — *delivered out of order at the owner's direction* | First-run language pair, conversations list, completion state, whole-conversation playback, local persistence | `AC-UI-28..35`. Delivered before M2/M3/M4 because it is what makes the product legible; the content is still the fixture |
| **M6** | **Chrome localization** | `AC-I18N-*`: typed message catalogs, pluralization, message identities out of `audio-state`, language names, `<html lang>` | `AC-I18N-01..08` |

**The fixture boundary (a PM decision, recorded).** M1 needs a conversation to render, but the real
artifact cannot exist until M2's bake pipeline does. So M1 runs against a fixture that lives **only**
in test fixtures and is never loaded from the shipping data path. `INV-5` ("nothing ships unreviewed")
is not violated because the fixture is never the *shipping content*: it is authored, not machine-drafted,
it is deleted in M2, and it is never the artifact a learner is taught from. The Engineer may not place a
fixture in `src/data/conversations/`.

## 5. Definition of Done

A milestone is **done** when all four hold:

1. **Every acceptance criterion assigned to that milestone passes.** Assignment is by rule: an AC belongs
   to the milestone whose deliverable it describes, and `D3 §5`'s M1/M2 boundary table is authoritative
   wherever an engine AC could fall on either side. Where a doc's own AC table names its milestone, that
   wins.
2. **`npm run check` exits 0.** Locally and in CI, same script, same order (D5 §3):
   `format:check && lint && typecheck && check:vocabulary && bake:check && test && build && check:bundle && check:assets && check:ac-map`.
3. **Evidence is emitted**, per §6.
4. **Nothing in the "OUT" list above was built**, and no document under `docs/design/` was modified.

Partial credit does not exist. A milestone with 41 of 42 criteria passing is not done.

## 6. Evidence

The Engineer self-verifies, so self-verification must leave a receipt. Following the house convention
from the sibling project, each gate produces `test-artifacts/`:

| Artifact | Contents |
|---|---|
| `result.json` | Machine-readable pass/fail per AC id, with the gate command's exit code |
| `test.log` | Full captured output of `npm run check` |
| `*.png` | Numbered screenshots of each demonstrable behavior, in the order a reviewer would exercise them |

An AC id reported as passing with no corresponding evidence is treated as not passing. Evidence is
generated, never hand-written.

## 7. Acceptance criteria register

**151 criteria across seven families.** This document does not restate them — restating acceptance text
invites the drift both D2 and D5 explicitly warn against. The docs own the text; this document owns the
assignment, and `tools/ac-map.json` carries the per-id milestone that `check:ac-map` enforces.

⚠ **Known defect in the enforcement:** `check:ac-map`'s scanner matches `AC-[A-Z]+-\d+`, which cannot see
`AC-I18N-*` because the family name contains digits. The whole family is therefore invisible to the check —
neither required nor covered. The scanner must widen to `AC-[A-Z0-9]+-\d+`. Until it does, the `AC-I18N-*`
criteria are unenforced, which is worse than unmet.

| Family | Count | Owned by | Lands at |
|---|---|---|---|
| `AC-DOM-*` | 24 | `D2` | M1 |
| `AC-ENG-*` | 22 | `D3` | M1 and M3, split by `D3 §5` |
| `AC-UI-*` | 35 | `D4` | M1 and M5 (storage/Downloads items land at M3) |
| `AC-TOOL-*` | 24 | `D5` | M1 |
| `AC-CONTENT-*` | 25 | `D6` | M1 and M2, split by whether a criterion needs the real translator |
| `AC-ARCH-*` | 13 | `D7` | M1 — all thirteen describe properties of the M1 codebase; the M2 swap checklist is proved by a stub-engine build |
| `AC-I18N-*` | 8 | `D4` §18 | M6 |

**Ids are frozen.** They may not be renumbered, reused, or retired. A criterion discovered to be wrong
is annotated in place, never silently changed — `check:ac-map` fails on a missing or orphaned id, and
`AC-TOOL-*` covers that check.

## 8. Risk register

Live risks, each with an owner. Mitigations are already designed into `D2`–`D7`; this is the list I
re-check at each gate.

| # | Risk | Owner | Mitigation |
|---|---|---|---|
| R1 | MT quality on colloquial dialogue — worst on exclamatory, idiomatic lines | D6 / owner | Triage-then-adjudicate gate; `E_UNREVIEWED` fails the build |
| R2 | The `>>es<<` target token silently ignored → Portuguese on a Spanish page, no error | D6 | Phase-0 smoke test; `E_SENTINEL_IGNORED`; pinned revision |
| R3 | Unpinned model revisions make every build report stale forever | D3 | Hard-pinned revisions; revision recorded in the artifact |
| R4 | Locale-dependent `sort()` desynchronizes bake from the browser | D2 / D5 | Comparator-free sort frozen as canonical; covered by test |
| R5 | `speechSynthesis` landmines (truncation, async voice list, unreliable cancel, absent in Workers) | D3 | Adapter responsibilities + conformance suite against a mock |
| R6 | Storage eviction breaks the offline promise silently | D3 / D4 | `navigator.storage.persist()`, usage readout, distinct "evicted" UX |
| R7 | Segmentation quality is unbounded work | D2 | Bounded by a golden corpus of ≥20 boundaries (AC-DOM-13) |
| R8 | Model binaries committed to git | D5 | Fetched at runtime; CI asserts no binary and no `.bin` under `src/` |
| R9 | The browser silently acquires engine code | D5 | Bundle string assertions; no bake-only module reachable from `index.html` |
| R10 | Schema change after the first bake | PM | Contract frozen at 151 ACs and 49 diagnostics; the icon field was added *before* the freeze for exactly this reason |
| R11 | Scope creep into OUT-list territory | PM | OUT list is not negotiable mid-milestone |

## 9. Roles, and the escalation protocol

- **Designer** owns `docs/design/D2`–`D7` and the frozen contracts. It does not implement.
- **Engineer** implements against the frozen contracts. **It may not modify any document under
  `docs/design/`, and may not modify `src/domain/types.ts` or `src/engines/ports.ts`.** Adding fields to
  a frozen contract is a Designer amendment, requested through me.
- **Project Manager (me)** owns this document, the acceptance criteria assignment, the risk register, the
  clean-room record, and verification at each gate. I do not write production code or specifications.

**Escalation.** When the Engineer finds a contradiction, an ambiguity, or a spec that cannot be
implemented as written, it **stops and reports** — it does not improvise a resolution and it does not
proceed on an assumption. Silent deviation is the failure mode this protocol exists to prevent. The same
applies to the Designer against this document.

## 10. Open decisions

- **Product name.** "You Don't Say" is unverified for trademark. Must be resolved before any public
  branding. Recorded in `docs/legal/clean-room-record.md` §9.
- **Supertonic packaging** — 248 MB fp32 via `transformers.js` versus 138 MB int8 via the sherpa-onnx
  runtime. Deliberately deferred, decided at the M3 gate when the trade-off is measurable rather than
  guessed. Both are documented in `D3 §6`.
- **OpenRAIL-M use restrictions** must be surfaced in-app (M3, `D4`).
- **Licences surface scope.** M1 ships no model weights, so M1's Licences surface lists the licences of
  what M1 actually ships, and the model licences (OpenRAIL-M, Apache-2.0) arrive at M3 with the weights
  and the Downloads surface. The Designer's better refinement — scoping `check:bundle`'s forbidden list
  to repoIds and package specifiers rather than bare substrings, so the app can name models honestly
  without tripping its own assertion — is adopted and applied at the M3 gate, where an engine string can
  first exist in a bundle. M1 has no engine code at all, so nothing is lost by deferring it.
- **Fixture review honesty (a recorded wart, not solved).** The M1 fixture carries `reviewedBy: 'agent'`
  with `l2 === mt`, and `meta.reviewPolicy: 'fixture'` records the truth beside it. But `'agent'` still
  asserts a triage that never ran. The fixture is deleted in M2 and never taught from, so the wart is
  bounded — recorded here rather than quietly accepted.

## 11. Change log

| Date | Change |
|------|--------|
| 2026-10-18 | Initial contract. Contracts frozen; `Option.icon` added before the freeze. |
| 2026-10-18 | After the Engineer's M1 reconnaissance: counts corrected 48 → 49 diagnostics and 122 → 130 ACs, `AC-ARCH-*` reassigned to M1, fixture-shipping wording corrected (§4). |
| 2026-10-18 | After the M1a gate: ACs raised 130 → 135 (`AC-TOOL-24` frozen-contract hashes, `AC-DOM-24` option read scope, `AC-CONTENT-23/24/25`). M1a accepted. |
| 2026-10-18 | Scope revised by the owner: onboarding, a conversations list, a completion state, whole-conversation playback and local persistence are now IN (M5, delivered), and full chrome localization is IN (M6). ACs 135 → 151 across seven families (`AC-UI` 27 → 35, new `AC-I18N` 8). The docs had fallen behind the code; this closes that. |
