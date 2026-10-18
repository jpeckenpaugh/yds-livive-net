/**
 * Gloss access (D4 §11.4, D2 §9).
 *
 * The span mechanics are D2's (`segmentL2`/`resolveGlossSpan`/`lookupGloss`); this
 * module maps a line to renderable, **non-overlapping** word units whose gloss is
 * the smallest span containing the word. Hover, tap and keyboard all go through
 * here, so a gloss is reachable by every input method and is the accessible
 * description of the span.
 */

import { lookupGloss, resolveGlossSpan, segmentL2 } from '../domain/segment.ts';
import type { GlossEntry, GlossIndex, Lang, Span } from '../domain/types.ts';

export type GlossWord = {
  /** The exact source text of this unit (a word, or the punctuation between words). */
  text: string;
  start: number;
  end: number;
  entry: GlossEntry | undefined;
  /** The span the gloss came from, for the popover's provenance. */
  span: Span | undefined;
};

const WORD_RE = /[\p{L}\p{M}\p{N}]+/gu;

/** Split a line into word and inter-word units, each carrying its smallest gloss span. */
export function glossWords(text: string, lang: Lang, gloss: GlossIndex): GlossWord[] {
  const spans = segmentL2(text, lang);
  const units: GlossWord[] = [];
  let last = 0;
  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    if (start > last) {
      units.push({
        text: text.slice(last, start),
        start: last,
        end: start,
        entry: undefined,
        span: undefined,
      });
    }
    const end = start + match[0].length;
    const span = resolveGlossSpan(spans, start);
    units.push({
      text: match[0],
      start,
      end,
      entry: span ? lookupGloss(gloss, span) : undefined,
      span,
    });
    last = end;
  }
  if (last < text.length) {
    units.push({
      text: text.slice(last),
      start: last,
      end: text.length,
      entry: undefined,
      span: undefined,
    });
  }
  return units;
}

export function glossAt(
  text: string,
  lang: Lang,
  gloss: GlossIndex,
  offset: number,
): GlossEntry | undefined {
  const span = resolveGlossSpan(segmentL2(text, lang), offset);
  if (!span) return undefined;
  return lookupGloss(gloss, span);
}
