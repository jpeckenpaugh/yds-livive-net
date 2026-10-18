# You Don't Say — Domain Model (D2)

> **Status:** 🟡 Draft — pending owner review (this doc is the freeze gate for `src/domain/types.ts`)
> **Owner:** Designer · **Reviewer:** Project Manager
> **Purpose:** The normative semantics of the conversation data model: the authored source schema, the generated runtime artifact, variable discipline, span segmentation, session state, and resolution. Everything the Engineer implements in `src/domain/` is answerable from this doc plus `src/domain/types.ts`.
> **Depends on:** D1 (contract + AC registry) · `README.md` §Branching, §Conversation data model (raw material only)
> **Owns:** the two schemas, the resolution algorithm, the diagnostic registry, span segmentation, the canonical semantic constants, and the `AC-DOM-*` criteria
> **Related:** D3 (engine ports) · D4 (UI states + playback sequencing) · D5 (tooling, lint, CI) · D6 (authoring + bake pipeline)

**Precedence.** Locked decisions > `docs/design/D2`–`D7` > `README.md`. Where this doc deliberately overrules the README it says so with a **⚠ DIVERGES FROM README** marker and gives the reason. The README is the concept narrative, not a spec.

**House rule for this doc.** Tables and lists over prose. If a behaviour is not written here, it is not specified, and the Engineer must escalate rather than improvise.

---

## 1. Scope

**In scope:** the shape of both data artifacts; `when` matching and its exclusivity/exhaustiveness proof; variable discipline; the timeline walk; variant keys; the variant/provenance record; the gloss index; span segmentation tables; `Session` and its operations; `resolveTimeline`, `visibility`; the diagnostic registry; the constants other docs cite.

**Out of scope, by design:**

| Not here | Where it lives |
|---|---|
| TTS/translation engine ports, model ids, dtypes, caching | D3 |
| Bake pipeline (phases, staleness reporting, CLI, review workflow) | D6 |
| The authoritative 10-beat conversation content (prose, hints, variable choices) | D6 |
| Component tree, visual states, playback sequencing and timings, keyboard, a11y | D4 |
| ESLint rules, Vitest config, CI job list, bundle assertions | D5 |
| Zero of this doc is implemented in this call — `types.ts` is a marked draft | — |

---

## 2. Canonical vocabulary

These words have exactly one meaning in `docs/design/`. The README overloads several of them; where the README conflicts, this table wins.

| Term | Meaning | Notes |
|---|---|---|
| **beat** | One speaker's turn in the timeline. The timeline is an ordered array of beats. | A beat is never duplicated and never forked. |
| **alternative** | One candidate for a beat's content: either a `Line` (fixed beat) or a `ChoiceSet` (choice beat). Selected by `when`. | Replaces the README's "`when` on the beat". |
| **line** | An authored, fixed spoken turn: a `Line` (source) or a `VariantRecord` entry (generated). | Not synonymous with "beat". |
| **option** | One button in a `ChoiceSet`: a label, a response `template`, and the variables it `sets`. | The README's "choice". |
| **variable** | A named slot. Written by exactly one option on every reachable path; read by `when` and/or templates. | |
| **selector variable** | A variable read by a `when` clause (scopes which options/lines are even offered). Example: `activity`. | PM ruling Q5. |
| **display variable** | A variable read by a template (its surface form appears in speech). Example: `spot`. | PM ruling Q5. Most variables are both. |
| **bound pair / co-write group** | A set of variables that are always written together by the same option, and whose written tuples are injective. | This is what makes `activity`/`spot` coherence *structural* (§6.3). |
| **assignment** | `Record<VarName, ValueKey>` — the variables written so far, at a point in the walk. | Partially populated by construction. |
| **read scope** | The variables a given template actually reads. Frozen at build time (`slotNames`). | |
| **variant** | A fully-formed, slot-free render of one alternative's text for one point in the assignment space: `l1` (English) + `l2` (Spanish). | The unit of MT, of review, and of provenance. |
| **variant key** | The deterministic string that identifies a variant. | §5.3. |
| **session** | `{ cursor, revealed, choices }` — where the learner is and what they picked. | §10. |
| **walk** | The one timeline traversal from which `resolveTimeline`, `deriveVariables` and `reachableVariants` are all projected. | §5.1. This is the doc's central invariant. |

---

## 3. The two artifacts

⚠ **DIVERGES FROM README** §Repo layout, which shows a single `data/conversations/ron-bobby-01.json` that is both hand-authored and bilingual. There are two artifacts with different owners and different edit rules (PM ruling Q4).

| File | Authored by | Machine-written | Committed | Notes |
|---|---|---|---|---|
| `src/data/conversations/<id>.source.json` | human | never | yes | **`ConversationSource`**. English only. Contains `{slots}`. |
| `src/data/glossary.es.json` | human | never | yes | Authored gloss overrides, keyed by normalized span text. |
| `src/data/conversations/<id>.json` | machine, then possibly human | yes | yes | **`Conversation`**. Slot-free. The runtime artifact. |
| `src/data/conversations/<id>.glossary.json` | machine | yes | yes | **`GlossIndex`**. |

Rules:

1. **App code may not import a `.source.json`.** Enforced by file location plus a D5 lint rule (`no-restricted-imports`). This is the structural half of the no-interpolation invariant (§8).
2. **Humans never hand-edit the generated `.glossary.json`.** Gloss corrections go into `glossary.es.json`. Line corrections go into the generated `.json` (§7.2 explains how a hand edit is detected without bookkeeping).
3. **No timestamps in generated files.** They cause diff churn. Provenance is carried by `reviewedBy` and by the source hash (§7.2).
4. Generated files are committed: M1 must be playable with zero downloads, and a committed artifact makes review diffs and CI checks possible.

---

## 4. Authored source schema (`ConversationSource`)

Canonical TypeScript: `src/domain/types.ts`. Field names below are normative.

The `id` in the example is the **M2 shipping conversation**; M1 ships `m1-fixture` under the same convention (D6 §2). The id is author-assigned and appears in no path that either milestone fixes.

```jsonc
{
  "id": "ron-bobby-01",
  "title": "Making Plans",
  "l1": "en",                        // interface / native language; the authored language
  "l2": "es",                        // study language; the MT target, generated at build time
  "characters": {
    "ron":   { "name": "Ron",   "voice": "M2" },
    "bobby": { "name": "Bobby", "voice": "M4" }
  },
  "variables": [ /* Variable[] */ ],
  "beats": [ /* SourceBeat[] — array order IS the timeline order */ ]
}
```

### 4.1 `Character`

⚠ **DIVERGES FROM README** §Conversation data model, which writes `"voice": { "en": "M2", "es": "M2" }`. Locked decision 2 says one voice identity per character in every language, and PM ruling Q13 puts the per-language override in *user preferences*. So the authored shape is a single voice id.

```ts
type Character = { name: string; voice: VoiceId };   // VoiceId = 'M1'..'M5' | 'F1'..'F5'
```

The per-language override lives in `Preferences.voiceOverrides` (§12), owned by D4. D3 owns what a `VoiceId` maps to per engine.

### 4.2 `Variable`

```ts
type Variable = { name: VarName; values: VariableValue[] };
type VariableValue = { key: ValueKey; l1?: string };
```

- `values` are the only legal values for this variable. Any `sets`/`when` referring to an unknown key is `E_UNKNOWN_VALUE`.
- `l1` is the **surface form substituted into English templates**, e.g. `spot`'s value `movie-plan` → `l1: "a new movie"`. It is **required if and only if** some template reads this variable (§6.1). A pure selector variable such as `activity` has no `l1`.
- `l1` surface forms are authored English noun phrases or adverbs, not keys. Their whole purpose is that MT sees the complete English sentence (§7.3).
- **A variable is never written to `null`.** ⚠ **DIVERGES FROM README** beat 2, which has `"cuisine": null`. "Unwritten" is the absence of a key in the assignment, not a null value (`E_NULL_WRITE`).

### 4.3 `SourceBeat`, `Line`, `ChoiceSet`, `Option`, `When`

```ts
type SourceBeat = {
  id: BeatId;                 // stable, unique, author-assigned ('b1'…'b10')
  speaker: CharacterId;
  hint?: string;              // authored L1 only; slots forbidden (§8 INV-2)
  line?: Line[];              // fixed beat: >=1 alternative, selected by when
  choiceSets?: ChoiceSet[];   // choice beat: >=1 set, selected by when
};                            // exactly one of line / choiceSets (E_BEAT_ARITY)

type Line      = { id: LineId; when?: When; template: string };
type ChoiceSet = { id: ChoiceSetId; when?: When; options: Option[] };   // >=2 options
type Option    = {
  key: ChoiceKey;             // unique within the beat, across ALL of its choice sets
  label: { l1: string; l2: string };   // literal, authored, never MT'd, slots forbidden
  icon?: string;              // decorative, language-independent, literal; see below
  template: string;           // the spoken response line, English, may read slots
  sets: Record<VarName, ValueKey>;     // may be {} for a purely rhetorical option
};
type When = Record<VarName, ValueKey>;  // AND of exact matches; {} is forbidden (E_EMPTY_WHEN)
```

