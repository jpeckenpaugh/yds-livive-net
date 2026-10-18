# You Don't Say

> **This is the concept narrative, not the spec.** It is superseded by `docs/design/` wherever the two disagree.
> Precedence: locked decisions > `docs/design/D1`–`D7` > this file. Start at `docs/design/README.md`.

An interactive, listen-first conversation reader for language learners.

You hear two people talking. At key moments the conversation pauses and you choose what one of them
says next — so you *guide* the dialogue rather than just read it. Hover any word to see what it means.
Toggle which language you read and which language you hear, independently. The whole thing runs in
the browser, offline, with no server and no API keys.

---

## The core loop

1. **Beat 1 plays.** Ron speaks. Audio plays in the language you've selected; text appears in whichever
   language(s) you've enabled.
2. **Beat 2 pauses.** Bobby is about to respond. Two option cards appear, each tagged with a short
   contextual label:
   - 🍽️ **Dinner** — *Sure Ron! Why don't we get together for a nice dinner.*
   - 🎬 **Movie** — *Ok Ron. I was thinking we could meet up at the theater and watch a new movie.*
3. **You pick one.** The chosen line animates in, plays, and joins the transcript. The option you
   didn't pick stays visible (ghosted) so you can see the road not taken — and replay it.
4. **The story bends.** Your choice sets a variable. Later lines interpolate it, so Ron's next line
   refers to *dinner* or *the movie* without anyone writing two separate scripts.
5. **Repeat to beat 10.** Five turns each, four decision points.
6. **Afterwards:** "What if I'd picked Movie?" — swap one decision and hear the same conversation
   resolve a different way.

The point is not to read a conversation. It's to *hear* one, and to have enough scaffolding — hints in
your native language, translations on demand, a voice that speaks at a learner's pace — that the
listening actually lands.

---

## The three text channels

Keeping these separate is what makes the UI legible. If you collapse them, the learner can't tell
whether they're looking at what was *said* or what it *meant*.

| Channel | What it is | Example |
|---|---|---|
| **Hint** | Author-written scaffolding in the native language. Not a translation. | "Bobby suggests getting together." |
| **Dialogue** | The actual spoken line, in L1 and/or L2. | "¿Quieres que nos juntemos mañana?" |
| **Gloss** | A rendering of a *piece* of the line, on demand. | `nos juntemos` → "we get together" |

Three independent axes of control, all orthogonal to each other:

- **Read** — L1, L2, both, or neither
- **Hear** — L1, L2, both, or nothing
- **Hint** — on or off

"Hear both" is a genuinely good study mode: the same voice says the same sentence twice, once in each
language.

---

## Decisions

| Area | Decision | Rationale |
|---|---|---|
| Branching | Variable-seeded linear timeline | Avoids the 2ⁿ blowup; authoring cost stays O(beats + choices) |
| TTS | Supertonic 3 | One voice identity across all languages; no phonemizer needed |
| Translation | Client-side MT (OPUS-MT ROMANCE pair) | No cloud; two models cover en ⇄ es/pt/fr |
| Stack | Vite + Preact + TypeScript | Minimal, one real dependency, no framework tax |

Everything is a static SPA. No backend, no accounts, no network after first load.

---

## Branching: choices as variables, not forks

If every choice led to a genuinely different next beat, four decisions would mean **16 hand-written
scripts**, and it gets worse from there. Instead:

> **A choice = a label (the button) + a response line (what gets said) + the variables it sets.**

The timeline stays **linear**. Later *fixed* lines interpolate the variables. Four decisions × two
options becomes **eight authored lines**, not sixteen scripts — and the story still coheres because
Ron's follow-up can be `"Great, {cuisine} sounds perfect."`

Choices can also be conditioned on variables, which is what makes the interaction feel responsive
without forking the timeline. In the example below, beat 4's options depend on what happened at
beat 2 — *Chinese/Pizza* only makes sense if the answer was *dinner*:

```jsonc
{ "id": 4, "when": { "activity": "dinner" }, "choices": [ /* chinese | pizza */ ] },
{ "id": 4, "when": { "activity": "movie"  }, "choices": [ /* comedy  | action */ ] }
```

This buys the feature that makes the format sing, for free: **replay with one decision changed**, and
the learner hears the same conversation arrive somewhere else.

---

## Conversation data model

