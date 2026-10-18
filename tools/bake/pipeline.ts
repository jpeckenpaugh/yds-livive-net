/**
 * The bake pipeline (D6 §4).
 *
 * Phases: validate source → enumerate (the exhaustive walk) → render English →
 * draft L2 → segment → draft glosses → merge/stamp/assemble → (the CLI reports).
 *
 * The `Translator` is a parameter, never a module-level import (D6 §4.2, R6), so
 * the whole pipeline runs offline against a fake. `check` validates the committed
 * artifact and never writes.
 */

import { createHash } from 'node:crypto';
import { diagnostic } from '../../src/domain/diagnostics.ts';
import { segmentL2 } from '../../src/domain/segment.ts';
import { structureOf } from '../../src/domain/structure.ts';
import { renderTemplate } from '../../src/domain/template.ts';
import {
  SCHEMA_VERSION,
  SEGMENTATION_VERSION,
  SOURCE_HASH_PREFIX,
  type Conversation,
  type ConversationSource,
  type Diagnostic,
  type GlossEntry,
  type GlossIndex,
  type ReviewPolicy,
  type ValueKey,
  type VarName,
  type VariantRecord,
} from '../../src/domain/types.ts';
import { validateConversation, validateConversationSource } from '../../src/domain/validate.ts';
import { variantSpecsOf, type VariantSpec } from '../../src/domain/variants.ts';
import {
  HINT_ECHO_MIN_TOKENS,
  HINT_MAX_CHARS,
  HINT_QUOTE_CHARS,
  bakeDiagnostic,
  type BakeDiagnostic,
} from './diagnostics.ts';

export type BakeTranslators = {
  en2romance: {
    readonly revision: string;
    translate(req: { text: string; from: string; to: string }): Promise<string>;
  };
  romance2en: {
    readonly revision: string;
    translate(req: { text: string; from: string; to: string }): Promise<string>;
  };
};

export type AdjudicatedFlagList = {
  conversationId: string;
  sourceDigest: string;
  flags: Array<{
    id: string;
    target: 'line' | 'gloss';
    ref: string;
    status: string;
    correction?: string;
  }>;
};

export type BakeInput = {
  source: ConversationSource;
  prior?: Conversation;
  translator: BakeTranslators | null;
  mode: 'write' | 'check';
  prune?: boolean;
  reviewPolicy?: ReviewPolicy;
  generatedFrom?: string;
  sourceDigest?: string;
  overrides?: GlossIndex;
  adjudication?: AdjudicatedFlagList;
};

export type BakeResult = {
  conversation: Conversation;
  gloss: GlossIndex;
  diagnostics: Diagnostic[];
  /** D6-local codes (D6 §12) — disjoint from `Diagnostic` and concatenated for reporting. */
  bakeDiagnostics: BakeDiagnostic[];
};