**There is no `Option.hint`** (amendment C6). A source field with no counterpart on `BuiltOption` and no governing AC is dead, and the reasoning that makes `hint` beat-level applies to options too: a hint orients the listener to the *beat*, and an option that seems to need its own hint is a signal that its `label` is doing too little work. If a conditional beat genuinely needs a different hint, the beat should be split — which is the same rule stated below for hints that read slots.

**`icon` is on `Option`, not inside `Label`.** Structurally, `Label` is a *pair of per-language renderings of one string*; the icon is language-independent, so it is not a member of that pair. Putting it on `Option` keeps `Label`'s meaning intact ("the same two words, in two languages") and avoids a field that must stay identical across both language entries. It is a **label-class** value, with the whole label-class treatment:

| Rule | Detail |
|---|---|
| literal only | no slots (`E_LABEL_SLOT`, the label slot diagnostic reused rather than a new code), and the reserved-character rule applies (`E_TEMPLATE_RESERVED_CHAR`) |
| never translated | it is not dialogue and is never sent to MT |
| never reviewed | `reviewedBy` does **not** apply — it is UI chrome, exactly like the label text |
| no glossary entry | it never appears in `lines` or `gloss` |
| **decorative** | it carries no information that the label text does not already carry. The label text must stand alone and be sufficient on its own. D4 owns the render rule (aria-hidden, never in the accessible name). |
| once per option | not per language, not per variant, not per beat |

⚠ **DIVERGES FROM README** §Branching, which puts `when` on the *beat* and shows `{"id": 4, …}` twice. Beat ids are unique; `when` belongs to an alternative inside the beat. Two incompatible shapes for one feature is exactly the kind of contradiction the Engineer must not have to resolve.

**`template` syntax.** `{varName}` is the only construct. `{` and `}` are reserved characters anywhere in a template; `$` is reserved; literal braces are not expressible (`E_TEMPLATE_RESERVED_CHAR`). The set of names appearing in a template is the read scope, **derived**, never declared — so a declaration cannot drift from the text. An unknown name is `E_UNKNOWN_SLOT`.

**`label` is a carve-out.** ⚠ **DIVERGES FROM README** §Translation's "MT generates the second language". Option labels are two-word UI chrome, not dialogue; they are authored in both languages so the chooser is never doubled by a bad MT call. They are literal (no slots), and because they live in the human-owned source they carry no `reviewedBy` field — the source file *is* the human review.

**`hint` may not read slots** (`E_HINT_SLOT`). Motivation: it keeps the "no interpolation in rendered strings" invariant total (§8 INV-3 checks every rendered string uniformly), and it preserves the authorial intent that a hint orients the listener to the *beat*, not to a branch of it. If a conditional beat needs a different hint, that is a signal to split the beat.

### 4.4 Worked example (illustrative, 4 beats)

⚠ **DIVERGES FROM README** §Conversation data model in three ways visible here: `{spot}` is not interpolated into `l2` because there is no `l2` in the source; `sets` values are keys, not display text; verbatim beat-2 lines from the README appear here only as English.

```jsonc
{
  "id": "worked-example", "title": "Worked Example", "l1": "en", "l2": "es",
  "characters": { "ron": { "name": "Ron", "voice": "M2" },
                  "bobby": { "name": "Bobby", "voice": "M4" } },
  "variables": [
    { "name": "activity", "values": [ { "key": "dinner" }, { "key": "movie" } ] },
    { "name": "spot", "values": [ { "key": "dinner-plan", "l1": "a nice dinner" },
                                  { "key": "movie-plan",  "l1": "a new movie" } ] },
    { "name": "time", "values": [ { "key": "early", "l1": "early" },
                                  { "key": "late",  "l1": "later" } ] }
  ],
  "beats": [
    { "id": "b1", "speaker": "ron", "hint": "Ron proposes getting together.",
      "line": [ { "id": "b1-l1", "template": "Hi Bobby. Want to get together tomorrow?" } ] },

    { "id": "b2", "speaker": "bobby",
      "choiceSets": [ { "id": "b2-s1", "options": [
        { "key": "dinner", "label": { "l1": "Dinner", "l2": "Cena" }, "icon": "🍽️",
          "template": "Sure Ron! Why don't we get together for {spot}.",
          "sets": { "activity": "dinner", "spot": "dinner-plan" } },
        { "key": "movie", "label": { "l1": "Movie", "l2": "Película" }, "icon": "🎬",
          "template": "Ok Ron, let's meet at the theater for {spot}.",
          "sets": { "activity": "movie", "spot": "movie-plan" } } ] } ] },

    { "id": "b3", "speaker": "ron",
      "line": [ { "id": "b3-l1", "when": { "activity": "dinner" },
                  "template": "{spot} sounds perfect." },
                { "id": "b3-l2", "when": { "activity": "movie" },
                  "template": "{spot} sounds fun." } ] },

    { "id": "b4", "speaker": "bobby",
      "choiceSets": [ { "id": "b4-s1", "options": [
        { "key": "early", "label": { "l1": "Early", "l2": "Temprano" },
          "template": "Great, I'll see you {time}.", "sets": { "time": "early" } },
        { "key": "late",  "label": { "l1": "Later", "l2": "Más tarde" },
          "template": "No problem, let's say {time}.", "sets": { "time": "late" } } ] } ] }
  ]
}
```

Note `b2`'s options read `{spot}`, which they themselves set. This is **legal** and deliberate: read scope for an option includes that option's own `sets` (§5.1). Without it, an author must write "a nice dinner" twice — once in the option's own line and once as `spot`'s surface form — and the two copies can drift.

---

## 5. Resolution semantics

### 5.1 The walk — one algorithm, three projections

This is the load-bearing invariant of the whole design. The build-time enumerator and the browser must never be able to disagree about which line is spoken.

```
walk(conversation, choices | EXHAUSTIVE, opts) -> WalkStep[]

A : Assignment = Record<VarName, ValueKey>      // variables written so far

S = [ {} ]                                       // the set of live assignments
for beat in conversation.beats:                  // array order is timeline order
    for a in S:
        if this session has already stopped (a PENDING beat was reached):
            emit step(beat, status = 'unreached', alternativeId = ABSENT)
            continue                                 // one step per beat, always
        alt = the unique alternative of `beat` matching `a`      // proven by §5.2
        if beat is a choice beat:
            if choices[beat.id] is defined and is an option of `alt`:
                chosen = that option ; S' += a ⊕ chosen.sets
            else if opts.autoPick:
                chosen = alt.options[0] ; S' += a ⊕ chosen.sets   // marked auto-picked
            else:
                chosen = PENDING ; stop this session after emitting
            emit step(beat, status = chosen is PENDING ? 'pending' : 'resolved', a, alt, chosen)
        else:
            emit step(beat, status = 'resolved', a, alt)
            S' += a
    S = S'
```

**The walk emits exactly one step for every beat, for every live path** (amendment C3, scoped by E6). A walk that stopped early would force `resolveTimeline` to synthesise steps for the remaining beats, and that is a second implementation of the timeline — the thing §5.1 exists to forbid and AC-DOM-14 tests against. An `unreached` step carries no `alternativeId` and an empty assignment; nothing about it is rendered, and `resolveTimeline` reads its status rather than inventing content.

**The step count is a function of the mode, and the invariant is about beats per path, not about a total** (amendment E6). An earlier revision said "one step for every beat", which is true of a session projection and *false* of the exhaustive one:

| Mode | Steps per beat | Fixture total |
|---|---|---|
| `session` (one recorded choice set, no fan-out) | exactly **1** — the path never forks | **10** |
| `session` + `autoPick` | exactly **1** | **10** |
| **`exhaustive`** (`reachableVariants`, used by bake) | one per **(beat, live path)**; a choice beat contributes one per (incoming path × matching option) | **77** |

Fixture breakdown, exhaustive: `b1` 1 · `b2` 2 · `b3` 2 · `b4` 4 · `b5` 4 · `b6` 8 · `b7` 8 · `b8` 16 · `b9` 16 · `b10` 16 = **77**, from **16** terminal assignments.

The invariant that actually matters, and the one AC-DOM-14 asserts: **for any path, no beat is skipped, and `resolveTimeline` never produces a beat the walk did not visit.** The total step count is a derived quantity and must never be asserted as a constant in a test — 16 terminal assignments for the fixture, 4 for the 4-beat worked example, and the totals follow.