```jsonc
{
  "id": "ron-bobby-01",
  "title": "Making Plans",
  "l1": "en",                 // native / interface language
  "l2": "es",                 // study language

  "characters": {
    // Same voice ID in every language — this is why Supertonic was chosen.
    "ron":   { "name": "Ron",   "voice": { "en": "M2", "es": "M2" } },
    "bobby": { "name": "Bobby", "voice": { "en": "M4", "es": "M4" } }
  },

  "beats": [
    {
      "id": 1, "speaker": "ron", "fixed": true,
      "l2": "Hola Bobby. ¿Quieres que nos juntemos mañana?",
      "l1": "Hi Bobby. Do you want to get together tomorrow?",
      "hint": "Ron wants to make plans for tomorrow."
    },
    {
      "id": 2, "speaker": "bobby",
      "choices": [
        {
          "key": "dinner",
          "label": { "l1": "Dinner", "l2": "Cena" },
          "l2": "¡Claro, Ron! ¿Por qué no nos juntamos para una buena cena?",
          "l1": "Sure Ron! Why don't we get together for a nice dinner.",
          "sets": { "activity": "dinner", "cuisine": null, "spot": "a nice dinner" }
        },
        {
          "key": "movie",
          "label": { "l1": "Movie", "l2": "Película" },
          "l2": "Está bien, Ron. Podríamos encontrarnos en el cine y ver una película nueva.",
          "l1": "Ok Ron. I was thinking we could meet up at the theater and watch a new movie.",
          "sets": { "activity": "movie", "genre": null, "spot": "a new movie" }
        }
      ]
    }

    // ... beats 3–8 ...

    {
      "id": 9, "speaker": "ron", "fixed": true,
      "l2": "Perfecto. Nos vemos el sábado a las {time} para {spot}.",
      "l1": "Perfect. See you Saturday {time} for {spot}."
    },
    {
      "id": 10, "speaker": "bobby", "fixed": true,
      "l2": "¡Nos vemos, Ron!",
      "l1": "See you then, Ron!"
    }
  ]
}
```

State is tiny, and resolving it is a pure function:

```ts
type Session = {
  beatIndex: number;
  choices: Record<BeatId, ChoiceKey>;
};

resolve(beat: Beat, session: Session, state: SlotState): Renderable
```

`resolve` is a pure `(data, state) => renderable` call. Undo is `pop` and rewind. Replay-a-different-path
is one mutated key. Every bit of it is testable without a browser.

---

## TTS: Supertonic 3

`onnx-community/Supertonic-TTS-ONNX` via `@huggingface/transformers`, WebGPU with a WASM fallback.

```js
const tts = await pipeline('text-to-speech', 'onnx-community/Supertonic-TTS-ONNX', {
  device: 'webgpu',
  dtype: 'q8',
});

const audio = await tts('Hola Bobby. ¿Quieres que nos juntemos mañana?', {
  speaker_embeddings: '.../voices/M1.bin',   // M1–M5, F1–F5
  language: 'es',
  num_inference_steps: 5,
  speed: 1.05,
});
```

Three properties earned this its slot:

1. **Speaker identity survives a language switch.** This is the decisive one. The premise is that the
   learner chooses what they hear; if Ron is one voice in English and a different person in Spanish,
   the illusion of *a single conversation* breaks every time they toggle. Supertonic's M1–F5 presets
   are the same voice across all 31 languages.
2. **No phonemizer.** Kokoro and Piper both need espeak-ng compiled to WASM for Spanish, French, and
   Portuguese — the usual source of "why does my Spanish sound English" bugs. Supertonic ships its own
   tokenizer and text normalizer and will read `$5.2M` and `(212) 555-0142 ext. 402` correctly without
   preprocessing.
3. **Fast on CPU.** Flow matching at ~5 denoising steps, no GPU required — fast enough to synthesize a
   beat's line in about the time it takes the previous one to play.

**Caveats, honestly:** the upstream repo was archived in September 2026 (weights remain available; the
`onnx-community` port is the live path), the model is OpenRAIL-M rather than Apache-2.0, and the
int8 build is a 138 MB download.

### Why not Kokoro or Piper

| | Supertonic 3 | Kokoro-82M | Piper (VITS) |
|---|---|---|---|
| Languages | 31 | en/es/pt/fr, thin | en/es/pt/fr, deep |
| Voices | 5F + 5M, same identity across languages | 54 | hundreds |
| Spanish / French / Portuguese | all covered | **3 / 1 / 3 voices** | deepest roster |
| Phonemizer required | **no** | yes (espeak-ng WASM) | yes (espeak-ng WASM) |
| License | MIT code / OpenRAIL-M model | Apache-2.0 | MIT |

Kokoro sounds better in English and is far smaller, but its non-English roster is Austrian: French has
**exactly one** voice (`ff_siwis`, female). It cannot cast a varied French conversation. Piper is the
variety king — `fr_FR` alone has five voice models, including a 125-speaker MLS model — and remains the
obvious fallback if Supertonic's ten presets ever feel samey. The OS `speechSynthesis` API stays behind
the same interface as a zero-download development stub.

---

## Translation: OPUS-MT ROMANCE

Pairwise OPUS-MT is the wrong shape here — six models at ~107 MB each, and the Portuguese pairs aren't
even ONNX-converted. But two multilingual models cover the entire language set:

