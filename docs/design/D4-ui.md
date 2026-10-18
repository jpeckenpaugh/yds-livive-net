# You Don't Say — UI (D4)

> **Status:** ✅ Frozen · **Amended:** 2026-10-18 (shell, pair, list, completion, playback, chrome localization — §16–§19)
> **Owner:** Designer · **Reviewer:** Project Manager
> **Purpose:** The interface contract. Component tree, the store, the presentation matrix, every interaction state, **all playback sequencing and timing**, the choice-card interaction, the choice-blind fix, the degraded-audio state machine, keyboard and accessibility, the About/Licenses surface, **the shell and its screens, the learner's language pair, and chrome localization**.
> **Depends on:** D2 (`visibility()`, `ResolvedBeat`, session ops, the three carve-outs) · D3 (capabilities, the `PlaybackController` interface, the G1/G2 facts, licenses) · D6 (nothing here is authored content)
> **Owns:** the component tree, the shell/routing contract, the presentation half of the toggle matrix, **every timing constant**, the scheduler, all interaction states, keyboard map, a11y conformance, the About/Licenses surface, chrome localization, `AC-UI-*`, `AC-I18N-*`
> **Related:** D7 (module map) · D5 (test harness, mock `speechSynthesis`, a11y tooling)

**Precedence.** Locked decisions > `docs/design/D2`–`D7` > `README.md`. Deliberate disagreements carry a **⚠ DIVERGES FROM README** marker; a disagreement with the PM contract carries a **⚠ DIVERGES FROM D1** marker.

**Ownership line (PM Flag D).** D3 owns the `PlaybackController` **interface**. **This doc owns every sequencing rule and every timing number.** D2 owns `visibility()`'s 32→{show/play} derivation; **this doc owns what those flags look like.**

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| Component tree, store shape, state transitions | Domain semantics, `resolveTimeline`, `visibility` → D2 |
| Presentation for every presentation-flag combination | Engine internals, cache keys, model facts → D3 |
| **All timings**: inter-language gap, inter-beat gap, prefetch depth, animate-in | The bake pipeline and authored content → D6 |
| Choice-card interaction: pick, preview, ghost replay, re-pick | Build config, lint, CI, test harness → D5 |
| G1/G2 surfaces, degraded states, About/Licenses | Module topology → D7 |
| Keyboard, focus, a11y conformance | — |
| Shell/routing, the language pair, the list, completion, playback, chrome localization (§16–§19) | — |

**Amended surfaces.** §1–§15 are the original conversation screen. §16–§19 add the shell and the three screens it routes, the learner's language pair, whole-conversation playback, persistence, and chrome localization; all of them are built and tested. **⚠ DIVERGES FROM D1** §3, whose MVP OUT list still excludes "more than one conversation" and specifies no onboarding or catalog surface — the owner is amending D1 and this doc records the surfaces as built. See §16.

**Visual design is not this doc's job.** No palettes, no type scale, no spacing. This doc fixes *states and behaviour*; anything a state document does not require is free.

---

## 2. The one rule that governs the rest

**The UI is a pure function of `resolveTimeline` plus the engine's declared capabilities.** It does not re-derive what a beat says, whether a choice is legal, what plays in what order, or which options are ghosts. Every one of those is D2's. The UI's job is to render, to collect input, and to schedule audio.

Consequence worth stating because it is where UI work usually goes wrong: **if a component wants a fact the domain does not expose, the response is to request a domain change, not to compute it locally.** Several of D2's resolved fields (`autoPicked`, `chosen`, `ghost`, `previewable`, `status`) exist precisely so the UI never has to infer them.

---

## 3. Component tree

```
<App>                                  store provider: session + preferences + audio
├─ <SkipToContent>                     keyboard-only
├─ <Transport>                         play/pause · replay · prev/next · beat N of M
│    └─ <AudioStatus>                  the single polite role="status" (§12)
├─ <Toolbar>                           three independent controls
│    ├─ <ReadChannelControl>           radio group: L1 | L2 | both | none
│    ├─ <HearChannelControl>           radio group: L1 | L2 | both | none
│    ├─ <HintToggle>                   switch
│    ├─ <SpeedControl>                 slider, D2's range
│    └─ <VoiceAndAboutMenu>            → <VoiceOverridesDialog> · <LicensesDialog>
├─ <AudioNotice>                       G1/G2 state, non-modal (§9)
├─ <Transcript>                        ordered list; one <BeatRow> per revealed beat
│    └─ <BeatRow>                       ← repeated
│         ├─ <SpeakerLabel>
│         ├─ <HintLine>                 when showHint
│         ├─ <DialogueLine lang={l2}>   when showL2  → <Glossable> spans
│         ├─ <DialogueLine lang={l1}>   when showL1
│         ├─ <L2NotSpokenMarker>        G1 degraded only
│         ├─ <ChoiceCards>              pending choice beat only
│         │    └─ <OptionCard>          label + icon (decorative) + <PreviewButton>  ← repeated
│         ├─ <GhostOptions>             resolved choice beat
│         └─ <UnreachableTailNote>      when this beat was invalidated by a re-pick
├─ <WhatIfPanel>                       end of conversation only
├─ <GlossPopover>                      anchored to a hovered/focused/tapped span
└─ <LicensesDialog> · <VoiceOverridesDialog> · <KeyboardHelpDialog>
```

M1 ships every component above except `WhatIfPanel`'s non-M1 parts (`WhatIfPanel` itself **is** in M1 — README §core loop step 6). `L2NotSpokenMarker`, `UnreachableTailNote` and `AudioNotice` are small but load-bearing: each represents a state that the design would otherwise be silently wrong about.

This tree is the **conversation screen**. It is now reached through a shell that owns two more screens — `<Welcome>` and `<Conversations>` — which sit *above* `<App>` (§16.1). The shell is additive: this tree, and `<App>`'s contract, are unchanged, which is why the existing tests still render `<App>` directly.

---

## 4. Store

```ts
type Store = {
  session: Session;                 // D2 §10 — the only mutable domain state
  prefs: Preferences;               // D2 §12
  playback: PlaybackState;          // §6.4, UI-local, never persisted
  notices: NoticeState;             // §9, derived from engine capabilities + voice availability
};
```

**Hand-rolled `useReducer` + context** (PM ruling Q10). Three reducers, one provider, no new dependency:

| Reducer | Actions | Notes |
|---|---|---|
| `sessionReducer` | the four D2 `SessionOp`s | Delegates to D2's `reduce`. Contains **no** domain logic of its own. |
| `prefsReducer` | channel/flag/speed/voice-override changes | Persisted to `localStorage` as a whole-object write on change. One key. |
| `playbackReducer` | transport queue (§6.4) | Never persisted; rebuilt from session on load. |

`prefs` **is** persisted (`read`, `hear`, `hint`, `speed`, `voiceOverrides`, `playAnyway`) — a learner who sets "hear L2, read nothing" should not re-set it every visit. `session` is **not** persisted in M1 (README §First milestone: no persistence across devices, and a mid-conversation restore is a feature, not a default). `playAnyway` is persisted but never *set* by the app (§9).

**Amended:** the store context also carries the resolved **messages** as `t` (§18.7), read from the catalog for `<App>`'s `uiLang`. The shell owns the persisted state across screens (§16.5); this store remains the conversation screen's own state and gains nothing else.

---

## 5. Presentation matrix

### 5.1 Why this is 13 rows and not 32

D2 §12 maps all 4×4×2 = 32 preference states onto `{showL1, showL2, showHint, playOrder}` and asserts that mapping (AC-DOM-19). Presentation depends **only** on `{showL1, showL2, showHint}`, and audio depends **only** on `playOrder`. So this doc owns:

- 2³ = **8** presentation rows (§5.2)
- ≤5 `playOrder` cases (§6.1)

…and the equivalence to all 32 states is guaranteed by D2's function. A 32-row table here would be D2's table with a second copy that can drift. **The UI must call `visibility()`; it must not switch on `prefs.read` directly.** AC-UI-02 asserts the decomposition.

### 5.2 The eight presentation states

Everything below is a *beat row*; the toolbar and transport render independently.