⚠ **Reported as 65 and measured as 77.** The M1a escalation reported 65 exhaustive steps for the fixture; I measured 77 by running the committed `runWalk(c, {}, 'exhaustive')`, with the per-beat breakdown above, and 10 for each session mode. The breakdown sums consistently and the 16 terminals match the expected `2⁴`. Flagged as an open item rather than reconciled here, because if the implementation were emitting 65 it would be dropping 12 steps — the same class of defect as the variant-key collision, and worth confirming rather than assuming.

Three projections of exactly that code:

| Function | Mode | Used by |
|---|---|---|
| `resolveTimeline` | one session, `autoPick` flag | the app |
| `deriveVariables` | one session, recorded choices only | tests, debug UI |
| `reachableVariants` | EXHAUSTIVE (all options taken at every choice beat) | `bake` (D6) and all source validation |

**Consequences, all testable (AC-DOM-14):** a change to a `when` clause or an `sets` block changes the validator, the enumerator and the app identically; there is no second implementation of the timeline to drift. The Engineer implements the walk once.

**Variant-key computation happens against the walk's assignment.** For a fixed-beat alternative, the assignment is `a`. For an option, the assignment is `a ⊕ option.sets` (§5.1's self-read rule — this also applies to **ghost** options, each resolved against the beat's incoming `a` with its *own* `sets` applied, so a ghost shows what would actually have been said).

### 5.2 `when` matching

`when` matches assignment `a` iff for every `(n → v)` in `when`, `a[n] === v`. A variable absent from the clause is unconstrained. An unwritten variable matches nothing, so `when: { cuisine: "chinese" }` correctly fails to match when `cuisine` was never written.

For every beat and every reachable assignment at that beat, **exactly one** alternative must match. This is proven by the exhaustive walk, not assumed:

- zero matches → `E_NO_MATCH` (build error)
- two or more matches → `E_AMBIGUOUS_MATCH` (build error; "first wins" is forbidden)
- more than one `when`-less alternative per beat → `E_MULTIPLE_FALLBACK`
- a `when`-less alternative not last in its array → `E_FALLBACK_NOT_LAST`
- an alternative that matches on no reachable assignment → `E_DEAD_ALTERNATIVE` (build error; nearly always a typo in a `when`, which is otherwise invisible)
- at most one fallback alternative per beat is permitted

### 5.3 Variant keys

```
variantKey(beatId, parentId, slotNames, assignment) =
  [ beatId, parentId, ...slotNames.sort().map(n => `${n}=${assignment[n]}`) ].join('|')

parentId = Line.id     for a fixed-beat alternative (Line)
parentId = Option.key  for an option

e.g.  "b10|b10-l1"
      "b9|b9-l1|spot=movie-plan|time=early"
```

⚠ **AMENDED** (owner-approved). The previous form was `beatId + '|' + vars.join('|')`, which is **not injective**: two options in one beat with an empty read scope both produced `"b6|"`, and since `lines` is a `Record` keyed by variant key (§7.1), one record **silently overwrote the other**. `parentId` makes the key **injective by construction**, because `Line.id` is unique within a conversation and `Option.key` is unique within its beat (§4.3). The amendment also removes the cosmetic trailing `|` that an empty read scope used to produce.

**Why this was admissible:** the conversation had not been baked. `ron-bobby-01.json` did not exist, no variant key had been persisted, and no gloss key derived from one. After the first bake, changing the key composition would invalidate every record and every gloss key and would force a rebake plus a full re-review. This is a one-time correction; the formula is now frozen for the life of the schema.

Rules:

1. `parentId` is **required**, including for the single alternative of a fixed beat. Uniformity is the point: a rule with an exception is a rule that gets forgotten.
2. `slotNames` is the alternative's derived read scope, frozen into the generated artifact as data. **The runtime never parses a template.**
3. `sort()` is the default lexicographic sort with **no comparator** (UTF-16 code-unit order). Build and runtime must use the identical call. A divergence here makes every lookup miss — this is the single most dangerous detail in the file (AC-DOM-09).
4. A read variable is guaranteed non-null on every reachable path (§6.2), so `assignment[n]` is always defined. The runtime treats a missing value as a defensive throw in dev builds and `'null'` in production.
5. Two assignments that differ only in variables outside the read scope yield the **same** variant and therefore the same record. This is what collapses 16 sessions onto ~24 authored lines.
6. `parentId` prevents two *different* alternatives from colliding. It does not prove the walk cannot emit the same key twice, and that must never be trusted: **`E_VARIANT_KEY_COLLISION` is a permanent guard**, not a temporary one. A silent overwrite in a byte-writing build artifact is the worst failure mode this pipeline can have, and defence in depth costs one check.

### 5.4 Enumeration limits

`bake` and the validator fail rather than silently exploding:

| Constant | Value | Meaning |
|---|---|---|
| `MAX_VARIANTS_PER_BEAT` | 32 | distinct variant keys for one beat → `E_ENUM_LIMIT_VARIANTS` |
| `MAX_ASSIGNMENTS` | 4096 | terminal assignments in the exhaustive walk → `E_ENUM_LIMIT_ASSIGNMENTS` |
| `MIN_OPTIONS` | 2 | `E_CHOICE_OPTIONS_MIN` |
| `MAX_OPTIONS` | 8 | `E_CHOICE_OPTIONS_MAX` (UI guard, D4) |

Sessions grow as 2^decisions; **authored lines grow additively**. The 10-beat spec has 4 decisions → 16 sessions, ~24 variants (D6 owns the final count).

### 5.5 Worked variant accounting

For the 4-beat example in §4.4, along with the provisional 10-beat figures. **Provisional: D6 owns the final narrative and therefore the final counts.**

| Beat | Kind | Reads (incl. self-set) | Variant keys | Why |
|---|---|---|---|---|
| b1 | line | — | 1 | nothing read |
| b2 | choice | `spot` (self-set, bound to `activity`) | 2 | one record per option |
| b3 | line | `activity`, `spot` | 2 | `spot` is bound to `activity` → one degree of freedom, not two |
| b4 | choice | `time` (self-set) | 2 | one record per option |
| — | — | **4-beat example total** | **7** | from **4** terminal assignments |
| b1 | line | — | 1 | |
| b2 | choice | `spot` (self-set) | 2 | |
| b3 | line | `spot` | 2 | the story bends at the first opportunity |
| b4 | choice | `cuisine` \| `genre` (self-set) | 4 | 2 choice sets × 2 options |
| b5 | line | `cuisine` \| `genre` (one per alternative) | 4 | 2 + 2 across alternatives |
| b6 | choice | `time` (self-set) | 2 | |
| b7 | line | `time` | 2 | |
| b8 | choice | `who` (self-set) | 2 | |
| b9 | line | `spot`, `time`, `who` | **8** | `spot` bound to `activity` → 2 × 2 × 2 |
| b10 | line | — | 1 | |
| — | — | **10-beat total** | **28** | from **16** terminal assignments |

This table is normative for the shipped content and **must agree with D6 §11.2**, which owns the prose. It was refreshed at freeze time (amendment C10) after drifting from D6 by one revision: b3 reads `spot` (README §core loop step 4 promises that "Ron's next line refers to dinner or the movie"), and `who` is read at **b9**, not b10.

Binding matters for cost: if `spot` were an independent variable rather than bound to `activity`, b9 would cost 16 variants instead of 8. If `who` were read at b10 instead of b9, the total would be 26.

The README's §Branching claim survives intact: 4 decision beats × 2 options = **8 authored option templates** (D6's spec has 10 options, because beat 4 offers two *when*-scoped pairs of two). The remaining records are fixed beats with conditional alternatives (b5) and multi-variable lines (b9), and they are not hand-written 16 times.

---

## 6. Variable discipline

### 6.1 No dead variables (`E_DEAD_VARIABLE`)

Every declared variable must be **written** by at least one `Option.sets`, and **read** by at least one `when` clause or template slot.

⚠ **DIVERGES FROM README** §First milestone, where beat 8 writes `who` and no beat reads it. PM ruling Q5: `who` must be read, or be replaced by a variable that is. D6 §11.1 resolves it: `who` is read **twice** — by b8's own option templates (a self-read) and by b9. The validator enforces the rule either way; a cosmetic choice is not shippable.

**A self-read counts as a read** (§5.1). That is why the acceptance criterion is phrased as "deleting **every** read of `who`", not "deleting its downstream read" (amendment D1): with b8 self-reading, removing only b9's read would leave the variable legitimately read and `E_DEAD_VARIABLE` would correctly not fire.

`activity` is read only by `when` — that is a legitimate read (§2, "selector variable"), and it needs no `l1`. Conversely, if a variable is read by a template, **every** one of its reached values must have an `l1` (`E_MISSING_SURFACE_FORM`).

### 6.2 No reads of unset variables (`E_READ_UNSET`)

For every reachable assignment at a beat, for every alternative that matches it, every variable in that alternative's read scope must already be written — either before the beat (fixed lines, choice sets) or by the option itself (option templates; §5.1).

This is the rule that makes "read before write" impossible rather than merely unlikely. It is why `spot` cannot be referenced by beat 3 unless beat 2 always writes it, and it is the reason the self-read rule exists rather than an escape hatch.

