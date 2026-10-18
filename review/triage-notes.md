# Triage record — the four content conversations

> **Status:** Living · **Owner:** Project Manager
> **What this is:** a provenance record that a review pass actually ran, what it found, and what was
> done about it. It is **not** a machine flag list: `D6 §8` says a shipping flag list must not be
> shipped unless a triage produced one, and the triage produced prose, not the structured
> `flags.<id>.json` format. Recording that honestly is the point.

## What ran

A triage pass in a **fresh context** — an agent that had no memory of writing the content and read
only the output — reviewed all four conversations: every rendered `l2` line, the full gloss index,
and the sources where context was needed.

**Independence, stated plainly:** it is the **same underlying model** as the drafting agent. A fresh
context removes the memory of having written it, which is the meaningful part, but it is **not
independent in the strong sense**. `D6 §8.1` records this and this note is consistent with it.

## Outcome

|                            |                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Rendered variants verified | 28 / 24 / 29 / 28 — matching the reachable combinations exactly, so no variant went unread |
| `blocking`                 | **1**                                                                                      |
| `should-fix`               | 6 (8 rows; two were `te duele…` pairs)                                                     |
| `nit`                      | 10                                                                                         |
| All findings addressed     | yes — source and table only, never a generated artifact                                    |

**The blocking finding was a real content error.** In `not-feeling-well` beat b4 the remedy option
read `¿Quizá echarte un rato?` — a **second-person reflexive in the patient's own line**, so the sick
man was telling his friend to lie down. The value had been authored for b5, where Elena is advising
Diego and second person is correct, and it leaked into b4. A learner would have internalised
"when I feel ill, I say _¿Quizá echarte un rato?_". Fixed to first person, and b4/b5 no longer share
a person-bearing string.

**Most of the rest was one defect class:** a span-keyed gloss that is faithful to the fragment and
misleading about the sentence — `quizá una bolsa` → "maybe a bag" where the line says _bolsa de agua
caliente_, `mejor un billete` → "rather a ticket" where the line says _billete de día_, and several
where the interrogative was lost because the glossed span excludes the question marks.

**What the triage checked and found clean** — recorded because it says what has actually been
verified rather than merely not looked at: agreement across _every_ rendered variant including
articles, number and gender; `de+el → del` and `a+el → al` in every variant; balanced `¿…?` and
`¡…!` pairs; names and accents; no duplicate JSON keys; the embedded `gloss` byte-identical to each
standalone `.glossary.json`. It found **no grammatical error in any of the 109 `l2` sentences**, and
it deliberately did **not** flag Peninsular forms — `coger` for transport, `vale`, `café solo`,
`billete sencillo` — because they are correct for the chosen register.

## The drafting agent disagreed with the triage in three places, and was right twice

1. **`una camisa` is question-only.** The triage cited it as a key hovered in both a question and a
   statement. In the actual span graph it occurs only in b3's `¿Una camisa?`; inside `Sí, busco una
camisa.` the smallest span is the predicate `busco una camisa`. The triage was reading the source
   rather than the span graph. Question force kept.
2. **`todo bien` needed no change** — both of its spans sit inside the same interrogative.
3. A bookkeeping correction: the findings were called "six" but the table had eight rows.

## Open — a spec problem, not an authoring one

`shipping` policy requires a **non-identity gloss for every span at every level**, and the segmenter
produces predicate fragments that are not units. So fragments are forced to carry a gloss:

| fragment            | line it came from                           | forced gloss                      |
| ------------------- | ------------------------------------------- | --------------------------------- |
| `llevo toda la`     | `Llevo toda la mañana con dolor de cabeza.` | "I've had all"                    |
| `con dolor`         | `Con dolor de cabeza, …`                    | "with pain"                       |
| `quizá una bolsa`   | `¿Quizá una bolsa de agua caliente?`        | "maybe a hot water bottle"        |
| `quieres una bolsa` | `¿Quieres una bolsa de agua caliente?`      | "do you want a hot water bottle?" |

Root cause: `D2 §9.2`'s `ADJUNCT_HEADS` trim cuts at the leftmost adjunct head reaching the end of
the clause, so `noun + de + noun` and time adjuncts yield mid-phrase fragments. The last two are the
worst: the fragment says "a bag" and the sentence says "a hot-water bottle".

Two questions for the Designer, recorded here rather than fixed unilaterally:

1. **Should a span be glossable-but-untranslated** — hover shows nothing — rather than forced to a
   bad gloss? That would trade coverage for honesty.
2. **Character names must carry a gloss**, and the only honest gloss for a name is the name itself
   (`lucía` → "Lucía"), which teaches nothing. Either exempt name spans, or accept it knowingly.
