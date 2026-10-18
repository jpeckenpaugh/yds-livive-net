# You Don't Say — Clean-Room / Independent Creation Record

> **Status:** Living document · **Created:** 2026-10-18 · **Owner:** Project Manager
> **Purpose:** Document that You Don't Say is an original, independently created work, and record what was and was not used as input. This supports the clean-room position described in `README.md` and the design specs in `docs/design/`.
> **Scope:** This is a factual provenance record kept for good practice. It is not legal advice.

---

## 1. What You Don't Say is

An original, listen-first interactive conversation reader for language learners. Two speakers hold a
conversation; the learner hears it, and at four points chooses what one speaker says next. Choices set
variables that later lines reference, so the story bends without the timeline forking. Text and audio
languages are toggled independently, and any word can be hovered for a translation.

It is an independently conceived application. It is **not** a clone, port, reimplementation, or
derivative of any specific commercial language-learning product, and no course material, lesson text,
or recorded audio from any such product has been used.

The genre — dialogue-based, listen-and-repeat, choice-driven language practice — consists of ideas,
methods, and pedagogical techniques that are not protectable expression. What is protectable is
specific expression, and all of ours is original.

## 2. Legal position (summary)

| Protectable (avoided) | You Don't Say's position |
|---|---|
| Course lesson text, dialogues, and scripts from commercial products | None used. Every conversation is originally authored for this project. |
| Recorded human narration / audio lessons | None used. All audio is synthesized at runtime by licensed model weights; no third-party audio files are committed. |
| Cloned or impersonated real-person voices | None used. We use the model's fixed preset voices only (`M1`–`M5`, `F1`–`F5`) and do **not** use the upstream voice-cloning service. |
| Third-party model weights | Not redistributed. Fetched from pinned upstream revisions at runtime and cached in the browser (`D3`; PM ruling `C10`). |
| Proprietary or leaked training data / model internals | Never obtained or used. Only public model cards, published papers, and documented APIs. |
| Trademarks of commercial language-learning products | Not used in code, text, docs, art, or metadata. |
| Fonts, icons, images from third parties | None. System fonts and original markup only. |
| The project name **"You Don't Say"** | **Unverified — see §9 open items.** Not asserted as clear. |

## 3. What was studied (inputs)

Only the following informed the design, and only at the level of **published facts, documented
behaviour, and abstract technique**:

1. **Public model documentation** — Hugging Face model cards, `VOICES.md`, repository READMEs, `LICENSE`
   files, and the Hugging Face API for size and license metadata. Consulted for *facts*: model ids,
   parameter counts, file sizes, supported languages, voice inventories, PHI/token conventions, and
   licence terms.
2. **The published papers describing the TTS architecture** — SupertonicTTS, Length-Aware RoPE, and
   Self-Purifying Flow Matching. Consulted for understanding only. No code, weights, or text from them is
   incorporated.
3. **The owner's own concept narrative** (`README.md`) — the project's own written analysis of the
   concept, the branching model, and the language-learning interaction.
4. **The owner's own prior project** (`bf-livive-net`) — the same author's separate, unrelated work.
   Consulted **for documentation conventions only** (document headers, the doc-id scheme, the
   evidence-artifact shape for testing). **No code, content, or other expression was copied from it.**

## 4. What was explicitly NOT used

- No lesson text, dialogue scripts, phrase lists, or vocabulary sets from any commercial course or
  textbook.
- No recorded human audio, sound effects, or music of any provenance.
- No scraped subtitle corpora, film dialogue, or broadcast transcripts used as conversation content.
- No voice cloning, voice conversion, or impersonation of any real person, public figure, or performer.
- No proprietary, leaked, reverse-engineered, or unlicensed model weights.
- No commercial product's name, logo, or brand assets.
- No asset-marketplace or third-party assets of ambiguous provenance.

## 5. Provenance of You Don't Say's own assets

| Asset class | Origin |
|---|---|
| Code | Written from scratch for this repo (human owner + AI coding agents), TypeScript / Preact. |
| Conversation content | Originally authored for this project. The ten-beat English/Spanish conversation in `D6` is our own writing. |
| Spanish dialogue text | Machine-drafted from our own English by Apache-2.0 MT models, then reviewed under the `D6` triage/adjudication gate. Provenance per line is recorded in the artifact (`mt`, `es`, `reviewedBy`), so which lines a human approved is always auditable. |
| Audio | Synthesized at runtime by licensed model weights. No recorded human voice; no audio files committed to the repo. |
| Model weights | **Not redistributed.** Fetched from pinned upstream revisions at runtime and cached in the browser. Voice styles are ~49 KB each and are likewise fetched, never committed. |
| Fonts | System fonts only; none embedded. |
| Images / icons | None at present. Any added will be original or carry a recorded licence. |
| Third-party runtime deps | See §6. Bake-only tooling never enters the shipped bundle. |