### 6.3 Bound pairs — how `activity`/`spot` coherence is proven (`E_BOUND_PAIR_*`)

PM ruling Q5 requires `activity` and `spot` to agree. This doc discharges that obligation **structurally** rather than with a hand-maintained allow-list of pairs:

- **D-VAR-B1 (`E_BOUND_PAIR_SLOPPY`).** If two variables appear together in at least one option's `sets`, they must appear together in **every** option's `sets`. Intuitively: if any option writes both, no option may write one without the other, so no code path can ever produce a `movie`/`dinner-plan` mix.
- **D-VAR-B2 (`E_BOUND_PAIR_AMBIGUOUS`).** For each co-write group, the multiset of assigned tuples must be injective — two distinct options may not write the same tuple.

A co-write group contributes **one** degree of freedom to the variant space, which is why §5.5's b9 is 4 and not 8. The validator reports each group and its fan-out so an author can see the cost.

**Judgment call to confirm:** this proves agreement by construction. An explicit enumerated allow-list of `(activity, spot)` pairs would also satisfy Q5 and would additionally support *non-co-written* pairs (e.g. a value of `spot` computed from `time`). It costs an authored table and a fourth diagnostic. I chose the structural rule because it cannot go stale. If the owner prefers the allow-list, it is additive and I will add it in the freeze pass.

---

## 7. The generated artifact (`Conversation`) and provenance

### 7.1 Shape

```ts
type Conversation = {
  id: string; title: string; l1: Lang; l2: Lang;
  characters: Record<CharacterId, Character>;
  order: BeatId[];                                  // timeline order, explicit
  beats: Record<BeatId, BuiltBeat>;
  lines: Record<string /*variantKey*/, VariantRecord>;  // flat; keys are globally unique
  gloss: GlossIndex;
  meta: ConversationMeta;
};

type BuiltBeat = {
  id: BeatId; index: number; speaker: CharacterId; kind: 'line' | 'choice';
  hint?: string;
  alternatives: BuiltAlternative[];                 // source order preserved
};

type BuiltAlternative = {
  id: LineId | ChoiceSetId;
  when?: When;
  slotNames: VarName[];                             // FROZEN derived read scope
  options?: BuiltOption[];                          // choice beats only; labels live on options
};

type BuiltOption = {
  key: ChoiceKey;
  label: { l1: string; l2: string };
  icon?: string;                                    // copied verbatim from the source; decorative
  sets: Record<VarName, ValueKey>;
  slotNames: VarName[];                             // the variables this option's TEMPLATE reads
};
```

⚠ **`slotNames` is the template-read scope only — it does not include the option's own `sets`** (amendment E5). These are two different things and an earlier revision of this doc conflated them in a parenthetical:

| Concept | What it is | Where it is used |
|---|---|---|
| **the assignment used to resolve an option** | `a ⊕ option.sets` — the beat's incoming assignment with the option's own writes applied | §5.1's self-read rule: this is what makes `{spot}` resolvable inside the option that sets `spot` |
| **`slotNames` (the read scope)** | the variables the option's **template** actually reads | the variant key (§5.3) and therefore which records exist |

Including a self-set variable that the template never reads would be a defect, not a safety margin: it would produce one record per value of a variable that changes no text, multiplying MT and review cost for identical `l1`/`l2`. §5.3's own rule 5 is the general statement of this — *"two assignments that differ only in variables outside the read scope yield the same variant"* — and a self-set-but-unread variable is exactly such a variable.

In the shipped fixture the two definitions happen to coincide, because every option's template reads the variable it sets (`b2|dinner|spot=dinner-plan`). They diverge for a purely rhetorical option — one that sets `time` while its template never says `{time}` — and there the template-read definition is the correct one. AC-DOM-24 asserts it.

`lines` is keyed globally because every variant key is prefixed with its `beatId`.

There is **no precomputed `assignment → variantKey` table**. The runtime has `slotNames`, the walk's assignment, and one pure function. Baking the full table would duplicate §5.3 in data and could disagree with it; deriving it keeps one implementation.

`ConversationMeta` carries `reviewPolicy: 'shipping' | 'fixture'` (§7.2) alongside `sourceDigest`, which is a digest of the source file's **bytes** — so line endings are part of the contract (D3 §10 rule 7, D5 §10).

### 7.2 The variant record — provenance is first-class

```ts
type Reviewer = 'owner' | 'agent' | null;

type VariantRecord = {
  beatId: BeatId;
  alternativeId: LineId | ChoiceSetId;
  optionKey?: ChoiceKey;          // present iff this variant is an option's response line
  variantKey: string;
  l1: string;                     // rendered English — complete, slot-free
  l2: string;                     // Spanish — complete, slot-free; the only human-editable field
  mt: string;                     // the last machine translation of `l1` (immutable once written)
  sourceHash: string;             // sha256:v1:<hex> of `l1`
  reviewedBy: Reviewer;           // 'owner' = a human adjudicated THIS entry; 'agent' = triaged, unflagged
  translationRev: string | null;  // pinned model revision that produced `mt`; null in --author-only mode
  triageRef?: string;             // id of the review-agent flag entry that escalated this entry, if any
};
```

Derived, never stored: **`edited(record) = record.l2 !== record.mt`**.

| Rule | Code | Why |
|---|---|---|
| Release build requires `reviewedBy !== null` | `E_UNREVIEWED` | PM ruling Q1: CI fails on `null`. |
| `l2 !== mt` ⇒ `reviewedBy === 'owner'` | `E_EDITED_NOT_OWNER` | Only a human may change text. This is what makes "which lines did a human actually read" answerable forever. |
| `l2 === mt` ⇒ `reviewedBy ∈ {owner, agent}` | — | An owner may approve without changing; an agent may approve an unflagged draft. |
| `sourceHash` must equal the hash of the current render of `l1` | `E_SOURCE_STALE` | PM Q4/R4: staleness is detected from the authored English, and `bake:check` never overwrites `l2` or `mt`. |
| `translationRev` must equal the pinned revision in `meta` | `E_TRANSLATOR_REV_STALE` | R3: a distinct error code, so model churn is never confused with authoring churn. |
| every reachable variant key has a record | `E_VARIANT_MISSING` | §5.3. |
| no record is unreachable | `E_ORPHAN_VARIANT` | Pruned by D6, reported here. |
| no `{`, `}`, `${` in `l1`/`l2` | `E_L2_RESERVED_CHAR` | §8 INV-3. |

Because a hand edit is *detected* rather than *declared*, no author has to remember a flag: `mt` is written once by the machine and never rewritten by an edit, so `edited` stays true forever.

**`reviewPolicy` — how M1's content passes the gate honestly** (amendment F2). M1 ships a *fixture*: the conversation is real and playable, but no triage agent and no human have reviewed it. Stamping `reviewedBy: 'owner'` on it would assert a review that never happened — the exact claim the field exists to prevent.

| `meta.reviewPolicy` | `E_UNREVIEWED` | `E_EDITED_NOT_OWNER` | Additional rule |
|---|---|---|---|
| `'shipping'` | error | error | — |
| `'fixture'` | **warning** | **warning** | every record must still carry `reviewedBy: 'agent'` and `l2 === mt` |

**A fixture record claiming `reviewedBy: 'owner'` is an error, and it reuses `E_UNREVIEWED` with a distinct message** (amendment E4) — no new code. The registry is frozen at 49 codes, and a new entry is not worth it for a single case. The two messages:

```
E_UNREVIEWED  <path>  reviewPolicy is 'fixture': 'owner' claims a human review that did not happen
E_UNREVIEWED  <path>  reviewedBy is null
```

Both are the same *kind* of fault — a provenance claim that is not true — so one code with two messages is the honest grouping rather than a compromise. AC-DOM-10 asserts both.

**The fixture's translator provenance is a fixture identifier, not a commit SHA.** The committed fixture records `meta.translator = { en2romance: 'fixture-1', romance2en: 'fixture-1' }`, and every record's `translationRev = 'fixture-1'`. That keeps the invariant `(mt === '') === (translationRev === null)` true **without amendment** — `mt` is non-empty and `translationRev` is non-null — and `E_TRANSLATOR_REV_STALE` compares like with like and stays clean. So:

| `reviewPolicy` | `meta.translator.*` | Rule |
|---|---|---|
| `'shipping'` | a **pinned commit SHA** (D3 §10) | required; a non-SHA is an error |
| `'fixture'` | a fixture translator identifier (`fixture-1`) | must be *consistent*, is never required to be a SHA |

`reviewPolicy` is what makes that distinction safe — the same mechanism this section already uses for the review gate. AC-CONTENT-23 asserts it.

The policy is recorded in the artifact rather than inferred from a path, so it survives a file move and is visible in a diff. D6 §7.2 owns the bake-side behaviour, and the report prints the policy on every run so an unreviewed fixture can never be mistaken for reviewed shipping content.

