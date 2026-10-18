/**
 * The coverage report (D6 §9). Generated, byte-reproducible, never hand-edited.
 * CI regenerates it into a temp path and compares (AC-TOOL-11).
 */

import { segmentL2 } from '../../src/domain/segment.ts';
import { MAX_GLOSS_KEYS_WARN, GLOSS_PRIORITY_TOP_N } from './diagnostics.ts';
import type { BuiltBeat, Conversation } from '../../src/domain/types.ts';

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return map;
}

export function renderReport(conversation: Conversation): string {
  const lines = Object.values(conversation.lines);
  const glosses = Object.entries(conversation.gloss);
  const beats = conversation.order
    .map((id) => conversation.beats[id])
    .filter((beat): beat is BuiltBeat => beat !== undefined);

  const variantsPerBeat = countBy(lines, (record) => record.beatId);
  const spanCounts = new Map<string, number>();
  for (const record of lines) {
    for (const span of segmentL2(record.l2, conversation.l2)) {
      spanCounts.set(span.key, (spanCounts.get(span.key) ?? 0) + 1);
    }
  }

  const byOrigin = countBy(glosses, ([, entry]) => entry.origin);
  const lineReview = countBy(lines, (record) => String(record.reviewedBy));
  const glossReview = countBy(glosses, ([, entry]) => String(entry.reviewedBy));
  const byLevel = new Map<string, number>();
  for (const record of lines) {
    for (const span of segmentL2(record.l2, conversation.l2)) {
      byLevel.set(span.level, (byLevel.get(span.level) ?? 0) + 1);
    }
  }

  const out: string[] = [];
  out.push(`# Coverage report — ${conversation.id}`);
  out.push('');
  out.push(`Review policy: **${conversation.meta.reviewPolicy}**`);
  out.push('');
  out.push('## Counts');
  out.push('');
  out.push(`- beats: ${beats.length}`);
  out.push(`- choice beats: ${beats.filter((beat) => beat.kind === 'choice').length}`);
  out.push(`- line records: ${lines.length}`);
  out.push(`- distinct gloss keys: ${glosses.length}`);
  out.push('');

  out.push('## Per beat');
  out.push('');
  out.push('| Beat | Kind | Variants |');
  out.push('|---|---|---|');
  for (const beat of beats) {
    out.push(`| ${beat.id} | ${beat.kind} | ${variantsPerBeat.get(beat.id) ?? 0} |`);
  }
  out.push('');

  out.push('## Glosses');
  out.push('');
  out.push(`- total keys: ${glosses.length}`);
  for (const [level, count] of byLevel) out.push(`- spans at ${level}: ${count}`);
  for (const [origin, count] of byOrigin) out.push(`- origin ${origin}: ${count}`);
  if (glosses.length > MAX_GLOSS_KEYS_WARN) {
    out.push('');
    out.push(
      `> ⚠ ${glosses.length} gloss keys exceeds ${MAX_GLOSS_KEYS_WARN}: rethink the gloss spine, not more review.`,
    );
  }
  out.push('');

  out.push('## Review status');
  out.push('');
  out.push(`- lines: ${[...lineReview].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  out.push(`- glosses: ${[...glossReview].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  out.push('');

  const debt = [
    ...lines
      .filter((record) => record.reviewedBy === null)
      .map((record) => `line ${record.variantKey}`),
    ...glosses.filter(([, entry]) => entry.reviewedBy === null).map(([key]) => `gloss ${key}`),
  ];
  out.push('## Review debt');
  out.push('');
  out.push(debt.length === 0 ? 'None.' : debt.map((item) => `- ${item}`).join('\n'));
  out.push('');

  out.push('## Gloss priority (top by variant coverage)');
  out.push('');
  const ranked = [...spanCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  out.push('| Span key | Variants |');
  out.push('|---|---|');
  for (const [key, count] of ranked.slice(0, GLOSS_PRIORITY_TOP_N))
    out.push(`| ${key} | ${count} |`);
  out.push('');

  return out.join('\n');
}