## 6. Third-party components and their licences

Licence fields verified on 2026-10-18 against the Hugging Face API and the npm registry.

| Component | Role | Licence | Obligation |
|---|---|---|---|
| Supertonic 3 — weights | TTS engine (M2) | **OpenRAIL-M** | Carries **use restrictions**. Must be surfaced to the user as restrictions, not merely included as text. `D4` owns that surface. |
| Supertonic — reference code | Architecture reference only | **MIT** | No code copied; not redistributed. |
| OPUS-MT ROMANCE pair (`Helsinki-NLP`) | MT drafter (build-time only) | **Apache-2.0** | Include the licence text. **No attribution line required**; there is no upstream NOTICE file to propagate. Not shipped to the browser. |
| `@huggingface/transformers` | TTS + MT runtime / build | Apache-2.0 | Include licence text. |
| `onnxruntime-web` | Inference runtime | MIT | Include licence text. |
| `preact` | UI | MIT | Include licence text. |
| `vite`, `vitest`, `typescript` | Build / test / types | MIT, MIT, Apache-2.0 | Dev-only; not shipped. |
| Kokoro-82M | **Considered, not used** | Apache-2.0 | None — no dependency. |
| Piper | **Considered, not used** (recorded fallback) | MIT | None — no dependency. |

The one licence with obligations beyond inclusion is **OpenRAIL-M** on the Supertonic weights, because
it restricts downstream use. This is recorded here so it cannot be lost between the model decision
(`D3`) and the user-facing surface (`D4`).

## 7. Process (how the clean-room discipline was kept)

- **Docs-first.** A written concept narrative (`README.md`) and a seven-document design set
  (`docs/design/`) preceded any implementation.
- **Separate roles.** Design, implementation, content review, and project management are distinct steps.
  The Designer owns the specifications, the Engineer implements against them and may not modify them,
  and the Project Manager owns the plan, the acceptance criteria, and this record.
- **Provenance is recorded, not assumed.** Machine-translated content carries its provenance and review
  status in the artifact itself, and the build fails on unreviewed content.
- **No expression sharing.** The implementation is specified to take model *ids*, *sizes*, and
  *interfaces* from public documentation — never copied code or text.
- **No binaries in git.** Model weights and voice styles are fetched at runtime; a CI assertion forbids
  binaries under `src/`.

## 8. Independence statement

To the best of the owner's and team's knowledge, You Don't Say's source code, conversation content,
translation data, and text are original works created for this project, and no protected expression
from any third party has been incorporated. The TTS and MT models are used under their published
licences and are not redistributed. Similarities to other language-learning applications are limited to
non-protectable ideas, methods, and pedagogical conventions.

## 9. Open items

- [ ] **Product name clearance.** "You Don't Say" is a common English idiom and has prior uses as a
      title in other media. **No trademark search has been performed and no claim of clearance is made.**
      Resolve before any public release or public-facing branding.
- [ ] **Surface OpenRAIL-M use restrictions** in the About/Licenses surface (`D4`), and confirm at the
      M2 gate when the weights are actually integrated.
- [ ] **Final pre-release legal and asset scan** — re-run before any public release, including a
      no-banned-terms scan and a dependency licence sweep of the shipped bundle.
- [ ] **Decide the licence** if this code is ever published.

## 10. Record-keeping checklist per house convention

- [x] Concept narrative documented (`README.md`)
- [x] Protectable vs. not-protectable analysis (this document, §2)
- [x] Design decisions recorded (`docs/design/`)
- [x] Model and dependency licences verified and recorded (§6)
- [x] Asset provenance documented (§5)
- [x] Machine-generated content provenance recorded in the artifact (`D6`)
- [ ] Product name clearance (§9)
- [ ] OpenRAIL-M restrictions surfaced in-app (§9)
- [ ] Final pre-release legal and asset scan (§9)

## 11. Change log

| Date | Change |
|------|--------|
| 2026-10-18 | Initial record created. Licence fields verified against the Hugging Face API and npm registry. |