### 7.3 Why English is the authored language and MT sees whole sentences

The source is English; `l2` is machine-drafted from the **complete rendered English sentence**. This is the mechanism behind hard requirement 2. Worked:

- `spot` = `dinner-plan` with surface form `a nice dinner`
- b9 template: `Perfect. See you Saturday {time} for {spot}.`
- b9 variant for `(spot=movie-plan, time=early)` renders English `Perfect. See you Saturday early for a new movie.`
- MT translates **that whole string**. Spanish agreement, article selection and word order are all decided on complete input — never by concatenating a translated noun into a translated frame, which is the failure the requirement names ("una buena *dinner*").

An authored noun with the wrong gender can therefore only enter the artifact by an owner edit, and owner edits are exactly the thing that is recorded.

---

## 8. The no-interpolation invariant, and how it is structurally enforced

The requirement is "no string interpolation inside translated (L2) text". This doc makes that a property of the *types*, not a rule in a document:

| | Invariant | Enforced by |
|---|---|---|
| **INV-1** | `ConversationSource` (template-bearing) and `Conversation` (slot-free) are different types in different files, and app code cannot import the source. | file layout + D5 lint rule (`no-restricted-imports` on `**/*.source.json`) |
| **INV-2** | `{`, `}` and `$` are reserved characters in templates, hints and labels. | `E_TEMPLATE_RESERVED_CHAR`, `E_HINT_SLOT`, `E_LABEL_SLOT` |
| **INV-3** | No rendered string — `l1`, `l2`, label or hint — ever contains `{`, `}` or `${`. | validator (`E_L2_RESERVED_CHAR`) **and** a test that walks all reachable sessions and asserts it over every resolved string (AC-DOM-08) |
| **INV-4** | Every template × reachable assignment has exactly one variant record. | `E_VARIANT_MISSING` / `E_ORPHAN_VARIANT` |
| **INV-5** | Nothing ships unreviewed. | `E_UNREVIEWED` |
| **INV-6** | Text changed by a human is attributable to a human. | `E_EDITED_NOT_OWNER` (§7.2) |

INV-1 is the structural one: an author *can* write a template in the source, but there is no code path from the browser to a template, because the app's module graph cannot reach the file and the type it would need contains no `template` field.

---

## 9. Span segmentation and the gloss index

⚠ **DIVERGES FROM README** §Translation §"Making MT behave like word-level hover" and §First milestone's "hover-translation". Locked decision 3 ships **zero translation code** in the browser, so clause-windowing cannot be a runtime algorithm. Per PM ruling C6 it moves into the build step, and the *segmentation* stays in the shipped domain module because hover must map a cursor position to a span offline.

### 9.1 One shared segmenter (R8)

```ts
type SegmentLevel = 'line' | 'sentence' | 'clause' | 'predicate';
type Span = { level: SegmentLevel; start: number; end: number; text: string; key: string };

function segmentL2(text: string, lang: Lang): Span[];   // all levels, ordered by start then level
function normalizeSpan(text: string): string;           // the gloss key
function resolveGlossSpan(spans: Span[], offset: number): Span | undefined;  // smallest span containing offset
```

`segmentL2` is pure and model-free. **The build step and the browser call the identical function.** If they ever diverge, every hover misses; therefore it is one module, and gloss keys are stored as normalized span *text*, never as offsets (offsets shift, text does not).

**The `lang` parameter selects the tables, and that is all it does** (amendment C7). It is not decorative:

| `lang` | Levels returned |
|---|---|
| the conversation's `l2` (`'es'` in M1) | all four: `line`, `sentence`, `clause`, `predicate` |
| **any other language** | `line` and `sentence` **only** |

`line` and `sentence` are language-neutral: the `line` level is the whole string, and the `sentence` level splits on `.` `?` `!` `…`, with the opening marks `¿` `¡` attaching to the following text — a rule that is simply inert in a language that has no such marks. `clause` and `predicate` are defined entirely by the Spanish word tables below, so for any other language they are **not returned**: an empty set rather than a wrong split. A caller that needs clause boundaries in a new language must add that language's three tables and bump `SEGMENTATION_VERSION` (§13).

The two real callers both work under that rule:

- the **gloss pipeline** only ever segments `l2`, so it always has all four levels;
- the **speech adapter** splits a long line at *sentence* boundaries (D3 §4.2.1) and therefore works for either channel — an English line splits correctly, and it never asks for a level English does not have.

### 9.2 Levels and rules

Split is applied in order; each result is emitted as a span at its level, and levels are nested (a `predicate` span is inside a `clause` span inside a `sentence` span inside the `line` span).

1. **`sentence`** — split on `.` `?` `!` `…`. Opening marks `¿` `¡` attach to the *following* text, so `¿Quieres … mañana?` is one sentence.
2. **`clause`** — split a sentence on `,` and on the connector table (below).
3. **`predicate`** — trim a leading bare connector and trailing adjuncts (adjunct-head table) from a clause, and trim a leading `¿`/`¡`.

The smallest span containing the hovered word wins (`resolveGlossSpan`), which is why the levels exist: it lets the author/agent fix a coarse gloss at the `clause` level and a precise one at the `predicate` level, and hover prefers precision.

**`CONNECTOR_SPLIT`** (split *before* these): `que`, `si`, `cuando`, `porque`, `aunque`, `mientras`, `como`, `donde`, `pero`, `sino`, `y`, `o`, `pues`.
**`PROTECTED_UNITS`** (never split across): `por qué`, `por qué no`, `a lo mejor`, `de repente`, `sin embargo`, `o sea`, `es que`, `tener que`, `ir a`, `acabar de`, `volver a`, `un poco`, `otra vez`.
**`ADJUNCT_HEADS`** (a trailing span beginning with one of these is trimmed off a `predicate`): `mañana`, `hoy`, `luego`, `después`, `esta noche`, `el sábado`, `el domingo`, `esta semana`, `a las`, `en`, `para`, `con`, `por`, `de`.

Because `¿por qué no…?` is a protected unit, the question survives clause splitting. Because `nos juntemos` is a `predicate` (the connector `que` was trimmed, and `mañana` is an adjunct), hovering `juntemos` in `¿Quieres que nos juntemos mañana?` resolves to **`nos juntemos`** — the README's own worked example.

**Scope discipline (PM ruling R9):** perfect segmentation is out of scope. Acceptance is a golden corpus of **≥20 fixed span boundaries** including `¿por qué no nos juntamos?` and `¿Quieres que nos juntemos mañana?` (AC-DOM-13).

### 9.3 Gloss key normalization

```
normalizeSpan(t) = NFC( trim( strip leading/trailing ¿¡?!.,;:…  and whitespace of
                             collapse-internal-whitespace( toLowerCase( t ) ) ) )
```

Consequences, all intentional: `Cena` and `cena` share one gloss (sentence-initial capitalization is not meaningful); accents remain significant; `¡Claro` and `claro` share one gloss.

**Known limitation, stated rather than hidden:** the index is flat — one gloss per span text, shared across every variant that produces it. An ambiguous span therefore gets one context-free rendering. This is the price of R8's dedupe, coverage and cache hits, and it is the right price for ~24 lines. The key type is an opaque string, so a future version can introduce a context-qualified key (`"nos juntemos@b4"`) without changing the type.

### 9.4 `GlossIndex`

```ts
type GlossEntry = {
  l1: string;                    // the English rendering of the span
  origin: 'mt' | 'authored';     // 'authored' = an override from glossary.es.json
  mt: string;                    // the last machine rendering (immutable once written)
  reviewedBy: Reviewer;          // 'owner' = a human adjudicated; 'agent' = triaged, unflagged
  triageRef?: string;
};
type GlossIndex = Record<string /*normalizeSpan(text)*/, GlossEntry>;
```

Rules:

- `origin === 'mt'` ⇒ `l1 === mt` (`E_GLOSS_EDITED_NOT_OWNER`). Edits are made by adding an override to `glossary.es.json`, never by touching the generated file.
- `origin === 'authored'` ⇒ `l1` may differ from `mt` (the authored file is human-owned).
- **Coverage is guaranteed by construction:** every span at every level of every variant's `l2` has an entry, because MT drafts every span (PM rulings Q1/Q6). `E_GLOSS_MISSING` is a build error, and a runtime miss is therefore unreachable (AC-DOM-12).
- Hover is fully offline and instant: it is a dictionary lookup in `Record<string, GlossEntry>`. No model, no network, no worker.
- Review gate: `reviewedBy` must be non-null in a release build (`E_UNREVIEWED`). D6 owns the triage workflow and the coverage report; this doc owns the record.

---

## 10. Session and operations

⚠ **DIVERGES FROM README** §Conversation data model, which defines `Session = { beatIndex, choices }` and mentions "Undo is `pop` and rewind".