| `showL1` | `showL2` | `showHint` | A beat row contains |
|---|---|---|---|
| ✅ | ✅ | ✅ | hint, L2 line, L1 line |
| ✅ | ✅ | ❌ | L2 line, L1 line |
| ✅ | ❌ | ✅ | hint, L1 line |
| ✅ | ❌ | ❌ | L1 line |
| ❌ | ✅ | ✅ | hint, L2 line |
| ❌ | ✅ | ❌ | L2 line |
| ❌ | ❌ | ✅ | hint, and a **silent beat row** — the speaker label and the hint. The row exists; it is not skipped. |
| ❌ | ❌ | ❌ | a **silent beat row**: the speaker label only. Still not skipped. |

`read: 'none'` never removes a row, because removing rows would desynchronise `revealed` from the visible transcript (D2 §12 carve-out 2). The row is the app; a textless row is a legitimate, deliberate state.

**Order within a row is fixed: hint, then L2, then L1.** L2 before L1 everywhere in the app, for the same reason `playOrder` is L2-first: attempt before answer. If a learner reads the English first they stop listening, which is the failure mode the whole project exists to avoid.

### 5.3 Carve-outs that override the table

Both come from D2 §12 and are *semantic*, not cosmetic:

1. **Option labels always render in at least L1**, at every `read` setting (PM Q7). A chooser with unreadable buttons is broken, not sparse.
2. **Glosses are always available on L2 text** regardless of `read` and `hint` — a gloss is a third channel (D2 §12), not a function of the other two. A learner with `read: 'l1'` and `hint: false` still gets to hover L2 words in the L2 line, because the L2 line is present only when `showL2`. **When `showL2` is false there is nothing to gloss on**: gloss is a rendering of L2 spans, so it is available exactly where L2 text is visible.

### 5.4 Speaker labels and turn structure

Each row carries a speaker label derived from `Conversation.characters[speaker].name`. Rows group visually by speaker so the turn structure survives with `read: 'none'`; the label is the only anchor that remains when both text channels are off.

---

## 6. Playback

### 6.1 Order

`playOrder` comes from D2 §12. M1 cases:

| `playOrder` | Sequence |
|---|---|
| `['es','en']` (`hear: 'both'`) | L2 utterance, gap, L1 utterance |
| `['es']` / `['en']` | one utterance |
| `[]` (`hear: 'none'`) | no audio |

**Hear=both is L2 then L1** (PM Q8) because attempt-before-answer is the premise. It is trivially flippable: the order is a single field in D2's `Visibility`, and this doc's only other dependency on it is §6.3's gap, which applies between any two utterances regardless of order. Recorded here so nobody re-derives it as a UI preference.

### 6.2 The scheduler

The UI never calls `TtsEngine` directly. It builds a **transport queue** of steps and hands it to `PlaybackController` (D3 §8):

```ts
type Step = { kind: 'speak'; lang: Lang; voiceId: VoiceId; text: string;
              beatId: BeatId; lineId: string };
```

`beatId`/`lineId` ride along because **utterance ≠ variant** (D3 §3.2): the engine deliberately does not know which line it is speaking, so "which line is playing" is answerable only because the scheduler attached it. This is the pre-registered D3 constraint, discharged here.

