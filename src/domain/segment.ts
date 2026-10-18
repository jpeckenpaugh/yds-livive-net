/**
 * Span segmentation and the gloss index (D2 §9).
 *
 * One shared segmenter: `bake` and the browser call the identical function, so a
 * hover can never miss because build-time and runtime split differently (R8).
 * Gloss keys are stored as normalized span *text*, never as offsets.
 *
 * `lang` selects the tables and nothing else (amendment C7): the conversation's
 * `l2` (Spanish in M1) gets all four levels; any other language gets `line` and
 * `sentence` only, because `clause` and `predicate` are defined by the Spanish
 * word tables.
 */

import {
  ADJUNCT_HEADS,
  CONNECTOR_SPLIT,
  PROTECTED_UNITS,
  SEGMENT_LEVELS,
  type GlossEntry,
  type GlossIndex,
  type Lang,
  type LookupGloss,
  type NormalizeSpan,
  type ResolveGlossSpan,
  type SegmentLevel,
  type SegmentL2,
  type Span,
} from './types.ts';

const LEVEL_RANK: Record<SegmentLevel, number> = Object.fromEntries(
  SEGMENT_LEVELS.map((level, index) => [level, index]),
) as Record<SegmentLevel, number>;

const TERMINATORS = '.?!…';
const STRIP_CHARS = '¿¡?!.,;:…';

export const normalizeSpan: NormalizeSpan = (text) => {
  const collapsed = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const stripped = collapsed
    .replace(new RegExp(`^[${STRIP_CHARS}\\s]+`, 'u'), '')
    .replace(new RegExp(`[${STRIP_CHARS}\\s]+$`, 'u'), '');
  return stripped.normalize('NFC');
};

type Word = { word: string; start: number; end: number };

const WORD_RE = /[\p{L}\p{M}]+/gu;

function wordsOf(text: string, offset = 0): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const start = offset + (match.index ?? 0);
    words.push({ word: match[0], start, end: start + match[0].length });
  }
  return words;
}

function trim(text: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  while (s < e && /\s/u.test(text[s] ?? '')) s += 1;
  while (e > s && /\s/u.test(text[e - 1] ?? '')) e -= 1;
  return { start: s, end: e };
}

function sentenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (TERMINATORS.includes(ch)) {
      let end = i + 1;
      while (end < text.length && TERMINATORS.includes(text[end] ?? '')) end += 1;
      spans.push(trim(text, start, end));
      start = end;
      i = end;
      continue;
    }
    i += 1;
  }
  if (start < text.length) {
    const tail = trim(text, start, text.length);
    if (tail.end > tail.start) spans.push(tail);
  }
  return spans.filter((span) => span.end > span.start);
}

function protectedIndices(lower: string[]): Set<number> {
  const marked = new Set<number>();
  for (const unit of PROTECTED_UNITS) {
    const parts = unit.split(' ');
    for (let i = 0; i + parts.length <= lower.length; i += 1) {
      let ok = true;
      for (let j = 0; j < parts.length; j += 1) {
        if (lower[i + j] !== parts[j]) {
          ok = false;
          break;
        }
      }
      if (ok) for (let j = 0; j < parts.length; j += 1) marked.add(i + j);
    }
  }
  return marked;
}

function clauseSpans(
  text: string,
  sentenceStart: number,
  sentenceEnd: number,
): Array<{ start: number; end: number }> {
  const sub = text.slice(sentenceStart, sentenceEnd);
  const words = wordsOf(sub, sentenceStart);
  const lower = words.map((word) => word.word.toLowerCase());
  const protectedSet = protectedIndices(lower);

  const points: number[] = [sentenceStart];
  for (let i = 0; i < sub.length; i += 1) {
    if (sub[i] === ',') points.push(sentenceStart + i + 1);
  }
  words.forEach((word, index) => {
    if (index === 0) return;
    if (protectedSet.has(index)) return;
    if (CONNECTOR_SPLIT.includes(lower[index] ?? '')) points.push(word.start);
  });

  const sorted = [...new Set(points)]
    .filter((point) => point > sentenceStart && point < sentenceEnd)
    .sort((a, b) => a - b);
  const bounds = [sentenceStart, ...sorted, sentenceEnd];

  const spans: Array<{ start: number; end: number }> = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    const span = trim(text, bounds[i] ?? sentenceStart, bounds[i + 1] ?? sentenceEnd);
    if (span.end > span.start) spans.push(span);
  }
  return spans;
}

function predicateSpan(
  text: string,
  clauseStart: number,
  clauseEnd: number,
): { start: number; end: number } | null {
  let { start, end } = trim(text, clauseStart, clauseEnd);
  while (start < end && (text[start] === '¿' || text[start] === '¡')) start += 1;
  ({ start, end } = trim(text, start, end));
  if (end <= start) return null;

  const words = wordsOf(text.slice(start, end), start);
  const lower = words.map((word) => word.word.toLowerCase());

  // Trim a leading bare connector.
  if (words.length > 1 && CONNECTOR_SPLIT.includes(lower[0] ?? '')) {
    start = words[0]?.end ?? start;
    ({ start, end } = trim(text, start, end));
  }

  // Trim a trailing adjunct: the leftmost word position at which an adjunct head
  // (single- or multi-word) begins a suffix that reaches the end of the clause.
  let adjunctStart = -1;
  for (let i = 1; i < words.length && adjunctStart < 0; i += 1) {
    for (const head of ADJUNCT_HEADS) {
      const parts = head.split(' ');
      if (i + parts.length > words.length) continue;
      let matches = true;
      for (let j = 0; j < parts.length; j += 1) {
        if (lower[i + j] !== parts[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        adjunctStart = words[i]?.start ?? -1;
        break;
      }
    }
  }
  if (adjunctStart > start) end = adjunctStart;

  ({ start, end } = trim(text, start, end));
  if (end <= start) return null;
  return { start, end };
}

function hasSpanishTables(lang: Lang): boolean {
  return lang === 'es' || lang.startsWith('es-');
}

export const segmentL2: SegmentL2 = (text, lang) => {
  if (text.trim() === '') return [];

  const spans: Span[] = [];
  const push = (level: SegmentLevel, start: number, end: number): void => {
    if (end <= start) return;
    const slice = text.slice(start, end);
    spans.push({ level, start, end, text: slice, key: normalizeSpan(slice) });
  };

  push('line', 0, text.length);
  const sentences = sentenceSpans(text);
  for (const sentence of sentences) push('sentence', sentence.start, sentence.end);

  if (hasSpanishTables(lang)) {
    for (const sentence of sentences) {
      for (const clause of clauseSpans(text, sentence.start, sentence.end)) {
        push('clause', clause.start, clause.end);
        const predicate = predicateSpan(text, clause.start, clause.end);
        if (predicate) push('predicate', predicate.start, predicate.end);
      }
    }
  }

  spans.sort(
    (a, b) => a.start - b.start || LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.end - b.end,
  );
  return spans;
};

/** The smallest span containing `offset`; ties break toward the finer level. */
export const resolveGlossSpan: ResolveGlossSpan = (spans, offset) => {
  let best: Span | undefined;
  for (const span of spans) {
    if (offset < span.start || offset >= span.end) continue;
    if (
      !best ||
      span.end - span.start < best.end - best.start ||
      (span.end - span.start === best.end - best.start &&
        LEVEL_RANK[span.level] > LEVEL_RANK[best.level])
    ) {
      best = span;
    }
  }
  return best;
};

export const lookupGloss: LookupGloss = (gloss: GlossIndex, span: Span): GlossEntry | undefined =>
  gloss[span.key];