```ts
type Session = {
  cursor: BeatId;                        // the beat presented as "now"
  revealed: BeatId;                      // furthest beat whose content is visible
  choices: Record<BeatId, ChoiceKey>;    // committed picks only
};

type SessionOp =
  | { type: 'choose'; beatId: BeatId; key: ChoiceKey }
  | { type: 'advance' }
  | { type: 'rewind' }
  | { type: 'reset' };

function reduce(c: Conversation, s: Session, op: SessionOp): Session;   // pure, total
```

**`reduce` is total and silent** (amendment C2). For a rejected op it returns the session **unchanged**; it does not throw and it does not log (AC-DOM-02 forbids logging). Rejection is observable only through `reduceChecked`, which lives in `src/domain/validate.ts` — a module the app scan root excludes (§13) and which nothing shipped imports, so it is never in the production bundle. The two share one implementation and `reduceChecked` returns the six dev diagnostics of the table below. `validateSession` covers `E_STALE_CHOICE` only.

**The initial session** is fully specified (amendment C4):

```
initialSession(c) = {
  cursor:   c.order[0],
  revealed: firstPendingBeat ?? c.order[c.order.length - 1],
  choices:  {},
}
```

`revealed` is the first beat that still needs a choice, so the transcript shows everything up to and including it — and at the initial session that is the first choice beat. `revealed` may *be* the first `pending` beat but never beyond it (see the invariants below).

Invariants: `index(cursor) <= index(revealed)`; values of `choices` are keys of options that are in the matched choice set at their beat for the assignment implied by the other choices; `revealed` is never beyond the first `pending` beat.

**Two operations, not three.** The PM's ruling Q3 describes a `swap` that clears downstream choices. That behaviour is here, but it is folded into `choose`: `choose` is the one operation that commits a pick, whether the pick is for the current beat or for an earlier beat in the "What if" flow. A separate `swap` op would differ from `choose` only in intent, and two spellings of one behaviour is how drift starts. The read-only "What if" view does not use `choose` at all (§11.3).

| Op | Behaviour | Diagnostics on rejection |
|---|---|---|
| `choose(beatId, key)` | Rejects if `key` is not an option of the choice set matching `beatId`'s current assignment. Sets `choices[beatId]`. **Clears** every `choices[b]` for `b` after `beatId` that is no longer an option of `b`'s newly-matched set, and clamps `cursor` **and** `revealed` to the first beat that is now `pending`. | `E_CHOOSE_INVALID_KEY`, `E_CHOOSE_NOT_CHOICE_BEAT` |
| `advance()` | `cursor = next` and **`revealed = max(revealed, next)`**. Rejected while the current beat is `pending`. | `E_ADVANCE_UNRESOLVED`, `E_ADVANCE_AT_END` |
| `rewind()` | `cursor` moves back one beat. `revealed` is **unchanged**, so progress stays visible. | `E_REWIND_AT_START` |
| `reset()` | Back to the initial session. | — |

**`advance` extends `revealed` monotonically, and that is not the same as moving it** (amendment C4). `rewind` deliberately leaves `revealed` alone, so a naive `revealed = next` would move it *backwards* on the first advance after a rewind — which would violate the invariant that a revealed beat's content is visible and resolvable. `max` is what makes rewind-then-advance idempotent with respect to `revealed`.

Clamping `revealed` on `choose` is what makes the transcript coherent after a re-pick: a beat whose variables changed is re-promptable, and there is never a `pending` beat sitting inside an already-revealed transcript. The cleared beats are the PM's Q3 requirement, expressed as one rule instead of a second op.

**Undo** is `rewind` (positional). The README's "pop and rewind" phrasing is satisfied: `choices` is the record, `cursor` is the position, and neither needs a history stack because both are fully determined by the current session.

**Stale choices are impossible, not merely handled.** Because the only writer is `choose` and it clears what it invalidates, a well-formed session never contains an invalid choice. Defensively, `resolveTimeline` treats an invalid recorded choice as `pending`, and `validateSession()` reports `E_STALE_CHOICE` in dev builds only.

---

## 11. `resolveTimeline`

```ts
type BeatStatus = 'resolved' | 'pending' | 'unreached';
type ResolveOptions = { autoPick?: boolean };

function resolveTimeline(c: Conversation, s: Session, o?: ResolveOptions): ResolvedBeat[];

type ResolvedLine = { alternativeId: LineId | ChoiceSetId; variantKey: string;
                      l1: string; l2: string; hint?: string };

type ResolvedOption = {
  key: ChoiceKey;
  label: { l1: string; l2: string };
  line: ResolvedLine;                  // resolved with THIS option's own sets applied (§5.1)
  sets: Record<VarName, ValueKey>;
  chosen: boolean;
  ghost: boolean;                      // in the matched set, not chosen
  previewable: true;                   // Q7: every option may be heard before committing
};

type ResolvedBeat = {
  beatId: BeatId; index: number; speaker: CharacterId; kind: 'line' | 'choice';
  status: BeatStatus;
  hint?: string;
  line?: ResolvedLine;                 // kind 'line' and status 'resolved'
  options?: ResolvedOption[];          // kind 'choice'
  chosenKey?: ChoiceKey;
  autoPicked?: boolean;                // true only under autoPick
};
```

### 11.1 Statuses

- `resolved` — the beat's content is determined. For a choice beat, a registered or auto-picked choice exists.
- `pending` — a reachable choice beat with no committed choice, under `autoPick: false`. The walk stops producing content here.
- `unreached` — every beat after the first `pending`. Content cannot be determined, so `line` and `options` are absent.

`resolveTimeline` returns **every** beat, in order, with a status. It does not filter by `revealed`; rendering is D4's concern.

The three statuses are exactly the walk's, not a re-derivation (amendment C3): §5.1 emits one step per beat, and an `unreached` step is a *status* on a step that exists, not a beat the walk skipped. `resolveTimeline` is a lookup over the walk's steps — it never invents a step for a beat the walk did not visit, which is what keeps AC-DOM-14's single-implementation claim true. Beat 1 of an empty session is `resolved` because a fixed beat is always resolvable, so the first `pending` beat is the first *choice* beat.

### 11.2 Ghosts

For a `resolved` choice beat, `ghost: true` on every option of the matched set except `chosenKey`. Ghosts are *derived* from the matched set, never stored — which is why a ghost's line is stable after a later re-pick only if its own matched set is stable, and why a reader can always replay the road not taken (README §core loop step 3). Replaying a ghost must not alter the session: it is a read of `ResolvedOption.line`, and no op exists that a replay could call.

### 11.3 `autoPick` — the read-only "What if" view

Under `autoPick: true`, a choice beat with no committed choice selects `options[0]` of its matched set, marks the beat `autoPicked: true` and the option `chosen: true`, applies its `sets`, and the walk continues. The whole timeline resolves in one pass.

The "What if" view (README §core loop step 6, PM ruling Q3) is then a pure projection:

```ts
whatIf(c, baseSession, beatId, key) =
  resolveTimeline(c, { ...baseSession, choices: { ...baseSession.choices, [beatId]: key } }, { autoPick: true })
```

with the UI badging `autoPicked` beats "auto-picked". Because `choose`'s stale-clearing is not involved, the read-only view needs no new state and no new op — it is one call to a pure function.

---

## 12. `visibility()` and the three channels

The three channels are the README's §three text channels: **hint** (authored L1 scaffolding, never translated), **dialogue** (the L1/L2 line), **gloss** (a span rendering from §9). They are orthogonal.

```ts
type Channel = 'l1' | 'l2' | 'both' | 'none';

type Preferences = {
  read: Channel; hear: Channel; hint: boolean;
  speed: number;                 // 0.5 … 1.5, default 1.0 (speed handling owned by D3/D4)
  voiceOverrides: Partial<Record<CharacterId, Partial<Record<Lang, string>>>>;   // Q13
  playAnyway: boolean;           // G1 escape hatch: play L2 with a mismatched default voice
};

type Visibility = {
  showL1: boolean; showL2: boolean; showHint: boolean;
  playOrder: Lang[];             // length 0..2; ['es','en'] when hear === 'both'  (Q8)
};

function visibility(p: Preferences): Visibility;
```

**The signature takes `Preferences` and nothing else** (amendment C5). An earlier revision accepted a `ResolvedBeat` that the derivation never read: `showL1`/`showL2`/`showHint` come from `read`/`hint`, and `playOrder` comes from `hear`. AC-DOM-19 asserts all 32 inputs with no beat, and `noUnusedParameters` would reject a parameter that is never used. The two carve-outs below *feel* beat-dependent — an option label, a textless beat row — but they are presentation rules about how a beat row is *rendered* given the flags, so they belong to D4 §5.3, not to this derivation.

Derivation (this is the whole truth table; 4 × 4 × 2 = 32 states, asserted by AC-DOM-19):