export function hashText(text: string): string {
  return `${SOURCE_HASH_PREFIX}${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function surfaceForms(source: ConversationSource): Map<VarName, Map<ValueKey, string>> {
  const forms = new Map<VarName, Map<ValueKey, string>>();
  for (const variable of source.variables) {
    const values = new Map<ValueKey, string>();
    for (const value of variable.values)
      if (value.l1 !== undefined) values.set(value.key, value.l1);
    forms.set(variable.name, values);
  }
  return forms;
}

function templateFor(source: ConversationSource, spec: VariantSpec): string | null {
  const beat = source.beats.find((b) => b.id === spec.beatId);
  if (!beat) return null;
  if (spec.optionKey !== undefined) {
    for (const set of beat.choiceSets ?? []) {
      const option = set.options.find((o) => o.key === spec.optionKey);
      if (option) return option.template;
    }
    return null;
  }
  const line = (beat.line ?? []).find((l) => l.id === spec.alternativeId);
  return line ? line.template : null;
}

function renderL1(
  source: ConversationSource,
  spec: VariantSpec,
  forms: Map<VarName, Map<ValueKey, string>>,
): string | null {
  const template = templateFor(source, spec);
  if (template === null) return null;
  const surface: Record<VarName, string> = {};
  for (const name of spec.slotNames) {
    const value = spec.assignment[name];
    if (value === undefined) continue;
    const form = forms.get(name)?.get(value);
    if (form !== undefined) surface[name] = form;
  }
  return renderTemplate(template, surface);
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

function sharesRun(a: string[], b: string[], n: number): boolean {
  for (let i = 0; i + n <= a.length; i += 1) {
    const slice = a.slice(i, i + n).join(' ');
    for (let j = 0; j + n <= b.length; j += 1) {
      if (b.slice(j, j + n).join(' ') === slice) return true;
    }
  }
  return false;
}

/** Hint discipline (D6 §11.5). Build-time half only; the paraphrase judgement is review-only. */
export function checkHints(source: ConversationSource): BakeDiagnostic[] {
  const out: BakeDiagnostic[] = [];
  source.beats.forEach((beat, index) => {
    const hint = beat.hint;
    if (typeof hint !== 'string') return;
    const path = `beats[${index}].hint`;
    if (hint.length > HINT_MAX_CHARS) {
      out.push(
        bakeDiagnostic(
          'HINT-TOO-LONG',
          path,
          `hint is ${hint.length} chars (max ${HINT_MAX_CHARS})`,
        ),
      );
    }
    if (HINT_QUOTE_CHARS.some((quote) => hint.includes(quote))) {
      out.push(bakeDiagnostic('HINT-ECHOES-LINE', path, 'hint contains a quotation mark'));
    }
    const lines: string[] = [];
    for (const line of beat.line ?? []) lines.push(line.template);
    for (const set of beat.choiceSets ?? [])
      for (const option of set.options) lines.push(option.template);
    const hintTokens = tokens(hint);
    for (const line of lines) {
      if (sharesRun(hintTokens, tokens(line), HINT_ECHO_MIN_TOKENS)) {
        out.push(
          bakeDiagnostic('HINT-ECHOES-LINE', path, 'hint shares a run with a line of its beat'),
        );
        break;
      }
    }
  });
  return out;
}

type MergeResult = { record: VariantRecord; diagnostics: Diagnostic[] };

async function mergeVariant(
  source: ConversationSource,
  spec: VariantSpec,
  l1: string,
  prior: VariantRecord | undefined,
  translators: BakeTranslators | null,
): Promise<MergeResult> {
  const sourceHash = hashText(l1);
  const base = {
    beatId: spec.beatId,
    alternativeId: spec.alternativeId,
    optionKey: spec.optionKey,
    variantKey: spec.variantKey,
    l1,
  };

  if (!prior) {
    const mt = translators
      ? await translators.en2romance.translate({ text: l1, from: source.l1, to: source.l2 })
      : '';
    return {
      record: {
        ...base,
        l2: mt,
        mt,
        sourceHash,
        reviewedBy: 'agent',
        translationRev: translators ? translators.en2romance.revision : null,
      },
      diagnostics: [],
    };
  }

  if (prior.sourceHash === sourceHash) {
    return { record: { ...prior, ...base }, diagnostics: [] };
  }

  const stale = diagnostic(
    'E_SOURCE_STALE',
    `lines.${spec.variantKey}`,
    'the authored English changed',
  );
  if (prior.l2 !== prior.mt) {
    // Edited and stale: keep l2 and mt, update the hash, clear the review stamp.
    const record: VariantRecord = { ...prior, ...base, sourceHash, reviewedBy: null };
    delete record.triageRef;
    return { record, diagnostics: [stale] };
  }
  const mt = translators
    ? await translators.en2romance.translate({ text: l1, from: source.l1, to: source.l2 })
    : '';
  return {
    record: {
      ...prior,
      ...base,
      l2: mt,
      mt,
      sourceHash,
      reviewedBy: 'agent',
      translationRev: translators ? translators.en2romance.revision : null,
    },
    diagnostics: [stale],
  };
}

async function draftGlosses(
  lines: Record<string, VariantRecord>,
  source: ConversationSource,
  translators: BakeTranslators | null,
  prior: GlossIndex | undefined,
  overrides: GlossIndex | undefined,
): Promise<{ gloss: GlossIndex; spanTexts: Map<string, string> }> {
  const gloss: GlossIndex = { ...(prior ?? {}) };
  const spanTexts = new Map<string, string>();
  const seen = new Set<string>();
  for (const record of Object.values(lines)) {
    for (const span of segmentL2(record.l2, source.l2)) {
      if (seen.has(span.key)) continue;
      seen.add(span.key);
      spanTexts.set(span.key, span.text);
      const override = overrides?.[span.key];
      if (override) {
        gloss[span.key] = { ...override };
        continue;
      }
      if (gloss[span.key]) continue;
      if (translators) {
        const mt = await translators.romance2en.translate({
          text: span.text,
          from: source.l2,
          to: source.l1,
        });
        const entry: GlossEntry = { l1: mt, origin: 'mt', mt, reviewedBy: 'agent' };
        gloss[span.key] = entry;
      }
    }
  }
  return { gloss, spanTexts };
}

/**
 * `GLOSS-IDENTITY` (D6 §12, §2.4) — a self-gloss is an error in a `'shipping'`
 * artifact and silent in a `'fixture'` one. The policy is the whole distinction.
 */
function glossIdentityDiagnostics(
  gloss: GlossIndex,
  spanTexts: Map<string, string>,
  policy: ReviewPolicy,
): BakeDiagnostic[] {
  if (policy !== 'shipping') return [];
  const out: BakeDiagnostic[] = [];
  for (const [key, entry] of Object.entries(gloss)) {
    if (entry.origin === 'mt' && entry.l1 === entry.mt && entry.l1 === spanTexts.get(key)) {
      out.push(
        bakeDiagnostic(
          'GLOSS-IDENTITY',
          `gloss.${key}`,
          'a shipping gloss renders the span as itself',
        ),
      );
    }
  }
  return out;
}

function applyAdjudication(
  lines: Record<string, VariantRecord>,
  adjudication: AdjudicatedFlagList | undefined,
): Record<string, VariantRecord> {
  if (!adjudication) return lines;
  for (const flag of adjudication.flags) {
    if (flag.target !== 'line') continue;
    const record = lines[flag.ref];
    if (!record) continue;
    if (flag.status === 'accepted') {
      const corrected =
        flag.correction !== undefined ? { ...record, l2: flag.correction } : { ...record };
      lines[flag.ref] = { ...corrected, reviewedBy: 'owner', triageRef: flag.id };
    } else if (flag.status === 'rejected') {
      lines[flag.ref] = { ...record, reviewedBy: 'owner', triageRef: flag.id };
    }
  }
  return lines;
}

export async function bake(input: BakeInput): Promise<BakeResult> {
  const { source, mode, prior, translator: translators } = input;
  const policy: ReviewPolicy = input.reviewPolicy ?? prior?.meta.reviewPolicy ?? 'fixture';

  const sourceDiagnostics = validateConversationSource(source);
  const structure = structureOf(source);
  const specs = variantSpecsOf(structure);
  const forms = surfaceForms(source);

  // Phase 3 — render English, and detect a key collision before anything else.
  const rendered = new Map<string, string>();
  const collisionDiagnostics: Diagnostic[] = [];
  const identityByKey = new Map<string, string>();
  for (const spec of specs) {
    const l1 = renderL1(source, spec, forms);
    if (l1 === null) {
      sourceDiagnostics.push(
        diagnostic('E_SCHEMA', `lines.${spec.variantKey}`, 'no template for a variant spec'),
      );
      continue;
    }
    const identity = `${spec.alternativeId}\u0000${spec.optionKey ?? ''}\u0000${[...spec.slotNames]
      .sort()
      .map((name) => `${name}=${spec.assignment[name] ?? ''}`)
      .join(',')}`;
    const existing = identityByKey.get(spec.variantKey);
    if (existing !== undefined && existing !== identity) {
      collisionDiagnostics.push(
        diagnostic(
          'E_VARIANT_KEY_COLLISION',
          `lines.${spec.variantKey}`,
          'two variant specs produced the same key',
        ),
      );
    } else {
      identityByKey.set(spec.variantKey, identity);
      rendered.set(spec.variantKey, l1);
    }
  }

  if (mode === 'check') {
    if (!prior) {
      return {
        conversation: structure,
        gloss: {},
        diagnostics: [
          ...sourceDiagnostics,
          ...collisionDiagnostics,
          diagnostic('E_SCHEMA', '', 'check mode requires a committed artifact'),
        ],
        bakeDiagnostics: [],
      };
    }
    const checked: Conversation = { ...prior, order: structure.order, beats: structure.beats };
    const diagnostics: Diagnostic[] = [
      ...sourceDiagnostics,
      ...collisionDiagnostics,
      ...validateConversation(checked),
    ];
    // `sourceDigest` is a hash of the source file's **bytes**, so a CRLF
    // checkout is a change to it (D3 §10 rule 7, AC-TOOL-12).
    if (input.sourceDigest !== undefined && checked.meta.sourceDigest !== input.sourceDigest) {
      diagnostics.push(
        diagnostic(
          'E_SOURCE_STALE',
          'meta.sourceDigest',
          'the source file bytes changed; line endings are part of the contract',
        ),
      );
    }
    for (const [key, l1] of rendered) {
      const record = checked.lines[key];
      if (!record) continue;
      if (record.sourceHash !== hashText(l1)) {
        diagnostics.push(
          diagnostic(
            'E_SOURCE_STALE',
            `lines.${key}`,
            'sourceHash does not match the render of l1',
          ),
        );
      }
    }
    return { conversation: prior, gloss: prior.gloss, diagnostics, bakeDiagnostics: [] };
  }

  // write mode. Prior records are preserved unless `--prune` (D6 §7.2): an
  // unreachable record is reported as E_ORPHAN_VARIANT, not silently dropped.
  const lines: Record<string, VariantRecord> = input.prune ? {} : { ...(prior?.lines ?? {}) };
  const mergeDiagnostics: Diagnostic[] = [];
  for (const spec of specs) {
    const l1 = rendered.get(spec.variantKey);
    if (l1 === undefined) continue;
    const merged = await mergeVariant(source, spec, l1, prior?.lines[spec.variantKey], translators);
    lines[spec.variantKey] = merged.record;
    mergeDiagnostics.push(...merged.diagnostics);
  }

  const { gloss, spanTexts } = await draftGlosses(
    lines,
    source,
    translators,
    input.prune ? undefined : prior?.gloss,
    input.overrides,
  );
  applyAdjudication(lines, input.adjudication);

  const conversation: Conversation = {
    id: source.id,
    title: source.title,
    l1: source.l1,
    l2: source.l2,
    characters: source.characters,
    order: structure.order,
    beats: structure.beats,
    lines,
    gloss,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      segmentationVersion: SEGMENTATION_VERSION,
      generatedFrom: input.generatedFrom ?? `${source.id}.source.json`,
      sourceDigest: input.sourceDigest ?? hashText(JSON.stringify(source)),
      reviewPolicy: policy,
      translator: translators
        ? {
            en2romance: translators.en2romance.revision,
            romance2en: translators.romance2en.revision,
          }
        : { en2romance: null, romance2en: null },
    },
  };

  const diagnostics: Diagnostic[] = [
    ...sourceDiagnostics,
    ...collisionDiagnostics,
    ...mergeDiagnostics,
    ...validateConversation(conversation),
  ];
  return {
    conversation,
    gloss,
    diagnostics,
    bakeDiagnostics: glossIdentityDiagnostics(gloss, spanTexts, policy),
  };
}

export function errorCount(diagnostics: readonly Diagnostic[]): number {
  return diagnostics.filter((d) => d.severity === 'error').length;
}
