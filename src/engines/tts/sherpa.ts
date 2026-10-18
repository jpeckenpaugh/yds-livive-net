/**
 * The M3 TTS adapter: Supertonic 2 (int8) via sherpa-onnx, behind the frozen
 * port (D3 §6). The selected packaging is C — `supertonic-int8-sherpa-v2`,
 * WASM-only, precision chain `[wasm + int8]` with **no `dtype` request** (the
 * artifact *is* int8; D3 §6.3 forbids describing it with the dtype string).
 *
 * The adapter owns: the plan (its registry entry's files + the voice styles),
 * the worker lifecycle, the precision chain's loud failure, and turning the
 * runtime's Float32 samples into the `buffer` utterance the port requires. It
 * never names a repo id — those live in the registry (AC-ENG-11).
 */

import type { CharacterId, Lang, VoiceId, VoiceOverrides } from '../../domain/types.ts';
import type {
  AssetRegistryEntry,
  ModelFileRef,
  ModelSource,
  SynthRequest,
  TtsCapabilities,
  TtsEngine,
  Utterance,
  VoiceInfo,
} from '../ports.ts';
import { VOICE_IDS } from '../ports.ts';
import { browserRegistry } from '../registry.browser.ts';
import { createMainThreadRuntime, type SherpaRuntime } from './sherpa-runtime.ts';
import { utteranceKey } from './stable-key.ts';
import { encodeWav } from './wav.ts';

const ENGINE_ID = 'supertonic-sherpa' as const;

/** Supertonic 2's multilingual set — the languages this engine can speak. */
const SUPPORTED_LANGS = new Set(['en', 'es', 'pt', 'fr']);

const CAPABILITIES: TtsCapabilities = {
  prefetch: true,
  cache: true,
  duration: true,
  offline: true,
  preservesVoiceIdentityAcrossLangs: true,
};

export function describeChain(entry: AssetRegistryEntry): string {
  return entry.precisionChain.map((step) => `${step.backend}+${step.precision}`).join(' → ');
}

function engineError(
  message: string,
  kind: 'engine-init-failed' | 'unsupported-text' | 'no-voice-for-language',
): Error & { kind: string } {
  const error = new Error(message) as Error & { kind: string };
  error.kind = kind;
  return error;
}

function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(finish);
  });
}

/** The worker's `sid` for a `VoiceId`: M1–M5 = 0–4, F1–F5 = 5–9. */
export function voiceStyleIndex(voiceId: VoiceId): number {
  const index = VOICE_IDS.indexOf(voiceId);
  return index === -1 ? 0 : index;
}

function speaks(lang: Lang): boolean {
  return SUPPORTED_LANGS.has(lang.split('-')[0] ?? lang);
}

export type CreateSherpaEngineOptions = {
  overrides: VoiceOverrides;
  models: ModelSource;
  /** Injected for tests; the worker-backed runtime in production. */
  runtime?: SherpaRuntime;
  /** Registry entries to use; defaults to the build-selected `browserRegistry`. */
  entries?: readonly AssetRegistryEntry[];
};

export function createSherpaEngine(options: CreateSherpaEngineOptions): TtsEngine {
  const entries = options.entries ?? browserRegistry;
  const ttsEntry = entries.find((e) => e.purpose === 'tts');
  if (!ttsEntry) throw engineError('no TTS registry entry is selected', 'engine-init-failed');
  const tts: AssetRegistryEntry = ttsEntry;
  const voiceEntry = entries.find((e) => e.purpose === 'voice-style');

  const revision = `${tts.id}@${tts.revision}`;
  const runtime = options.runtime ?? createMainThreadRuntime();
  let inited = false;
  let initPromise: Promise<void> | null = null;
  let disposed = false;

  /** The whole plan: the packaging's model files + the voice styles. */
  function plan(): ModelFileRef[] {
    const entries = [tts, voiceEntry].filter((e): e is AssetRegistryEntry => e !== undefined);
    return entries.flatMap((entry) =>
      entry.files.map((file) => ({
        repoId: entry.repoId,
        revision: entry.revision,
        path: file.path,
      })),
    );
  }

  function resolveVoice(characterId: CharacterId, voiceId: VoiceId, lang: Lang): string | null {
    if (!speaks(lang)) return null;
    const override = options.overrides[characterId]?.[lang];
    if (override && (VOICE_IDS as readonly string[]).includes(override)) return override;
    return voiceId;
  }

  async function init(): Promise<void> {
    if (inited) return;
    initPromise ??= (async () => {
      try {
        const files = plan();
        await options.models.ensure(files);
        const loaded = await Promise.all(
          files.map(async (ref) => ({ path: ref.path, bytes: await options.models.read(ref) })),
        );
        await runtime.init(loaded);
        inited = true;
      } catch (error) {
        // Hard fail names the entry and the attempted chain (AC-ENG-13).
        throw engineError(
          `audio engine ${tts.id} could not start (chain: ${describeChain(tts)}): ${
            (error as Error).message
          }`,
          'engine-init-failed',
        );
      }
    })();
    return initPromise;
  }

  function voices(lang: Lang): Promise<VoiceInfo[]> {
    if (!speaks(lang)) return Promise.resolve([]);
    // Language-agnostic styles: the same ten appear under every language the
    // engine speaks (D3 §6.6, port `voices(lang)` doc).
    return Promise.resolve(VOICE_IDS.map((id) => ({ handle: id, lang, name: id, local: true })));
  }

  async function synth(req: SynthRequest): Promise<Utterance> {
    await init();
    if (disposed) throw engineError('engine disposed', 'engine-init-failed');
    const handle = resolveVoice(req.characterId, req.voiceId, req.lang);
    if (handle === null) throw engineError(`no voice for ${req.lang}`, 'no-voice-for-language');

    const key = await utteranceKey({
      engineId: ENGINE_ID,
      engineRevision: revision,
      voiceId: req.voiceId,
      lang: req.lang,
      speed: req.speed,
      text: req.text,
    });

    let samples: Float32Array;
    let sampleRate: number;
    try {
      const result = await runtime.generate(req.text, voiceStyleIndex(req.voiceId), req.speed);
      samples = result.samples;
      sampleRate = result.sampleRate;
    } catch (error) {
      throw engineError(`synthesis failed: ${(error as Error).message}`, 'unsupported-text');
    }

    const blob = encodeWav(samples, sampleRate);
    const durationMs = Math.round((samples.length / sampleRate) * 1000);
    return {
      kind: 'buffer',
      key,
      durationMs,
      blob,
      play: () => playBlob(blob),
      stop: () => undefined,
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    runtime.dispose();
  }

  return {
    id: ENGINE_ID,
    revision,
    capabilities: CAPABILITIES,
    init,
    voices,
    resolveVoice,
    synth,
    dispose,
  };
}