| Input | `showL1` | `showL2` | `playOrder` |
|---|---|---|---|
| `read: 'l1'` | ✅ | ❌ | from `hear` |
| `read: 'l2'` | ❌ | ✅ | from `hear` |
| `read: 'both'` | ✅ | ✅ | from `hear` |
| `read: 'none'` | ❌ | ❌ | from `hear` |
| `hear: 'l1'` | from `read` | from `read` | `['en']` |
| `hear: 'l2'` | from `read` | from `read` | `['es']` |
| `hear: 'both'` | from `read` | from `read` | `['es','en']` — **L2 first**, PM ruling Q8 |
| `hear: 'none'` | from `read` | from `read` | `[]` |
| `hint: true` | from `read` | from `read` | `showHint: true` |

Three constraints the **renderer** must apply on top of this derivation. They are stated here because they are consequences of the semantics, not visual choices, and they are implemented in D4 §5.3 — **none of them is an input to `visibility()`**, which is why the function takes `Preferences` alone:

1. **Option labels always render in at least L1** (PM ruling Q7), regardless of `read`. Rendering a chooser with unreadable buttons is a broken state, not a sparse one.
2. **`read: 'none'` + `hear: 'none'` does not skip a beat.** The beat still occupies a transcript row. A silent, textless beat is a legitimate state (the transcript is the app), and skipping beats would desynchronise `revealed` from the visible transcript. D4 owns what the row looks like.
3. **`hint` text is authored L1 only**, is not affected by `read`, and is never translated.

**Cross-doc boundary (PM Flag D).** `playOrder` is the *order* — semantics. All *timing* (the 400 ms inter-language gap, inter-beat gaps, prefetch depth, interruption and cancellation rules) is D4's, recorded once there. It is easily flipped to L1-first and D4 notes where.

---

## 13. Canonical constants

Canonical *semantic* constants and the diagnostic registry live here; D2 is their single home.

| Key | Value | Notes |
|---|---|---|
| `SCHEMA_VERSION` | `1` | recorded in `Conversation.meta`; a mismatch is `E_SCHEMA_VERSION` |
| `SEGMENTATION_VERSION` | `1` | recorded in `meta`; changing any §9.2 table invalidates every gloss key and requires a rebake |
| `SOURCE_HASH_PREFIX` | `"sha256:v1:"` | prefixed so a future scheme change is not read as mass staleness (§7.2) |
| `MAX_VARIANTS_PER_BEAT` | `32` | §5.4 |
| `MAX_ASSIGNMENTS` | `4096` | §5.4 |
| `MIN_OPTIONS` / `MAX_OPTIONS` | `2` / `8` | §5.4 |
| `DEFAULT_SPEED` | `1.0` | §12 |
| scan root for app code | declared in `tools/scan-excludes.json` (the single machine-readable copy; D5 reads it) | INV-1's lint boundary; D5 owns the mechanism. The bake program lives in `tools/**` (D6 §2.1), which is outside the scan root, so no bake path needs an exception. |

Asset and model numbers (sizes, dtypes, revisions, licenses) are **D3's**. The 10-beat content counts are **D6's**. Timing constants are **D4's**. Nothing in this table is duplicated in those docs; they reference the keys.

---

## 14. Diagnostic registry

One registry, cited by D5 (CI), D6 (bake) and the Engineer's tests. `severity: error` fails the build; `warn` reports only; `dev` is asserted in development and never ships.

**Every code is spelled out in full on its own row.** No slash shorthand, no implied `_SUFFIX` compression: D5's CI greps these codes literally, and a code that exists only as an implied suffix is a code that cannot be grepped. `src/domain/types.ts`'s `DiagnosticCode` union is the machine-readable mirror and must contain exactly these strings.

| Code | Sev | Raised by | Meaning |
|---|---|---|---|
| `E_SCHEMA` | error | source | shape/type violation anywhere |
| `E_SCHEMA_VERSION` | error | generated | `meta.schemaVersion !== SCHEMA_VERSION` |
| `E_DUPLICATE_BEAT_ID` | error | source | two beats share an id |
| `E_DUPLICATE_LINE_ID` | error | source | two `Line`s share an id |
| `E_DUPLICATE_CHOICE_SET_ID` | error | source | two `ChoiceSet`s share an id |
| `E_DUPLICATE_CHOICE_KEY` | error | source | two options in one beat share a key |
| `E_DUPLICATE_VAR` | error | source | two variables share a name |
| `E_DUPLICATE_VALUE_KEY` | error | source | two values of one variable share a key |
| `E_BEAT_ARITY` | error | source | neither or both of `line` / `choiceSets` |
| `E_TEMPLATE_RESERVED_CHAR` | error | source | `{` `}` `$` used outside a well-formed `{varName}` |
| `E_UNKNOWN_SLOT` | error | source | `{x}` where `x` is not a declared variable |
| `E_UNKNOWN_VAR` | error | source | `sets`/`when` reference an undeclared variable |
| `E_UNKNOWN_VALUE` | error | source | `sets`/`when` reference an undeclared value key |
| `E_NULL_WRITE` | error | source | a `sets` value is `null` (README beat 2) |
| `E_EMPTY_WHEN` | error | source | `when: {}` — use omission for a fallback |
| `E_LABEL_SLOT` | error | source | a slot in a label **or in an option icon** (label-class; one code, reused) |
| `E_HINT_SLOT` | error | source | a slot in a hint |
| `E_LABEL_MISSING_LANG` | error | source | a label lacks `l1` or `l2` |
| `E_MISSING_SURFACE_FORM` | error | source | a template reads a variable whose reached value has no `l1` |
| `E_CHOICE_OPTIONS_MIN` | error | source | fewer than `MIN_OPTIONS` options in a choice set |
| `E_CHOICE_OPTIONS_MAX` | error | source | more than `MAX_OPTIONS` options in a choice set |
| `E_NO_MATCH` | error | walk | a reachable assignment matches no alternative (§5.2) |
| `E_AMBIGUOUS_MATCH` | error | walk | a reachable assignment matches two or more alternatives (§5.2) |
| `E_MULTIPLE_FALLBACK` | error | source | more than one `when`-less alternative in a beat |
| `E_FALLBACK_NOT_LAST` | error | source | a `when`-less alternative is not last |
| `E_DEAD_ALTERNATIVE` | error | walk | an alternative matches no reachable assignment |
| `E_DEAD_VARIABLE` | error | source | never written, or never read (incl. `who`) |
| `E_READ_UNSET` | error | walk | a read variable can be unset at that point |
| `E_BOUND_PAIR_SLOPPY` | error | source | a co-write group is written together in some options only (§6.3) |
| `E_BOUND_PAIR_AMBIGUOUS` | error | source | a co-write group assigns the same tuple twice (§6.3) |
| `E_ENUM_LIMIT_VARIANTS` | error | walk | more than `MAX_VARIANTS_PER_BEAT` variants for one beat |
| `E_ENUM_LIMIT_ASSIGNMENTS` | error | walk | more than `MAX_ASSIGNMENTS` terminal assignments |
| `E_VARIANT_KEY_COLLISION` | error | bake | two variant specs produced the same key — **never overwrite** (§5.3 rule 6) |
| `E_VARIANT_MISSING` | error | bake | a reachable variant key has no record (§7.2) |
| `E_ORPHAN_VARIANT` | warn | bake | a record is no longer reachable; removed only with `--prune` |
| `E_UNREVIEWED` | error / warn | bake:check | `reviewedBy === null` on a line or gloss — or, under `reviewPolicy: 'fixture'`, a record claiming `reviewedBy: 'owner'` (distinct message, same code; amendment E4) |
| `E_EDITED_NOT_OWNER` | error | bake | `l2 !== mt` without `reviewedBy === 'owner'` |
| `E_GLOSS_EDITED_NOT_OWNER` | error | bake | `origin: 'mt'` but `l1 !== mt` |
| `E_SOURCE_STALE` | error | bake:check | `sourceHash` no longer matches the render of `l1` |
| `E_TRANSLATOR_REV_STALE` | error | bake:check | `translationRev` ≠ pinned revision, including the mixed-null case (D6 §7.2) |
| `E_GLOSS_MISSING` | error | bake | a span at any level of any variant's `l2` has no entry (§9.4) |
| `E_ORPHAN_GLOSS` | warn | bake | a gloss key appears in no variant |
| `E_L2_RESERVED_CHAR` | error | bake | INV-3 |
| `E_CHOOSE_INVALID_KEY` | dev | session | the key is not an option of the matched choice set (§10) |
| `E_CHOOSE_NOT_CHOICE_BEAT` | dev | session | `choose` applied to a fixed beat (§10) |
| `E_ADVANCE_UNRESOLVED` | dev | session | `advance` while the current beat is `pending` (§10) |
| `E_ADVANCE_AT_END` | dev | session | `advance` at the final beat (§10) |
| `E_REWIND_AT_START` | dev | session | `rewind` at the first beat (§10) |
| `E_STALE_CHOICE` | dev | session | defensive; unreachable if §10 holds |