| Model | Direction | q8 |
|---|---|---|
| `Xenova/opus-mt-en-ROMANCE` | en → **es, pt, fr**, it, ro, ca, … | ~107 MB |
| `Xenova/opus-mt-ROMANCE-en` | **es, pt, fr** → en | ~107 MB |

The target language is a sentence-initial token, so one model per direction:

```js
const toL2 = await pipeline('translation', 'Xenova/opus-mt-en-ROMANCE', { dtype: 'q8' });
await toL2('>>es<< Do you want to get together tomorrow?');   // >>pt<< , >>fr<< for the others
```

### Making MT behave like word-level hover

MT takes a sentence and returns a sentence, so hovering `juntemos` naively yields *"Do you want us to
get together tomorrow?"* — a fine answer to a different question. Two mitigations:

**Clause-windowing.** On hover, find the smallest clause containing the word (split on punctuation,
then on subordinators like `que`, `si`, `cuando`, `porque`) and translate only that span. Hovering
`juntemos` in *"¿Quieres que nos juntemos mañana?"* sends `nos juntemos` instead, yielding **"we get
together"**. Cache by span string — dialogue repeats phrases constantly, so hit rates are high.

**Bake it at build time.** The same models run in Node. A one-off script can walk every beat, extract
clauses, translate them, and write the results into the conversation JSON. Identical models and the
same no-cloud story, but runtime downloads drop to zero and the output can be reviewed before a learner
sees it. In a *language-learning* app, a silent MT error is invisible to precisely the person who can't
detect it, so review matters more than it would elsewhere.

---

## Footprint

| Asset | Size | When |
|---|---|---|
| Supertonic 3, int8 | 138 MB | first play |
| OPUS-MT ROMANCE ⇄ en | 214 MB | lazily, first hover (or zero, if baked at build time) |
| Voice styles, all ten | ~0.5 MB | upfront |

All of it goes in IndexedDB / Cache Storage. The 350 MB is a one-time cost, and afterwards the app is
fully offline.

The int8 path is worth calling out: it's *smaller* than the official `onnx-community` repo, which ships
only fp32 via `_data` external weights totaling ~248 MB.

---

## First milestone

One conversation, English ⇄ Spanish, **ten beats, five turns each, four decision points.**

| Beat | Speaker | Kind | Reads | Writes |
|---|---|---|---|---|
| 1 | Ron | fixed | — | — |
| 2 | Bobby | **choice** | — | `activity` (dinner \| movie) |
| 3 | Ron | fixed | — | — |
| 4 | Bobby | **choice** | `activity` | `cuisine` \| `genre` |
| 5 | Ron | fixed | `cuisine` / `genre` | — |
| 6 | Bobby | **choice** | — | `time` (early \| late) |
| 7 | Ron | fixed | `time` | — |
| 8 | Bobby | **choice** | — | `who` (just us \| friends) |
| 9 | Ron | fixed | `activity`, `time` | — |
| 10 | Bobby | fixed | — | — |

Eight authored choice lines instead of sixteen branches.

**In scope:** step-by-step transcript, choice cards, language/audio/hint toggles, per-beat TTS with
caching and prefetch, hover-translation, and "replay with a different pick" at the end.

**Out of scope for now:** accounts, persistence across devices, audio export, more than one
conversation, languages beyond English and Spanish.

---

## Repo layout

```
src/
  data/conversations/ron-bobby-01.json    # beats, slots, bilingual lines
  tts/supertonic.ts                       # pipeline, voice registry, IndexedDB cache
  mt/translate.ts                         # clause-window translator
  mt/bake.ts                              # build-time gloss generation (Node)
  state/session.ts                        # { beatIndex, choices } -> resolve()
  components/
    Transcript · Beat · ChoiceCards · HintBar · LangToolbar · WordHover
```

- `session.ts` is a pure function so the branching model is testable without a browser.
- ONNX work lives in a Web Worker behind a "is this beat's audio ready?" promise so the UI never blocks.
- Prefetch the next beat's audio while the current one plays; step-to-step latency disappears.

---

## Open questions

- **Is MT the hover layer, or the source of the second language?** Currently assumed to be the hover
  layer, with the script authored bilingually. If MT *generates* the Spanish dialogue, authoring cost
  halves — but the spoken lines become machine output, and Supertonic will read any errors faithfully.
- **Clause segmentation rules** for Spanish: where exactly to cut, and how to avoid splitting idioms
  and multi-word units like `¿por qué no…?`.
- **Authored glosses vs. pure MT.** A small authored glossary for high-frequency teaching words, with
  MT as the fallback, would fix MT's worst cases (`juntamos` is subjunctive *nosotros*; the model will
  likely say "we join").
- **How much hint text is too much?** The hint channel could easily become a crutch that turns listening
  into reading.

## Non-goals

Not a course, not a spaced-repetition system, not a speech-recognition pronunciation grader, not an
authoring tool — yet. It's a reader that makes a conversation worth listening to twice.

---

## Status

Concept and architecture. No code yet.
