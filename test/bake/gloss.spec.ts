import { describe, expect, it } from 'vitest';
import { bake } from '../../tools/bake/pipeline.ts';
import { fixtureTranslators } from '../../tools/bake/fixtures/fixture-translator.ts';
import { segmentL2 } from '../../src/domain/segment.ts';
import { validateConversation } from '../../src/domain/validate.ts';
import { clone, fixtureConversation, fixtureSource } from '../helpers/sources.ts';

describe('gloss coverage (AC-DOM-12)', () => {
  it('every span at every level of every variant has a gloss entry', () => {
    const c = fixtureConversation();
    for (const record of Object.values(c.lines)) {
      for (const span of segmentL2(record.l2, c.l2)) {
        expect(c.gloss[span.key], `missing gloss for ${span.key}`).toBeDefined();
      }
    }
    expect(validateConversation(c).filter((d) => d.code === 'E_GLOSS_MISSING')).toEqual([]);
  });

  it('a deleted entry raises E_GLOSS_MISSING', () => {
    const c = clone(fixtureConversation());
    const key = Object.keys(c.gloss)[0];
    if (key) delete c.gloss[key];
    expect(validateConversation(c).map((d) => d.code)).toContain('E_GLOSS_MISSING');
  });

  it('coverage is guaranteed by construction when drafting with a translator', async () => {
    const result = await bake({
      source: fixtureSource(),
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
    });
    for (const record of Object.values(result.conversation.lines)) {
      for (const span of segmentL2(record.l2, result.conversation.l2)) {
        expect(result.gloss[span.key]).toBeDefined();
      }
    }
  });

  it('an authored override from glossary.es.json wins over the draft', async () => {
    const result = await bake({
      source: fixtureSource(),
      translator: fixtureTranslators,
      mode: 'write',
      reviewPolicy: 'fixture',
      overrides: {
        perfecto: { l1: 'perfect', origin: 'authored', mt: 'Perfecto', reviewedBy: 'owner' },
      },
    });
    expect(result.gloss.perfecto?.l1).toBe('perfect');
    expect(result.gloss.perfecto?.origin).toBe('authored');
  });
});
