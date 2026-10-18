# You Don't Say — UI (D4)

> **Status:** 🟡 Draft — pending owner review
> **Owner:** Designer · **Reviewer:** Project Manager
> **Purpose:** The interface contract. Component tree, the store, the presentation matrix, every interaction state, **all playback sequencing and timing**, the choice-card interaction, the choice-blind fix, the degraded-audio state machine, keyboard and accessibility, and the About/Licenses surface.
> **Depends on:** D2 (`visibility()`, `ResolvedBeat`, session ops, the three carve-outs) · D3 (capabilities, the `PlaybackController` interface, the G1/G2 facts, licenses) · D6 (nothing here is authored content)
> **Owns:** the component tree, the presentation half of the toggle matrix, **every timing constant**, the scheduler, all interaction states, keyboard map, a11y conformance, the About/Licenses surface, `AC-UI-*`
> **Related:** D7 (module map) · D5 (test harness, mock `speechSynthesis`, a11y tooling)

**Precedence.** Locked decisions > `docs/design/D2`–`D7` > `README.md`. Deliberate disagreements carry a **⚠ DIVERGES FROM README** marker.

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

---

## 15. Cross-doc notes — pushback, and what should block M1

**Pushing back on D2 — nothing.** `Option.icon` was the one open schema question and it is closed: the field exists, it is label-class, and D2 §4.3 carries its treatment while this doc carries its render rule.

**Pushing back on D3 — two items, both now resolved in D3:**

1. **`resolveVoice` needed a `characterId`** (D3 §3.1.1, amendment C1). `voiceOverrides` is keyed by character, nothing forbids two characters sharing a `VoiceId`, and an adapter with only a voice id cannot honour an override. D4 §9.2's picker is only implementable against the amended signature. AC-ENG-22.
2. **The hash fallback** (D3 §7.7, amendment C8): `crypto.subtle` is absent in a non-secure context, which is a real case for a LAN preview, and M1's replay path needs a key either way. AC-ENG-03 now names both algorithms.

Everything else D3 pre-registered is absorbed without a change request: the four M1 constraints cost the UI a "preparing" state it cannot have, a duration it cannot show, an instant replay it cannot promise, and a frame-exact cut it cannot make. Each is handled by *not building* the affordance rather than by faking it, which is why AC-UI-24 exists.

**Pushing back on D6 — nothing.** D4 renders the resolved artifact and touches no content.

**Should this block M1?** One item only, and it is the `Option.icon` decision, because it is a schema question and schema changes get more expensive after the first bake. Everything else in this doc is additive implementation work with no cross-doc dependency. **No blocker for M1 beyond that decision.**

**Open items for the owner:**

1. §6.3 — `GAP_POST_BEAT_MS = 300`, `GAP_AFTER_CHOICE_MS = 300` and `ANIMATE_IN_MS = 180` are my invented defaults; they are one-line changes and worth tuning against real playback once M1 runs.
2. §11.1 — the letter shortcuts (`G`, `W`, `?`) are additions beyond the map you approved (Q12). Approved verbs; the letters are mine and are cheap to change.
3. §12 — I have taken the position that turning off Read is a learner setting rather than a WCAG 1.2.1 failure. If you want the stricter reading, the fallback is to make `read: 'none'` a warned state with an inline note rather than a silent one.
4. §7.6 — the ten icons themselves are content, owned by D6. If any of the ten is unimaginable for a learner, that is a one-line content change with no schema impact.
