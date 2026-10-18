/**
 * The Node `Translator` implementation (D3 §10, D6 §2.3).
 *
 * The runtime is imported **lazily, inside `loadTranslator`**, so the author-only
 * path (M1's and CI's only mode) never evaluates it. The `>>es<<` target token is
 * prepended here — the port owns the convention, and no call site constructs a
 * model prompt (AC-ENG-17).
 *
 * The repo id comes from the build registry, so this module names no literal repo
 * id or revision (AC-ENG-11); `registry.build.ts` is their single home.
 */

import type { Lang } from '../../src/domain/types.ts';
import type { LoadTranslator, Translator, TranslatorId } from '../../src/engines/ports.ts';
import { buildRegistry } from './registry.build.ts';

type TranslateOutput = { translation_text?: string } | Array<{ translation_text?: string }>;

type TranslationPipeline = (
  text: string,
  options?: Record<string, unknown>,
) => Promise<TranslateOutput>;

type TransformersLike = {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<TranslationPipeline>;
};

const REGISTRY_ID: Record<TranslatorId, string> = {
  'en-ROMANCE': 'opus-mt-en-romance',
  'ROMANCE-en': 'opus-mt-romance-en',
};

/** Target tokens for the multilingual en→ROMANCE model (D3 §10.3). */
const TARGET_TOKEN: Record<string, string> = {
  es: '>>es<<',
  pt: '>>pt<<',
  fr: '>>fr<<',
  it: '>>it<<',
  ro: '>>ro<<',
  ca: '>>ca<<',
};

function firstText(output: TranslateOutput): string {
  const entry = Array.isArray(output) ? output[0] : output;
  return entry?.translation_text ?? '';
}

export const loadTranslator: LoadTranslator = async ({ id, revision, cacheDir }) => {
  const entry = buildRegistry.find((candidate) => candidate.id === REGISTRY_ID[id]);
  if (!entry) throw new Error(`the build registry has no entry for ${id}`);
  const runtime = (await import('@huggingface/transformers')) as unknown as TransformersLike;
  const pipe = await runtime.pipeline('translation', entry.repoId, {
    revision,
    ...(cacheDir ? { cache_dir: cacheDir } : {}),
  });

  const translator: Translator = {
    id,
    repoId: entry.repoId,
    revision,
    async translate({ text, from, to }: { text: string; from: Lang; to: Lang }) {
      const prompt = id === 'en-ROMANCE' ? `${TARGET_TOKEN[to] ?? ''} ${text}`.trim() : text;
      const output = await pipe(prompt, { from, to });
      return firstText(output);
    },
  };
  return translator;
};