Only the scheduler builds steps. A component that wants audio calls a store action; it never assembles a queue, and it never passes a template-fragment string (D3's AC-ENG-04 stands behind this).

### 6.3 Timings — this doc is their only home

| Constant | Value | Meaning |
|---|---|---|
| `GAP_L2_TO_L1_MS` | `400` | Between the L2 and L1 utterances of one beat (PM Q8) |
| `GAP_POST_BEAT_MS` | `300` | After a beat's last utterance finishes, before an auto-advance |
| `GAP_AFTER_CHOICE_MS` | `300` | After a chosen response line finishes, before advancing |
| `ANIMATE_IN_MS` | `180` | The chosen line's animate-in; `0` under `prefers-reduced-motion` |
| `PREFETCH_AHEAD_BEATS` | `1` | M2 only; a **declared no-op** in M1 |
| `SPEED_MIN` / `SPEED_MAX` | `0.5` / `1.5` | D2 owns the range; D4 owns the steps |
| `MIN_TARGET_PX` | `24` | WCAG 2.2 SC 2.5.8 |
| `FOCUS_RESTORE_MS` | `0` | Focus restoration is synchronous; listed to say it is not animated |

No timer is ever used to *estimate* audio progress. Timers only ever separate utterances whose completion is known from the engine's `Utterance.play()` promise (D3 §3). This matters because M1 reports no duration.

### 6.4 Playback states and autoplay

```
idle ──play/dispatch──▶ playing ──utterance end + gap──▶ (advance) ──▶ playing
  ▲                        │                                            │
  └────stop / end─────◀────┘◀──── stop / user transport ◀───────────────┘
```

| State | Entered by | Behaviour |
|---|---|---|
| `idle` | load, stop, end of conversation | transport shows Play |
| `playing` | Play, a transport action, or an auto-advance | one queue; buttons are live; Next/Prev stop first |
| `pending-choice` | arrival at a choice beat with no committed choice | **autoplay pauses.** Cards are focusable; the beat's hint is shown. |
| `unavailable` | §9: no audio can be produced for the current step | the beat does not auto-advance; the learner drives with Next |

**Autoplay advances only when audio actually played.** If `playOrder` yielded no utterances — `hear: 'none'`, or the L2 channel is the only heard channel and G1 has disabled it — the beat does **not** advance on its own. There is no fabricated dwell timer, because a made-up duration is a lie about content the learner cannot hear. This one rule covers both `hear: 'none'` and the G1 degraded state, so there is no special case to get wrong.

Autoplay pauses at a `pending` choice beat. That is the only pause in the loop, and it is the entire interaction model (README §core loop step 2).

### 6.5 Interruption rules

| Event | Behaviour |
|---|---|
| `hear` changed | `stop()`, rebuild the queue, replay the current beat from its start |
| `read` changed | **no interruption.** Text re-renders; audio continues. |
| `hint` changed | no interruption |
| `speed` changed | `stop()`, replay the current beat (speed is in the cache key, D3 §7 — a change cannot reuse audio) |
| Next / Prev / Replay | `stop()`, then play the target |
| Pause | `stop()`; the **beat** is remembered, not a mid-line position (§6.6) |
| Window blur / `visibilitychange` to hidden | `stop()`. Audio must not play to an empty room, and `speechSynthesis` cannot be paused. |
| Option preview while something plays | `stop()`, then play the preview (§7.2) |

### 6.6 No mid-line resume (a direct consequence of D3)

⚠ **DIVERGES FROM README** §core loop, which implies continuous playback with a pause. Pause is **beat-granular**: `Utterance` (D3 §3) has `play`/`stop` and no position, and D3 §4.2.3 explicitly does not use `pause()`/`resume()`. So resume replays the current beat from its start.

This is recorded rather than worked around, because a mid-line resume would require a port change (a seekable utterance), and it is not worth a port change for M1. It is also honest about learning: replaying a whole line is the normal gesture in a listen-first reader.

**Two further M1 truths, pre-registered by D3, restated as UI obligations:**

1. **No "preparing audio", no spinner, no per-line progress bar in M1.** `prefetch: false` and `duration: false`. The transport shows *beat N of M*, never a time. A progress affordance may **not** be rendered unconditionally "because M2 will fill it in" — it must be capability-gated, so M1 does not ship a control that lies. AC-UI-24.
2. **`stop()` has a one-macrotask lag**, so a beat boundary is not frame-exact. The scheduler therefore serialises transport actions through **one queue**: a slow cancel can delay the next utterance, but it can never interleave two. Double-tapping Next is safe.

---

## 7. Choice beats

### 7.1 Pending

`ResolvedBeat.status === 'pending'`, `kind === 'choice'`. Rendering:

- the beat's hint, if `showHint` (the hint describes the *situation*, never the answer — D6 §11.5)
- option cards, one per `ResolvedBeat.options[]`, each with the label (always ≥L1, §5.3) and a preview control
- autoplay is paused; focus moves to the first card **only if** the learner arrived by keyboard (see §11.3 — no surprise focus moves)
- **the response lines are not shown.** A choice beat has no line of its own until chosen (D2 §11.1); the cards show labels, and the response text appears when it is spoken.

### 7.2 Preview — the choose-blind fix (PM Q7)

A listen-first app that asks the learner to choose between two sentences they cannot hear is broken. So every option card carries an explicit **preview** control which plays that option's `ResolvedOption.line` in the current Hear channel.

Rules:

1. **Preview never changes session state.** It is a read of `ResolvedOption.line`; no `SessionOp` exists that a preview could call (D2 §11.2).
2. **No auto-prefetch of options.** Prefetch budget stays one beat ahead (M2); prefetching 2–8 option audios would blow the step-to-step latency budget the README is proud of.
3. Preview is **interrupting** (§6.5): it stops current audio, including a previous preview.
4. Preview is available at `pending` **and** at `resolved` (a resolved beat's ghosts are the same mechanism).
5. Preview is never required. A learner who reads the labels and picks is not penalised.
6. In `unavailable` (§9), preview controls are present but disabled with a reason — not hidden, because hiding them would make the card look like it has no preview.

### 7.3 Choosing

1. The learner activates a card (click / tap / `1`–`8` / Enter).
2. `choose(beatId, key)` runs (D2 §10). It may clear downstream choices and clamp `cursor`+`revealed` (§7.5).
3. The response line animates in (`ANIMATE_IN_MS`), plays in `playOrder`, joins the transcript.
4. After `GAP_AFTER_CHOICE_MS`, `advance()`.

`choose` and `advance` stay **separate** ops in D2 so that the animation and the audio are presentation concerns rather than domain ones. The UI composes them; step 4 does not run if playback was stopped or the learner navigated away.

### 7.4 Ghosts

After a resolved choice beat, every other option of the matched set stays visible as a ghost (README §core loop step 3) with its label and a replay control.

- A ghost's line is `ResolvedOption.line` — resolved with **its own** `sets` applied (D2 §5.1), so a ghost reads as what would actually have been said.
- **Replaying a ghost changes nothing.** No op is invoked. This is asserted by AC-DOM-17, and this doc adds no action that could violate it.
- ⚠ **DIVERGES FROM README** §core loop step 3 in emphasis only: the README calls ghosts "the road not taken". Because a later beat's matched set depends on variables (D2 §5.2), the set of ghosts at beat 4 can differ entirely depending on beat 2's pick. Ghosts are therefore *the roads not taken **from here***, not a global alternative track. The global view is `WhatIfPanel` (§8).
- Ghost replay in M1 is **not instant**: `capabilities.cache` is false, so it re-synthesises. The control shows a busy state until the engine's promise settles — with no timer and no progress bar (§6.6).

### 7.5 The `revealed` clamp — decision recorded, not overruled

D2 §10 says `choose` clamps `cursor` **and** `revealed` to the first beat that is now `pending`, and D4 was asked to state the consequence and either accept it or escalate.

**Accepted, with the rationale recorded.** It is not a preference:

- After a re-pick at beat 2, **beats 5–10 are not merely stale, they are unresolvable.** Their templates read `cuisine`, `genre`, `time`, `who`; on the new path `cuisine`/`genre` may never be written, so `resolveTimeline` cannot produce their text at all (D2 §11.1, status `unreached`).
- Rendering them would mean rendering either stale text or invented text. Both are worse than showing less: the app's promise is that what you see is what is said.

**Consequences the UI must handle, stated plainly:**

| Consequence | UI response |
|---|---|
| The transcript shortens after a re-pick. | `UnreachableTailNote` at the clamp point: "2 later choices were reset because the earlier change changed them." Count, never content. |
| The learner loses later progress. | Accepted. Their picks may not exist in the new option set at all — beat 4's *choice set itself* changes with `activity` — so re-prompting is the only coherent behaviour, and re-walking three beats is cheap. |
| A learner may want to see the whole alternate conversation anyway. | That is exactly `WhatIfPanel` (§8), which resolves with `autoPick` and is read-only. The affordance exists; it is simply not the interactive transcript. |

**Escalation:** none. I do not think D2's rule should change, and I am not changing it. If D4 later wants a persistent "show the invalidated tail" affordance, it must come back to D2 as a new *read-only projection*, not as a change to `revealed` — because `revealed` is also what keeps the D2 §10 invariant (`revealed` is never beyond the first `pending` beat) true, and the whole session model depends on it.

### 7.6 Option icons — spec, and the render rule

The README's option cards carry an emoji tag ("🍽️ **Dinner**"). `Option.icon?: string` exists in the schema for exactly this (D2 §4.3), copied verbatim into `BuiltOption.icon`. It is **label-class** and **decorative**, and that word does all the work:

| Rule | Detail |
|---|---|
| Decorative | `aria-hidden="true"`, unconditionally |
| Never in the accessible name | the card's accessible name is the label (in the current `read` channel, or L1 per §5.3's carve-out). The icon adds nothing to it, and a screen-reader user loses no information. |
| Never load-bearing | no behaviour, state, or logic may key off an icon, and **the label text must stand alone**. If a card's meaning depends on its icon, the label is wrong. |
| Never translated, never reviewed | it is UI chrome like the label text (D2 §4.3) |
| Optional | absent is not a defect; a conversation with no icons is valid and renders as it does today |

The one visual rule this doc fixes: the icon is **not** the tap/click target and does not sit inside the `<button>`'s accessible name, but it may sit inside the button's box. Making it a separate control would create a second focusable thing per card that does nothing, which is worse for keyboard users than decoration.

This replaces my earlier "not representable → drop the emoji" recommendation, which the owner overruled on the grounds of a real affordance (a visual anchor in a listen-first app where the learner may be reading nothing), a concept document that already shows them, and the cost asymmetry: adding a decorative optional field now is nearly free, and adding it after the first bake is a schema change to a committed artifact.

---

## 8. `WhatIfPanel`

Reached after beat 10 resolves, or from the toolbar once the conversation is complete.

- Shows the four decisions with the picked option, and a control per decision to change it.
- Changing one calls D2 §11.3's pure projection: `resolveTimeline(c, {…choices, [beatId]: key}, { autoPick: true })`. **Read-only.** No session mutation.
- Every beat whose choice was auto-picked renders with an `autoPicked` badge (PM Q3) — visually distinct from a chosen beat, so the learner is never misled into thinking they made those picks.
- One action leaves read-only mode: **"make this real"**, which runs `choose(c, session, { beatId, key })` on the real session and returns to the interactive transcript, where D2 §10's clamp applies and `UnreachableTailNote` explains the reset. This is the only bridge between the two modes, and it is intentionally one-way.
- `WhatIfPanel` needs no new state and no new op — that is the whole payoff of D2's design.

---

## 9. Audio availability — the G1/G2 state machine

(PM: "G1 is a state machine, not a message.") Modelled as one derived state, recomputed whenever engine capabilities change, `voiceschanged` fires, or `playAnyway` changes.

```
                    ┌──────────────── engine-absent ◀── no speechSynthesis, M2 init failed
                    │                        │  (all audio unavailable; reading only)
                    ▼                        │
  voice-ok ◀──voiceschanged (L2 voice appears)│
      │  ▲                                   │
      │  └──── user picks "use the installed voice" ◀──┐
      ▼                                              │
  no-l2-voice ──── explicit toggle (playAnyway = true) ──▶ play-anyway
                                                          (default voice, L2 audio plays)
```

| State | Condition | UI |
|---|---|---|
| `voice-ok` | a voice can serve the L2 language | nothing shown; audio normal |
| `no-l2-voice` | `resolveVoice(_, l2) === null` and `playAnyway === false` (G1) | `AudioNotice`, **non-modal**, actionable: "No Spanish voice is installed on this device." L2 audio channel marked unavailable. Text and L1 audio unaffected. Preview controls disabled with a reason (§7.2). |
| `play-anyway` | as above, `playAnyway === true` | the notice becomes informational: the L2 line is being spoken with a mismatched voice. `L2NotSpokenMarker` is **not** shown (it is speaking). |
| `engine-absent` | no `speechSynthesis`, or M2 `init()` failed | all audio unavailable; every beat is `unavailable` (§6.4) and the learner drives with Next. Reading is unaffected. |

Transition rules:

1. **The app never sets `playAnyway` itself.** Only an explicit user action on the notice transitions into `play-anyway`. A fallback must never silently produce wrong-accent audio — that is the exact failure `README §TTS` cites as Supertonic's reason for existing (AC-ENG-07).
2. `voiceschanged` **re-evaluates on every fire** (D3 §4.2.2). `no-l2-voice → voice-ok` is automatic. `play-anyway → voice-ok` is offered, never automatic: the learner set that preference, and yanking it out from under them is worse than one extra click.
3. `engine-absent` is terminal for M1 (nothing can appear at runtime), but not modal: reading, the transcript and the What-if view all work.
4. Notice text never claims the audio is fine when it is not. It names the language, not the vendor.
5. The notice is dismissible per session but the *state* remains visible as a marker in the toolbar — a dismissed notice must not become a hidden failure.

### 9.1 G2 — the claim the UI may not make

`capabilities.preservesVoiceIdentityAcrossLangs === false` on M1 (D3 §4.4). The UI **must not claim**, imply, or iconographically suggest that a character sounds like one person across languages.

Concretely:

- The voice picker is labelled **per character and per language** and shows two independent rows. Its shape is the most honest possible statement of the deviation.
- No copy says "the same voice", "one voice", or shows a language-switch badge implying continuity.
- When the flag is `false`, the picker carries one line: "With the built-in voices, each language uses a different voice." When `true` (M2), that line is absent.
- AC-UI-15 asserts both directions: the copy renders at `false` and does not render at `true`.

### 9.2 `voiceOverrides`

D2 §12 relocated the per-language voice map out of the conversation and into `Preferences.voiceOverrides: Partial<Record<CharacterId, Partial<Record<Lang, string>>>>`. The UI (V3):

- one row per character × language, listing `voices(lang)` plus a **"Automatic"** entry
- "Automatic" means no override: D3 §4.3's heuristic runs, and the row shows which voice it resolved to, so the heuristic is never invisible
- clearing an override falls back to the heuristic without a confirmation step
- ⚠ **DIVERGES FROM README** §Conversation data model, which authored `voice: { en, es }` per character. That is now a *user preference*, not authored content, because locked decision 2 fixes one authored voice per character and the per-language split is a limitation of the M1 engine, not a property of the conversation.

---

## 10. Degraded states inventory

| State | Owner of the contract | UI behaviour |
|---|---|---|
| No L2 voice | D3 §4.4 (G1) | §9 |
| No `speechSynthesis` at all | D3 §4.2.4 | §9 `engine-absent` |
| No prefetch | D3 §4.1 | **nothing rendered** — no spinner, no "preparing" |
| No duration | D3 §4.1 | beat N of M; never a time, never a per-line bar |
| Storage full (`QuotaExceededError`) | D3 §9 | M2: non-fatal, download stops, size shown, "delete cached audio" offered |
| Cached models evicted | D3 §9 | M2: identical to "never downloaded"; re-download; a one-time "cached audio was removed" notice |
| M2 engine cannot init on this device | D3 §6.4 | `engine-absent` + the failing registry entry named, per D3's loud-failure rule |
| Cold start with no audio yet | — | the Play control is the gesture (see §11.3); no autoplay attempt before it |

M2 rows are specified here so the states exist before the features do. They are **not M1 work** (Q14) — but the persistence call and the state names are reserved, because retrofitting a degraded state into a UI that assumed success is how "fully offline" quietly becomes "broken".

---

## 11. Keyboard and interaction

### 11.1 Map

| Key | Action | Notes |
|---|---|---|
| `Space` | Play / Pause | not while a control has focus; never scrolls the transcript |
| `R` | Replay the current beat | |
| `[` / `]` | Previous / next beat | `[` is `rewind`; `]` is `advance` when the current beat is resolved |
| `1`–`8` | Pick option N at the current `pending` beat | inert when no beat is pending |
| `Shift`+`1`–`8` | Preview option N | |
| `H` | Toggle hint | |
| `G` | Toggle "gloss on focus" §11.4 | |
| `W` | Open / close `WhatIfPanel` | enabled only when the conversation is complete |
| `?` | `KeyboardHelpDialog` | |
| `Esc` | Close the topmost dialog, restore focus | |
| `Tab` / `Shift+Tab` | Logical order: transport → toolbar → transcript → panels | order follows the timeline |

In-app documentation: `KeyboardHelpDialog` renders this table. A keyboard map that exists only in a design doc does not exist.

### 11.2 Toolbar semantics

The two channel controls are **radio groups**, not toggles, because they have four mutually exclusive values (D2 §12's `Channel`). Each is a single tab stop with arrow-key navigation inside it (roving tabindex), which is the correct ARIA pattern and keeps `Tab` from spending four stops per control. The hint control is `role="switch"`. All three expose their current value in their accessible name.

### 11.3 Focus, gestures and the first-play gesture

1. **Autoplay is blocked until a user gesture.** Browsers require it, and `speechSynthesis` is gated similarly. So the first beat does not play on load: the transport's Play control is the gesture. The app loads in `idle` (§6.4) with everything visible.
2. **No surprise focus moves.** Arriving at a `pending` beat does not move focus (that would yank a screen-reader user out of the transcript). Focus moves only in response to the learner's own navigation (§11.1 `[`/`]`, or activating a card).
3. `prefers-reduced-motion: reduce` sets `ANIMATE_IN_MS = 0`; the chosen line appears without motion. Nothing else in the app animates.
4. Focus is never trapped except inside an open dialog.

### 11.4 Gloss access without a pointer

⚠ **DIVERGES FROM README** §intro ("Hover any word to see what it means"). Hover does not exist on touch devices and is not reachable by keyboard. D2 §9 specifies the *span* mechanics; this doc specifies access:

| Input | Behaviour |
|---|---|
| Fine pointer hover | gloss popover after `hover` on a span |
| Coarse pointer tap | tap a span → popover; tap elsewhere or `Esc` dismisses |
| Keyboard | the L2 line's spans are reachable as a **gloss list** — pressing `G` or activating the line reveals the line's spans as focusable items; activating one shows the same popover |
| Screen reader | the popover content is the accessible description of the span, so it is announced on focus without a popover |

The popover is `role="tooltip"`-like but must be dismissible and must not contain interactive content, which keeps it out of the focus-trap question entirely.

---

## 12. Accessibility (WCAG 2.2 AA)

| Requirement | Implementation |
|---|---|
| **The transcript is NOT an `aria-live` region** (PM Q12) | Auto-announcing lines during autoplay is hostile: it talks over the audio and the learner's own screen reader. |
| Exactly one polite status region | `AudioStatus`, `role="status"`, announcing **transport state only** ("Playing beat 3 of 10", "Paused"), updated **only** on user-initiated transport actions — never on autoplay transitions, never with dialogue text. |
| `lang` attributes | Every L2 block carries `lang={conversation.l2}` and every L1 block `lang={conversation.l1}`, so a screen reader switches pronunciation at the boundary. The audio engines already receive `lang` (D3 §3); this is the text-channel equivalent. |
| SC 1.2.1 (audio-only alternative) | The transcript **is** the alternative and it is on by default; per-channel toggles are learner settings, not content failures. Also, `speechSynthesis` output is generated rather than prerecorded, which puts the clause's application in question either way. Recorded so the position is deliberate. |
| SC 1.3.1 | `Transcript` is an ordered list; each `BeatRow` is a list item; controls are real `<button>`s and radio groups. |
| SC 1.4.3 / 1.4.11 | Text and control contrast at AA, including the ghosted state — **a ghost must remain readable**, since it is content, not disabled chrome. |
| SC 1.4.4 | 200% text zoom without loss of function; the toolbar wraps. |
| SC 1.4.12 | Text spacing overrides do not clip the transcript. |
| SC 2.1.1 / 2.1.2 | All of §11.1; no trap outside dialogs. |
| SC 2.4.3 | Focus order is timeline order. |
| SC 2.4.7 / 2.4.11 | Focus visible and never obscured by sticky chrome; focused transcript rows scroll into view. |
| SC 2.5.8 | `MIN_TARGET_PX = 24` on cards, previews, transport and toolbar segments. **Evidence: Playwright.** |
| SC 2.3.3 | Reduced motion honoured (§11.3). |
| SC 3.2.1 | Keyboard shortcuts are single letters; they are only active when no dialog is open and no control is capturing text, and the help dialog documents them so a shortcut can never be a surprise. |
| SC 4.1.2 | Accessible names state value and purpose, e.g. "Read: Spanish only". |
| Drag / motion / timing | No drag interactions. No time limits. Nothing flashes. |

### 12.1 Which requirement has which evidence source

`AC-UI-22` cannot be satisfied by one mechanism, because jsdom computes no layout and no colours. Stated explicitly so the Engineer does not claim a check it does not have (this is the split D5 §9.4 requested):

| Checked in **jsdom** (`vitest-axe`, the `ui` project) | Checked in **Playwright** (real Chromium, `@axe-core/playwright`) |
|---|---|
| 1.3.1 structure and relationships | 1.4.3 contrast of text, including ghosted options |
| 2.1.1 / 2.1.2 keyboard operability, no trap outside dialogs | 1.4.11 contrast of control boundaries and focus indicators |
| 2.4.3 focus order | 2.4.7 / 2.4.11 focus visible and not obscured by sticky chrome |
| 4.1.2 names, roles, values, including `lang` attributes | 1.4.4 the 200% zoom pass |
| 1.4.12 spacing overrides do not clip | 1.4.10 reflow |
| 2.3.3 reduced motion applied | 2.5.8 the 24 px target measurement |

The Playwright job additionally gives the real-browser smoke path and — because headless Chromium has no `es` voice — exercises the G1 `no-l2-voice` state on every run (D5 §9.4).

---

## 13. The About / Licenses surface

A `LicensesDialog` from the toolbar. D3 §6.7 owns the facts; this owns the surface, and it has **two jobs, not one**:

1. **Include the licences.** Supertonic weights (OpenRAIL-M), Supertonic code (MIT), the OPUS-MT models (Apache-2.0), and the M2 runtimes' own licences. Apache-2.0's "include the license text" is satisfied by shipping the licence files **and** listing them here. **No OPUS-MT attribution line is required** — Apache-2.0 with no upstream NOTICE — so none is added (PM A4).
2. **State OpenRAIL-M's use restrictions in plain language.** OpenRAIL-M is use-restricted, not merely attribution-required, so it must be surfaced as *restrictions*, in language a learner can read, not as a filename. This is the one licence in the set where "include the text" is insufficient.

**In M1 the surface names the licences, not the models or repos** (amendment E4). M1 ships no model weights at all, and naming Supertonic or the OPUS-MT repos would put exactly the strings `check:bundle` forbids into the emitted JS (D5 §6.3), making the gate permanently red with no permitted fix. So M1 renders three licence entries described by *purpose* rather than by product:

| M1 entry | Text | Why it is here in M1 |
|---|---|---|
| OpenRAIL-M — use-restricted | "planned speech engine (M3)" | The restriction must be surfaced before the weights arrive, not after |
| MIT | "UI framework" | Preact, actually shipped in M1 |
| Apache-2.0 | "build-time translation models" | The Spanish dialogue is machine-drafted with these, at build time |

Model names, repo ids and byte sizes arrive at **M3**, alongside the Downloads surface (D3 §9), where the bundle is allowed to contain them because the engine genuinely is in it.

Also: the app is offline and, in M1, downloads nothing. That is worth stating on this surface — it is the claim a learner is most likely to doubt.

---

## 14. Constants and AC IDs

All timings (§6.3) and the presentation table (§5.2) are canonical here. Nothing in this doc is duplicated in D2, D3 or D6, and this doc duplicates no domain semantic.

| ID | Criterion |
|---|---|
| **AC-UI-01** | The component tree in §3 exists; every component listed renders for M1, and no component invents domain logic (grep-asserted: no module under `src/ui/**` imports a `*.source.json` or a `ConversationSource` type). |
| **AC-UI-02** | The UI consumes `visibility()`; no component branches on `prefs.read`/`prefs.hear` directly, and presentation depends only on `{showL1, showL2, showHint}` (§5.1). |
| **AC-UI-03** | All 32 preference states render per §5.2, including the two silent-beat states where the row is present and empty of text. |
| **AC-UI-04** | Autoplay advances only when at least one utterance actually played; `hear: 'none'` and the G1 `no-l2-voice` state both require an explicit Next. |
| **AC-UI-05** | `hear: 'both'` plays L2 then L1 separated by `GAP_L2_TO_L1_MS`. |
| **AC-UI-06** | A `hear` or `speed` change stops and replays the current beat; a `read` or `hint` change never interrupts audio. |
| **AC-UI-07** | Pause is beat-granular; resume replays the current beat from its start. No mid-line resume is offered. |
| **AC-UI-08** | Transport actions serialise through one queue; a simulated slow `cancel()` cannot interleave two utterances. |
| **AC-UI-09** | Option labels render in at least L1 at every `read` setting, and are never hidden by any other setting. |
| **AC-UI-10** | A preview plays the option's line in the current Hear channel and leaves every `Session` field unchanged (asserted by a session snapshot before/after). |
| **AC-UI-11** | All unchosen options of a resolved choice beat remain visible and replayable; replay changes nothing. |
| **AC-UI-12** | No beat whose status is `unreached` is ever rendered as content; the invalidated tail appears only as a count in `UnreachableTailNote`. |
| **AC-UI-13** | `WhatIfPanel` resolves with `autoPick`, mutates no session state, badges every `autoPicked` beat, and offers exactly one exit ("make this real") that runs `choose`. |
| **AC-UI-14** | §9's four states and five transitions hold, including: `playAnyway` is never set by the app, and `voiceschanged` re-evaluates on every fire. |
| **AC-UI-15** | With `preservesVoiceIdentityAcrossLangs === false` the picker renders its two independent language rows plus the independence line; with `true` that line is absent. No string claims identity preservation. |
| **AC-UI-16** | `voiceOverrides` offers an "Automatic" row that shows the heuristic's resolved voice, and clearing an override needs no confirmation. |
| **AC-UI-17** | Every shortcut in §11.1 works, the help dialog documents the map, and `Esc` closes the topmost dialog and restores focus to its trigger. |
| **AC-UI-18** | `Space` and `[`/`]` do not scroll the transcript; no shortcut fires while a dialog owns focus. |
| **AC-UI-19** | There is no `aria-live` region containing dialogue, and exactly one `role="status"` exists, updated only on user transport actions. |
| **AC-UI-20** | Every L2 text node carries `lang` = the conversation's `l2` and every L1 node the `l1`. |
| **AC-UI-21** | Glosses are reachable by hover, by tap, and by keyboard, and are announced as the accessible description of the span (§11.4). |
| **AC-UI-22** | Automated a11y checks pass at AA on every screen and state. Two evidence sources, split per §12.1: jsdom (`vitest-axe`) for structure, ARIA, focus order and names; Playwright (`@axe-core/playwright`) for contrast, control boundaries, targets ≥24 px, 200% zoom and reflow. |
| **AC-UI-23** | `LicensesDialog` lists every licence and states OpenRAIL-M's use restrictions in plain language. **In M1 it names the licences, not the models or repos** (§13): no model name, no repo id, no engine name — because M1 ships no weights and naming them would put forbidden strings in the bundle (D5 §6.3). No OPUS-MT attribution line is present. |
| **AC-UI-24** | No "preparing audio" affordance, spinner, or per-line progress element exists anywhere in the M1 build; progress may only appear when the active engine reports `prefetch`/`duration`. |
| **AC-UI-25** | The first beat does not autoplay: the app loads in `idle` and the Play control is the required gesture. |
| **AC-UI-27** | Option icons render as decoration: `aria-hidden`, never part of a card's accessible name, never targeted independently, never load-bearing, and their absence is not a defect. |
| **AC-UI-26** | `prefers-reduced-motion: reduce` sets `ANIMATE_IN_MS` to 0 and no other motion occurs. |
| **AC-UI-28** | `<Shell>` owns exactly the three screens `welcome`/`list`/`conversation`; `<App>` remains the conversation screen with its §3 contract unchanged, so a test may render `<App>` directly with no shell; `main.tsx` stays the single composition root and passes the engine factory to `<Shell>` as a prop, and `<Shell>` constructs no engine (AC-ARCH-04). |
| **AC-UI-29** | The Welcome screen offers exactly two selects, labelled **I speak** and **I'm learning** (never primary/secondary); both option lists come from the catalog, so onboarding cannot dead-end; the first run shows **Start**, a later visit from the list shows **Save** plus **Cancel**; and choosing the same language for both is disallowed. |
| **AC-UI-30** | The learner's pair is projected onto the conversation's positional `l1`/`l2` with no domain change: `derivedPrefs` sets `read: 'both'` and `hear` to the study channel; changing the pair clears explicit prefs; and channel labels are derived from the conversation's actual languages, never hardcoded. For a reversed pair the §5.3 option-label carve-out means the learner's native channel, not the conversation's `l1`. |
| **AC-UI-31** | The list is filtered by pair; each entry shows title, `N of M beats · K of J decisions`, a thin progress bar, and `Complete — play it again` when every beat is revealed and every decision made; an empty pair shows an honest empty state; the pair switcher lives in the list header. |
| **AC-UI-32** | Completion is a state within the conversation screen, not a route: when every beat is `resolved` a panel renders above the transcript showing the chain of decisions (speaker + each option as a pill, the chosen one filled), where tapping the other option runs the same `choose` the transcript uses so downstream beats are re-derived by the domain, plus a primary **Play the whole conversation** control. |
| **AC-UI-33** | Compose and Play are modes of the same screen; in Play the completion panel and ghost options are hidden, the current beat is highlighted (`data-active`), and playback iterates the **resolved beat list** rather than re-reading the session cursor; Pause exits play mode. |
| **AC-UI-34** | Persistence uses key `yds.v1` and stores `seenWelcome`, `native`, `study`, `prefs` and `sessions` keyed by conversation id; it validates what it reads and falls back to defaults on any surprise, so a corrupt entry can never make the app unopenable; `<App>` gains optional `initialSession`, `onPersist` and `onBack`, and `onPersist` fires only when the session or prefs **reference** changed. |
| **AC-UI-35** | Option icons are resolved from the **owning beat's** built options by option key (keys are unique within a beat, not across a conversation), never by a conversation-wide search; `ResolvedOption` still carries no `icon`, which is a §2 violation to be closed by a D2 amendment (§19.2). |

**AC-UI-28..35** are the amendment's shell, pair, list, completion, playback, persistence and icon-lookup criteria. **AC-UI-09** is annotated in place (§16.3): "at least L1" means "at least the learner's native channel".

### 14.1 `AC-I18N-*` — chrome localization

The `AC-I18N-*` family is new with this amendment. It owns the app's **own** language, which is distinct from the conversation's content languages (owned by D6) and from the channel prefs (owned by D2 §12). Its full specification is §18.

| ID | Criterion |
|---|---|
| **AC-I18N-01** | Full chrome localization: the UI language is the learner's chosen native language, every chrome string renders from that language's catalog, and changing the pair re-renders the chrome without a reload. |
| **AC-I18N-02** | The catalogs are typed functions, not key lookups: a `Messages` type has one member per message, `en` and `es` catalogs implement it, and TypeScript enforces completeness, so a missing translation is a compile error rather than a runtime fallback. |
| **AC-I18N-03** | The plural-bearing messages named in §18.2 select their form from `count` through a catalog-local rule; the Spanish `unreachableTail` verb agrees (`se restableció 1 turno` / `se restablecieron N turnos`); no CLDR or plural-rules dependency is added. |
| **AC-I18N-04** | `audio-state.ts` returns a message identity plus parameters, never a finished sentence; the notice's language name is resolved by the catalog, so it is both localized and inflected. |
| **AC-I18N-05** | Language names are localized (English/Español), and a parameterized message resolves the name through the language-name message rather than assuming it is a bare noun. |
| **AC-I18N-06** | `document.documentElement.lang` follows the UI language; content spans keep their own `lang` per AC-UI-20. |
| **AC-I18N-07** | Licence identifiers and the use-restriction text are verbatim in every UI language; only the labels around them translate (AC-UI-23 is unaffected). |
| **AC-I18N-08** | `<App>` takes `uiLang` (default `'en'`) and exposes the resolved messages as `t` through the store context; at `uiLang: 'en'` the rendered chrome is unchanged, so the existing tests pass without modification, and any assertion that pins chrome copy resolves the expected string from the catalog rather than a literal. |

**⚠ Tooling gap this family exposes.** `tools/check-ac-map.mjs` scans the docs with `/AC-[A-Z]+-\d+/g`. `I18N` contains digits, so `AC-I18N-*` ids are **invisible to that scan**: they are neither required in `tools/ac-map.json` nor covered by it. The grammar must widen to `AC-[A-Z0-9]+-\d+` for the family to be indexed and enforced (D5 owns the tool; this is a one-character-class change plus the `tools/ac-map.json` entries). Until then the family exists in this doc but not in the gate, which is the exact "an id with no mapped test is not passing" failure D1 §6 warns about. The eight new `AC-UI-*` ids, by contrast, *are* seen and will fail `check:ac-map` until the Engineer adds them.

---

## 15. Cross-doc notes — pushback, and what should block M1

**Pushing back on D2 — nothing.** `Option.icon` was the one open schema question and it is closed: the field exists, it is label-class, and D2 §4.3 carries its treatment while this doc carries its render rule.

**Pushing back on D3 — two items, both now resolved in D3:**

1. **`resolveVoice` needed a `characterId`** (D3 §3.1.1, amendment C1). `voiceOverrides` is keyed by character, nothing forbids two characters sharing a `VoiceId`, and an adapter with only a voice id cannot honour an override. D4 §9.2's picker is only implementable against the amended signature. AC-ENG-22.
2. **The hash fallback** (D3 §7.7, amendment C8): `crypto.subtle` is absent in a non-secure context, which is a real case for a LAN preview, and M1's replay path needs a key either way. AC-ENG-03 now names both algorithms.

Everything else D3 pre-registered is absorbed without a change request: the four M1 constraints cost the UI a "preparing" state it cannot have, a duration it cannot show, an instant replay it cannot promise, and a frame-exact cut it cannot make. Each is handled by *not building* the affordance rather than by faking it, which is why AC-UI-24 exists.

**Pushing back on D6 — nothing.** D4 renders the resolved artifact and touches no content.

**On D1 — a recorded divergence, not a pushback.** §16–§19 specify surfaces that D1 §3's MVP OUT list excludes: a first-run language pair, a catalog-backed conversation list, a completion state and whole-conversation playback. They are built, tested and live. The owner owns the scope call and is amending D1; this doc records the surfaces, extends `AC-UI-*` in place (§14) and adds the new `AC-I18N-*` family, and does not re-litigate the milestone boundary. D1 must reference `AC-UI-28..35` and `AC-I18N-01..08` for `check:ac-map` to stay whole.

**Should this block M1?** One item only, and it is the `Option.icon` decision, because it is a schema question and schema changes get more expensive after the first bake. Everything else in this doc is additive implementation work with no cross-doc dependency. **No blocker for M1 beyond that decision.** The amendment's one open item is the `ResolvedOption.icon` gap (§19.2): it is a §2 violation and wants a D2 amendment, but the interim lookup is scoped and testable, so it does not block.

**Open items for the owner:**

1. §6.3 — `GAP_POST_BEAT_MS = 300`, `GAP_AFTER_CHOICE_MS = 300` and `ANIMATE_IN_MS = 180` are my invented defaults; they are one-line changes and worth tuning against real playback once M1 runs.
2. §11.1 — the letter shortcuts (`G`, `W`, `?`) are additions beyond the map you approved (Q12). Approved verbs; the letters are mine and are cheap to change.
3. §12 — I have taken the position that turning off Read is a learner setting rather than a WCAG 1.2.1 failure. If you want the stricter reading, the fallback is to make `read: 'none'` a warned state with an inline note rather than a silent one.
4. §7.6 — the ten icons themselves are content, owned by D6. If any of the ten is unimaginable for a learner, that is a one-line content change with no schema impact.

---

## 16. The shell, the pair, and the list

> **Amendment (2026-10-18) — surfaces added after the freeze.** The owner added a first-run language pair, a conversation list, a completion state and whole-conversation playback. All four are built, tested and live. §16–§19 specify them; §14 carries their criteria. **⚠ DIVERGES FROM D1** §3, whose MVP OUT list still excludes "more than one conversation" and specifies no onboarding or catalog surface. The owner is amending D1; this doc records the surfaces as built and does not re-litigate the scope call.

### 16.1 The shell and routing

`<Shell>` (`src/ui/Shell.tsx`) sits **above** `<App>` and owns three screens:

```
<Shell>                                  engine factory injected as a prop (AC-ARCH-04)
├─ <Welcome>                             screen 'welcome'       (§16.2)
├─ <Conversations>                       screen 'list'          (§16.4)
└─ <App>                                 screen 'conversation'  — the §3 tree, contract unchanged
```

| Rule | Detail |
|---|---|
| Three screens | `Screen = 'welcome' \| 'list' \| 'conversation'`. The initial screen is `'list'` when a pair is persisted, otherwise `'welcome'`; a missing `native` or `study` forces `'welcome'` regardless of the stored screen. |
| `<App>` is unchanged | It stays the conversation screen and keeps every prop and behaviour in §3–§13. The shell is **additive**, which is why the existing tests still render `<App>` directly and pass. |
| One composition root | `main.tsx` remains the single composition root (AC-ARCH-04): it constructs the engine factory and passes it to `<Shell>` as a prop. `<Shell>` constructs no engine; it forwards the factory to `<App>`. |
| Screens, not routes | There is no router and no URL change. The three screens are `useState` in the shell, so a reload returns to the stored screen. |

The shell is the only owner of persisted state; `<App>` reports snapshots upward (§16.5). Nothing in §3's tree changes.

### 16.2 Welcome

`<Welcome>` (`src/ui/screens/Welcome.tsx`) is the first run, and the place the pair is changed later.

| Element | Behaviour |
|---|---|
| **I speak** | A `<select>` over `nativeOptions()` — the learner's native language. The label is never "primary". |
| **I'm learning** | A `<select>` over `studyOptions(native)` — the study language. Re-derived when the native language changes; if the current study value is no longer offered it resets to the first option. The label is never "secondary". |
| Catalog-sourced | Both lists come from `src/data/catalog.ts`, so onboarding can only ever offer a pair that has content and can never dead-end on an empty list. With one authored conversation this still offers two real directions over the same content (`en → es` and `es → en`). |
| **Start** / **Save** | The first run (`!seenWelcome`) shows **Start**. A later visit, reached from the list's pair switcher, shows **Save** plus **Cancel** (`onCancel` is absent on the first run, so there is no Cancel back to a screen that does not exist yet). |
| Same language disallowed | The primary action is disabled unless `native !== '' && study !== '' && study !== native`. |
| Changing the pair clears prefs | Committing a pair resets `prefs` to `{}` (§16.3): the derived posture is a function of the pair, and an explicit choice made under the old pair must not leak into the new one. |

### 16.3 The pair projection

A conversation is authored in two languages, so **both directions are valid uses of the same content**. `en → es` and `es → en` are not two conversations; they are one conversation read from either end. `src/ui/language.ts` projects the learner's pair onto the conversation's **positional** `l1`/`l2`, which is why the domain needed no change at all.

| Function | Meaning |
|---|---|
| `isReversed(c, native)` | true when the learner's native language is the conversation's `l2`. |
| `nativeChannel(c, native)` | the channel carrying the learner's native language. |
| `studyChannel(c, native)` | the channel carrying the study language. |
| `derivedPrefs(c, native)` | `{ read: 'both', hear: studyChannel(c, native) }`. Reading both keeps the L2 text present, which is what makes the hover gloss reachable at all (§5.3). |

Two consequences the UI must honour:

1. **Changing the pair clears explicit prefs.** The positional channels swap meaning when the pair reverses, so a stored `hear: 'l2'` no longer denotes the same language. The shell resets `prefs` on every pair commit; the derived posture is re-applied. (Sessions are keyed by conversation id and are **not** cleared: a choice is a beat/option key, not a channel, so it survives the reversal.)
2. **Channel labels are derived, never hardcoded.** `channelsFor()` labels each radio from `langName(conversation.l1)` / `langName(conversation.l2)`, so a reversed pair reads correctly. Hardcoding "Spanish only" was a latent bug for `es → en`; the label now names the actual language.

**⚠ Annotation to AC-UI-09 / §5.3.** The carve-out says option labels always render in **at least L1**. Under the pair projection "L1" is positional, not the learner's language: for an `es → en` learner the native language is the conversation's `l2`. The carve-out's *intent* — a chooser whose buttons the learner can read — is satisfied by rendering the label in the learner's **native channel**. AC-UI-09 is annotated in place: "at least L1" means "at least the learner's native channel". This is a wording correction only; the id and the behaviour (never hide the readable label) are unchanged.

### 16.4 Conversations list

`<Conversations>` (`src/ui/screens/Conversations.tsx`) lists the conversations for the current pair.

- **Filtered by pair.** `conversationsFor(native, study)` returns every entry usable in either orientation. The list header carries the **pair switcher** — `langName(native) → langName(study) · change` — which returns to Welcome with Save/Cancel.
- **Per entry:** the title, `N of M beats · K of J decisions`, and a thin progress bar (`aria-hidden`, decorative; the counts carry the information).
- **When complete:** the meta line becomes **`Complete — play it again`**, where "complete" means every beat revealed **and** every decision made (`beatsRevealed >= beatsTotal && decisionsMade >= decisionsTotal`). The count is not a substitute for the state: a conversation whose last beat is a pending choice is not complete.
- **Empty state:** an honest line — "No conversations for *X* → *Y* yet. Try another pair." — never an empty list. Because the picker is catalog-sourced, this state is reachable only if the catalog changes underneath a stored pair.

`progressOf()` reads the stored session when one exists; with no session it reports the initial session (beat 1 revealed, no decisions), which is what the learner would see on opening it.

### 16.5 Persistence

`src/ui/persistence.ts` is deliberately tiny and **total**.

| Rule | Detail |
|---|---|
| One key | `yds.v1`. |
| Stored shape | `seenWelcome: boolean`, `native: Lang \| null`, `study: Lang \| null`, `prefs: Partial<Preferences>`, `sessions: Record<conversationId, Session>`. |
| Validate, never assert | `loadPersisted()` checks the shape of everything it reads — each session's `cursor`/`revealed`/`choices` and each choice's value — and **falls back to defaults on any surprise**. A corrupt entry must never make the app unopenable, because the only way out of that is clearing site data by hand. |
| One writer | The shell owns storage. `<App>` never touches `localStorage`; it reports snapshots upward. |
| `<App>` gains three optional props | `initialSession` (resume a composed session), `onPersist({ session, prefs })`, and `onBack` (render the back-to-list control). All three are optional, so the existing tests that render `<App>` without them are unaffected. |
| `onPersist` fires on reference change only | The effect compares the previous `session` and `prefs` **by reference** and returns early when neither changed. Without this the effect re-fires on every render — `onPersist` is a fresh closure on each shell render — writing, re-rendering the shell, and never settling. **This was a real bug: the page hung and clicks never returned.** |

`savePersisted()` swallows quota and private-mode failures; losing persistence is survivable, a thrown error mid-session is not.

---

## 17. Completion and playback

### 17.1 Completion state

Completion is a **state within the conversation screen, not a route.** When every beat's status is `resolved`, `<CompletionPanel>` renders **above** the transcript:

- The **chain of decisions**: one step per choice beat, the speaker's name and each option rendered as a pill; the chosen pill is filled and carries `aria-pressed="true"`.
- **Tapping the other option changes the decision.** It calls the *same* `choose` the transcript uses (`sessionOp({ type: 'choose', beatId, key })`), so the downstream beats are re-derived by D2's `reduce` and `resolveTimeline`, not by the component. D2 §10's clamp and `UnreachableTailNote` (§7.5) apply exactly as they do from a card.
- A primary **"Play the whole conversation"** control (§17.2).
- The panel is hidden in Play mode, because it is an editing surface and Play is a listening one.

This is the moment the learner actually authored, which is why it gets its own surface rather than a status line. It introduces no new session op and no new state: it is a rendering of the resolved timeline.

### 17.2 Playback mode

Compose and Play are **modes of the same screen** (`mode: 'compose' | 'play'`), not two screens.

| In Play | Detail |
|---|---|
| Completion panel hidden | It is an editing surface; Play is listening only. |
| Ghost options hidden | The composed conversation reads cleanly; ghosts are a compose-time affordance. |
| Current beat highlighted | The active row carries `data-active="true"`. |
| Iterates the resolved list | Playback walks `resolveTimeline(conversation, session)` **directly**, dispatching a `seek` per beat to keep the cursor and the highlight in step. It does **not** re-read the session cursor each step: the session is a render behind the `seek`, so reading the cursor played whichever beat it happened to be on before playback started — the wrong beat. |
| Pause exits | `stopPlayback()` stops the scheduler, sets `mode = 'compose'`, clears the active beat, and reports **Paused**. |
| Only when fully resolved | `playWhole()` refuses unless every beat is `resolved`; the control is offered only from the completion panel, which exists only in that state. |
| Inter-beat gap | After each beat's audio finishes, Play waits a gap before the next beat. It is not a fabricated duration (§6.4): it is the declared gap between known-complete utterances. **Open tuning item:** the built path uses `GAP_AFTER_CHOICE_MS` between every beat, but §6.3 defines `GAP_POST_BEAT_MS` for a plain beat and `GAP_AFTER_CHOICE_MS` for a chosen response; a fully-correct Play would pick by beat kind. Flagged rather than silently fixed. |

Play mode adds no scheduler mode. It reuses `playBeat` per beat with the same `visibility()` the compose path uses, so the only difference from composing is that nothing pauses for input.

---

## 18. Chrome localization

**Full chrome localization.** Picking a native language translates the app's own UI, not just the content. The UI language **is** the learner's chosen native language; there is no separate language setting. This section is the contract; its criteria are `AC-I18N-01..08`.

### 18.1 Catalogs as typed functions, not key lookups

A `Messages` type has **one member per message**. `en` and `es` catalogs implement it. TypeScript enforces completeness, so **a missing translation is a compile error, not a runtime fallback** — there is no `t('some.key')` lookup, no string key that can silently miss, and no English leak on a Spanish screen.

```ts
// src/ui/i18n/messages.ts
export type UiLang = 'en' | 'es';
export type Messages = {
  iSpeak: () => string;
  iAmLearning: () => string;
  conversations: () => string;
  beatCounter: (p: { index: number; total: number }) => string;
  unreachableTail: (p: { count: number }) => string;
  noVoiceFor: (p: { lang: Lang }) => string;   // the code, not a finished name
  // …one member per message
};
```

Messages are **functions**, not format strings: a message that needs a count or a language takes it as a parameter and owns the agreement (§18.2, §18.4). The `en` and `es` catalogs are plain objects satisfying `Messages`; a catalog missing a member fails `typecheck`.

### 18.2 Pluralization

Substitution is not enough, because agreement is not just the noun. Spanish needs the **verb** to agree: `se restableció 1 turno` but `se restablecieron N turnos`.

**Three messages in the shipped catalogs carry a count and require a plural form:**

| Message | What agrees | Example |
|---|---|---|
| `unreachableTail` | the noun **and the verb** | `1 turno se restableció` / `N turnos se restablecieron` |
| `completionLede` | the noun | `1 decisión tomada` / `N decisiones tomadas` |
| `listProgress` | two nouns (`beats`, `decisions`) | `1 de 1 turno` / `2 de 10 turnos` |

The beat counter (`Beat 3 of 10`) is deliberately **singular** in both languages — the number labels the current beat, it does not count a set — so it needs no plural form.

**Where the rule lives.** A one/other selector, `plural(count, one, other)`, lives beside the catalogs (`src/ui/i18n/plural.ts`) and is called *inside* the message functions. Both forms are therefore part of the function body and are type-checked; there is no separate message-table shape to keep in sync. **No CLDR and no plural-rules dependency is added** — the house rule forbids new runtime dependencies, English and Spanish both have a one/other rule, and a plural-rule engine for two languages and three messages is not worth a dependency.

### 18.3 `audio-state.ts` returns identities, not prose

`src/ui/audio-state.ts` currently returns finished English sentences (`notice: 'No Spanish voice is installed on this device.'`). It must return a **message identity plus parameters**, so the notice can be translated and so the language name inside it can itself be localized:

```ts
type MessageRef = { id: keyof Messages; params: Record<string, string | number> };
// AudioState.notice?: MessageRef; AudioState.action?: MessageRef;
```

- `no-l2-voice` returns `{ id: 'noVoiceFor', params: { lang: 'es' } }`, not a sentence.
- `engine-absent` returns `{ id: 'audioAbsent' }`; `play-anyway` returns `{ id: 'playAnywayNotice', params: { lang } }`.
- The **language name is grammar, not a noun.** `params.lang` is the **code**; the catalog resolves the display name through the language-name message (§18.4), so the notice inflects correctly in each UI language and the name is produced in the right form for its position in the sentence.
- The same rule applies to `L2NotSpokenMarker`, which currently hardcodes the English word "Spanish", and to the voice picker, which currently renders the bare code.

The state machine in §9 is unchanged; only its *output* changes from prose to an identity.

### 18.4 Language names

Language names are localized — `en` → "English"/"Español", `es` → "Español"/"English". `langName()` becomes a catalog-backed message (`languageName({ code })`) rather than a module-level English `Record`.

A **parameterized message must not assume the language name is a bare noun.** `noVoiceFor` takes the code and asks the catalog for the name, so a message can place it in a sentence ("No hay una voz de **español** instalada") without the caller having to know the grammatical form. Callers pass a code; only the catalog produces a name.

### 18.5 `document.documentElement.lang`

`document.documentElement.lang` follows the **UI language**, set by the shell when the pair is committed and on load. This is separate from content: every L2 block keeps `lang={conversation.l2}` and every L1 block keeps `lang={conversation.l1}` (AC-UI-20), so a screen reader pronounces the chrome in the learner's language and the dialogue in the conversation's. The markup already does the content half correctly; this clause adds the chrome half.

### 18.6 Licences

**Licence text stays verbatim in every UI language.** The licence identifiers (OpenRAIL-M, MIT, Apache-2.0) and the use-restriction statement are legal content, not chrome; they are not translated and not paraphrased. Only the **labels around them** translate: the dialog title, the offline statement, the button that opens the dialog, and each entry's purpose label. This keeps AC-UI-23's claims — the restriction is stated in plain language and no model/repo name appears — true in both languages.

### 18.7 Wiring: `uiLang` and `t`

- `<App>` gains an optional **`uiLang`** prop, defaulting to `'en'`.
- `<App>` resolves `messages = catalogs[uiLang]` once and exposes it through the **store context** as **`t`**. Components read `t.play()`, `t.beatCounter({…})`, and so on. No component reaches for a catalog directly, and no component holds a literal chrome string.
- Because the default is `'en'`, **the existing tests that render `<App>` without `uiLang` keep passing unchanged**: the rendered English is identical to today's literals.
- The shell passes the learner's `native` as `uiLang`.

### 18.8 Test consequence

Any assertion that pins chrome copy must resolve the expected string **through the catalog** — `t.play()` or the `en` catalog — rather than a bare literal. A literal is how a copy change silently passes in English and fails only when Spanish ships; a catalog reference keeps the assertion true in both languages. At `uiLang: 'en'` this is a mechanical substitution and changes no expectation's meaning.

---

## 19. Vocabulary, and the option-icon deviation

### 19.1 The UI says "Conversations"

The list screen and every label that names it say **"Conversations"**, never "Lessons". This matches the schema (`Conversation`), the catalog (`conversationsFor`), and the frozen docs; "lesson" survives only in the clean-room record's prose about third-party course material, where it belongs. A learner's authored version is a *conversation*, and the app should not introduce a second noun for it.

### 19.2 Option icons — the gap is still open

`Option.icon` / `BuiltOption.icon` exist (§7.6, D2 §4.3) but **`ResolvedOption` carries no `icon`**, so the UI cannot read it from the resolved beat it is rendering. The built implementation works around this by searching the whole conversation's built options for a matching key.

**This is a §2 violation, recorded rather than accepted.** The rule in §2 is explicit: if a component wants a fact the domain does not expose, the response is to request a domain change, not to compute it locally. The correct fix is a D2 amendment adding `icon?: string` to `ResolvedOption`, resolved with the option.

**The lookup rule until then** (and the rule any interim test must assert):

| Rule | Detail |
|---|---|
| Scope | Resolve the icon from the **owning beat's** built options by option key. |
| Why scoped | `Option.key` is unique **within a beat**, across all of its choice sets (D2 §4.3) — it is **not** globally unique. A conversation-wide search can return a different beat's icon whenever two beats reuse a key. |
| Current implementation | Searches every beat's alternatives in the whole conversation. It happens to be correct only because the fixture's ten keys are globally unique; it is a latent bug, not a rule. |

AC-UI-35 states the scoped rule; the conversation-wide search is recorded here as a known deviation to close with the D2 amendment or a beat-scoped lookup.