Two families of codes raised by the bake program belong to **D6** and are deliberately **not** in this table, so the `DiagnosticCode` union is exactly the set the source and generated-artifact validators can raise:

- `E_SENTINEL_IGNORED` — phase 0: the `>>es<<` target token is not honoured (D6 §4.1);
- the `FLAG-*` family — flag-list validation (D6 §8.3);
- the `HINT-*` family — the authoring-quality hint rules that D6 §11.5 mechanises (length, echoing the line).

The line between the two registries: **D2 owns "structurally invalid"** (`E_HINT_SLOT`, `E_LABEL_SLOT`, `E_TEMPLATE_RESERVED_CHAR` — a slot in a hint is a schema violation), and **D6 owns "not good enough to ship"** (a hint that is too long, or that paraphrases the dialogue). The split is why `E_SENTINEL_IGNORED` staying out of this table is correct rather than an oversight.

D6 owns the *commands* that emit the bake-side codes and the workflow around them; this doc owns their meaning. D5 owns the runner's typing of the union.

---

## 15. Acceptance criteria (`AC-DOM-*`)

D1 references these ids; they are stable and must not be renumbered.

| ID | Criterion |
|---|---|
| **AC-DOM-01** | `ConversationSource` and `Conversation` are separate types; no module reachable from `index.html` imports a `*.source.json` (lint-asserted). |
| **AC-DOM-02** | `resolveTimeline` and `reduce` are pure: no DOM, `fetch`, `Date`, `Math.random`, or module-level mutable state. Same inputs → deep-equal outputs. |
| **AC-DOM-03** | Over the exhaustive walk, exactly one alternative matches at every beat for every reachable assignment; a constructed counterexample raises `E_NO_MATCH` and another raises `E_AMBIGUOUS_MATCH`. |
| **AC-DOM-04** | Fallback discipline: ≤1 `when`-less alternative per beat, and it is last. |
| **AC-DOM-05** | No dead variables: the shipped conversation validates clean, and deleting **every** read of `who` — its self-read in b8's option templates *and* its read in b9 — makes `E_DEAD_VARIABLE` fire. A self-read counts as a read (§5.1), so removing only the downstream read must *not* fire it. |
| **AC-DOM-06** | No read of an unset variable; an option reading a variable it sets itself is valid and produces a variant. |
| **AC-DOM-07** | Bound-pair coherence: `activity`/`spot` are one co-write group; a mutated source that writes `activity` alone raises `E_BOUND_PAIR_SLOPPY`, and one that writes the same tuple twice raises `E_BOUND_PAIR_AMBIGUOUS`. |
| **AC-DOM-08** | No `{`, `}` or `${` appears in any string returned by `resolveTimeline` across all reachable sessions (INV-3). |
| **AC-DOM-09** | Every reachable variant key resolves to exactly one record, and `variantKey` computed at build time equals `variantKey` computed at runtime **for every reachable session of the conversation under test**. The count is a property of the conversation, not of this criterion: 16 for the shipped 10-beat fixture, 4 for the 4-beat worked example. |
| **AC-DOM-10** | Provenance: `reviewedBy: null` fails the check; a record with `l2 !== mt` and `reviewedBy !== 'owner'` fails the check. Under `meta.reviewPolicy: 'fixture'` both are **warnings**, and `reviewedBy: 'owner'` is an **error** — emitted as `E_UNREVIEWED` with its distinct fixture message, asserted separately from the null message (§7.2). |
| **AC-DOM-11** | Staleness: editing an authored English template makes exactly the affected variants report `E_SOURCE_STALE`, and check mode writes nothing. |
| **AC-DOM-12** | Every span at every level of every variant's `l2` has a gloss entry; a deleted entry raises `E_GLOSS_MISSING`. |
| **AC-DOM-13** | `segmentL2` passes a golden corpus of ≥20 span boundaries, including `¿por qué no…?` as one protected unit and `nos juntemos` resolving from `¿Quieres que nos juntemos mañana?`. For a language with no tables, only `line` and `sentence` spans are returned (§9.1). |
| **AC-DOM-14** | One walk, three projections: `resolveTimeline`, `deriveVariables` and `reachableVariants` agree on a property test that mutates `when`/`sets`. Per path, no beat is skipped: the walk emits one step per (beat, live path), including `unreached` steps with no `alternativeId`, and `resolveTimeline` never produces a beat the walk did not visit. **No test asserts a total step count** — 10 per session mode and 77 for the fixture are derived, and the fixture's 16 terminals are the only stable number (§5.1). |
| **AC-DOM-15** | `choose` clears every downstream choice invalidated by the new assignment and clamps `cursor` and `revealed` to the first now-`pending` beat. |
| **AC-DOM-16** | `advance` is rejected while the current beat is `pending`; when accepted it sets `cursor = next` and `revealed = max(revealed, next)`, so rewind-then-advance never moves `revealed` backwards. |
| **AC-DOM-17** | Ghosts equal the matched set minus the chosen key; replaying a ghost changes no session field. |
| **AC-DOM-18** | `autoPick` selects `options[0]`, marks `autoPicked`, and resolves the full timeline; the "What if" projection needs no session mutation. |
| **AC-DOM-19** | `visibility()` is asserted over all 32 `Preferences` inputs and takes no beat argument, including `['es','en']` for `hear: 'both'`. The label-degradation and textless-row carve-outs are D4 §5.3 presentation rules, not part of this derivation. |
| **AC-DOM-20** | Enumeration limits fire with the exact codes at 33 variants and 4097 assignments. |
| **AC-DOM-21** | Every `error` code in §14 has at least one test that triggers it. The six session codes are triggered through `reduceChecked` (§10), since `reduce` returns the session unchanged and raises nothing; `E_STALE_CHOICE` is triggered through `validateSession`. **This criterion is about coverage of a code *set*, not about a single unit**, so it is legitimately satisfied across two test projects: the source/walk codes in `domain/diagnostics.spec.ts` and the pipeline-only `E_SOURCE_STALE` in `bake/provenance.spec.ts` (amendment E8). `tools/ac-map.json`'s `tests` array is designed for exactly this, and `check:ac-map` requires at least one test per due id, not exactly one. |
| **AC-DOM-22** | Option icons are label-class: literal (a slot raises `E_LABEL_SLOT`), never sent to MT, never carrying `reviewedBy`, never present in `lines` or `gloss`, and absent from `ConversationSource` entirely if no option has one. |
| **AC-DOM-23** | `initialSession(c)` is exactly `{ cursor: order[0], revealed: firstPendingBeat ?? lastBeat, choices: {} }`, and the invariants of §10 hold for it. |
| **AC-DOM-24** | `BuiltOption.slotNames` is the **template-read scope only**: an option that sets a variable its template never reads produces exactly one record regardless of that variable's value, while an option that reads a variable it sets produces one record per value of that variable (§7.1). A constructed option with a self-set-but-unread variable yields one key, not two. |

---

## 16. Cross-doc notes — what I expect D3–D7 to push back on

| Doc | What it inherits from D2 | What it must not restate |
|---|---|---|
| **D3** | `Utterance`/`TtsEngine` operate on a **variant's `l2` string**, never a template. `VoiceId` is the authored `Character.voice`. The M1 engine's capabilities are declared, not implied (G1/G2). | variant keys, provenance, `visibility` |
| **D4** | `visibility()` and its three carve-outs; `ResolvedBeat`/`ResolvedOption` including `ghost`/`previewable`/`autoPicked`; ghost replay is a read. D4 owns **all timing**, including the 400 ms gap — I deliberately did not put that number here. | schemas, `when`, variant keys |
| **D5** | INV-1's lint boundary (§13 scan root); `bake:check` is CI's default mode; the diagnostic codes CI greps for. | semantics of any code |
| **D6** | the four file paths; the walk's exhaustive mode; the variant/gloss record shapes; `SEGMENTATION_VERSION` invalidation. D6 owns the pipeline, the CLI, and the 10-beat content. | the walk's semantics, the record invariants |
| **D7** | §2's vocabulary is the canonical glossary; D7 indexes it rather than restating it. | term definitions |

**Open items for the owner** — all additive, none blocking a D2 freeze unless rejected:

1. §6.3 — bound-pair rule vs an explicit `(activity, spot)` allow-list (my recommendation: bound pair).
2. §4.3 — `E_DEAD_ALTERNATIVE` is an *error*; a `when` clause that can never match is usually a typo, but this forbids intentional future-proofing.
3. `MAX_OPTIONS = 8` is a UI guard, not a semantic limit.
4. §11.1 — `revealed` is never beyond the first `pending` beat. If D4 wants a transcript that keeps later beats visible while the cursor is behind, that must come back here, because it changes §10's clamping rule.
5. §9.2 — the three word tables are canonical content. They will grow as D6 authors the real Spanish, and each change is a `SEGMENTATION_VERSION` bump plus a rebake of every gloss key.
