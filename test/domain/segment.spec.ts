import { describe, expect, it } from 'vitest';
import {
  lookupGloss,
  normalizeSpan,
  resolveGlossSpan,
  segmentL2,
} from '../../src/domain/segment.ts';
import type { SegmentLevel } from '../../src/domain/types.ts';

function texts(text: string, level: SegmentLevel, lang = 'es'): string[] {
  return segmentL2(text, lang)
    .filter((span) => span.level === level)
    .map((span) => span.text);
}

describe('normalizeSpan (D2 §9.3)', () => {
  it('lowercases, collapses whitespace, strips edge punctuation and NFC-normalizes', () => {
    expect(normalizeSpan('  Cena ')).toBe('cena');
    expect(normalizeSpan('¡Claro')).toBe('claro');
    expect(normalizeSpan('¿Qué?')).toBe('qué');
    expect(normalizeSpan('Hola   mundo.')).toBe('hola mundo');
    expect(normalizeSpan('...nos juntemos!')).toBe('nos juntemos');
  });

  it('keeps accents significant', () => {
    expect(normalizeSpan('sí')).not.toBe(normalizeSpan('si'));
  });
});

describe('segmentL2 golden corpus (D2 §9.2, AC-DOM-13)', () => {
  it('the line level is the whole string', () => {
    expect(texts('Hola Bobby.', 'line')).toEqual(['Hola Bobby.']);
  });

  it('splits sentences on . ? ! … and keeps ¿ ¡ with the following text', () => {
    expect(texts('Hola. Adiós.', 'sentence')).toEqual(['Hola.', 'Adiós.']);
    expect(texts('¿Qué? ¡No!', 'sentence')).toEqual(['¿Qué?', '¡No!']);
    expect(texts('Hola Bobby. ¿Quieres algo?', 'sentence')).toEqual([
      'Hola Bobby.',
      '¿Quieres algo?',
    ]);
  });

  it('splits a clause before a connector', () => {
    expect(texts('Quiero que vengas.', 'clause')).toEqual(['Quiero', 'que vengas.']);
  });

  it('splits a clause after a comma and before pero', () => {
    expect(texts('Quiero que vengas, pero no puedo.', 'clause')).toEqual([
      'Quiero',
      'que vengas,',
      'pero no puedo.',
    ]);
  });

  it('never splits across the protected unit por qué no', () => {
    expect(texts('¿Por qué no nos juntamos?', 'clause')).toEqual(['¿Por qué no nos juntamos?']);
  });

  it('never splits across the protected unit es que', () => {
    expect(texts('Es que no puedo.', 'clause')).toEqual(['Es que no puedo.']);
  });

  it('trims a leading bare connector off a predicate', () => {
    expect(texts('¿Quieres que nos juntemos mañana?', 'predicate')).toEqual([
      'Quieres',
      'nos juntemos',
    ]);
  });

  it('trims a trailing adjunct off a predicate', () => {
    expect(texts('No puedo esta noche.', 'predicate')).toEqual(['No puedo']);
    expect(texts('Nos vemos el sábado.', 'predicate')).toEqual(['Nos vemos']);
  });

  it('keeps the README worked example: hovering juntemos yields nos juntemos', () => {
    const text = '¿Quieres que nos juntemos mañana?';
    const spans = segmentL2(text, 'es');
    const span = resolveGlossSpan(spans, text.indexOf('juntemos'));
    expect(span?.text).toBe('nos juntemos');
    expect(span?.level).toBe('predicate');
  });

  it('levels are nested and ordered by start then level', () => {
    const spans = segmentL2('¿Quieres que nos juntemos mañana?', 'es');
    const line = spans.find((span) => span.level === 'line');
    const predicate = spans.find((span) => span.level === 'predicate');
    expect(line?.start).toBe(0);
    expect(predicate?.start).toBeGreaterThanOrEqual(line?.start ?? 0);
    for (let i = 1; i < spans.length; i += 1) {
      const previous = spans[i - 1];
      const current = spans[i];
      if (previous && current) expect(current.start).toBeGreaterThanOrEqual(previous.start);
    }
  });

  it('a language with no tables returns line and sentence only (C7)', () => {
    const levels = new Set(segmentL2('Hello. World.', 'en').map((span) => span.level));
    expect(levels).toEqual(new Set(['line', 'sentence']));
    expect(texts('Hello. World.', 'clause', 'en')).toEqual([]);
  });

  it('returns nothing for an empty or whitespace string', () => {
    expect(segmentL2('', 'es')).toEqual([]);
    expect(segmentL2('   ', 'es')).toEqual([]);
  });

  it('every span carries its normalizeSpan key', () => {
    for (const span of segmentL2('¡Claro, Ron! ¿Por qué no?', 'es')) {
      expect(span.key).toBe(normalizeSpan(span.text));
    }
  });
});

describe('resolveGlossSpan and lookupGloss (D2 §9.1)', () => {
  it('returns the smallest span containing the offset', () => {
    const text = 'Hola mundo.';
    const spans = segmentL2(text, 'es');
    const span = resolveGlossSpan(spans, text.indexOf('mundo'));
    // The predicate span coincides with the line span here; the finer level wins.
    expect(span?.level).toBe('predicate');
  });

  it('looks a gloss up by the span key', () => {
    const spans = segmentL2('Cena.', 'es');
    const span = spans[0];
    if (!span) throw new Error('expected a span');
    expect(
      lookupGloss({ cena: { l1: 'Dinner', origin: 'mt', mt: 'Dinner', reviewedBy: 'agent' } }, span)
        ?.l1,
    ).toBe('Dinner');
    expect(lookupGloss({}, span)).toBeUndefined();
  });
});
