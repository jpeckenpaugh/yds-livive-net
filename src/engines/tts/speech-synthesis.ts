/**
 * The M1 TTS adapter: the OS `speechSynthesis` API behind the frozen port
 * (D3 §4).
 *
 * Zero downloads, fully offline, zero new dependencies. The four R5 landmines
 * are each handled here: long-utterance truncation, an async voice list, an
 * unreliable `cancel()`, and the API being absent (Node, CI, jsdom, Workers).
 *
 * The adapter is constructed on the main thread and reads the API lazily, so an
 * absent `speechSynthesis` is a legitimate environment rather than an import
 * error.
 */

import type { CharacterId, Lang, VoiceId, VoiceOverrides } from '../../domain/types.ts';
import type { SynthRequest, TtsCapabilities, TtsEngine, Utterance, VoiceInfo } from '../ports.ts';
import { MAX_UTTERANCE_MS, VOICE_LIST_TIMEOUT_MS } from '../ports.ts';
import { segmentL2 } from '../../domain/segment.ts';
import { utteranceKey } from './stable-key.ts';

const ENGINE_ID = 'speech-synthesis' as const;
const REVISION = 'speech-synthesis-1';

/** Rough speaking rate used only to decide when to split; never shown to a learner. */
const MS_PER_CHAR = 50;

const CAPABILITIES: TtsCapabilities = {
  prefetch: false,
  cache: false,
  duration: false,
  offline: true,
  preservesVoiceIdentityAcrossLangs: false,
};

/** Adapter data, not logic: a curated per-language preference order (D3 §4.3). */
const PREFERRED_VOICE_NAMES: Record<string, string[]> = {
  en: ['Samantha', 'Alex', 'Daniel', 'Google US English', 'Microsoft Aria', 'Microsoft Zira'],
  es: ['Mónica', 'Monica', 'Paulina', 'Jorge', 'Diego', 'Google español', 'Microsoft Helena'],
  pt: ['Luciana', 'Felipe', 'Google português do Brasil'],
  fr: ['Amélie', 'Thomas', 'Google français', 'Microsoft Hortense'],
};

function speech(): SpeechSynthesis | undefined {
  return globalThis.speechSynthesis;
}

function languageSubtag(lang: Lang): string {
  return lang.split('-')[0]?.toLowerCase() ?? lang.toLowerCase();
}

function exactLanguage(voice: SpeechSynthesisVoice, lang: Lang): boolean {
  const tag = voice.lang.toLowerCase();
  const wanted = lang.toLowerCase();
  return tag === wanted || tag.startsWith(`${wanted}-`) || wanted.startsWith(`${tag}-`);
}

function sameLanguage(voice: SpeechSynthesisVoice, lang: Lang): boolean {
  return voice.lang.toLowerCase().startsWith(languageSubtag(lang));
}

function toVoiceInfo(voice: SpeechSynthesisVoice): VoiceInfo {
  return { handle: voice.name, lang: voice.lang, name: voice.name, local: voice.localService };
}

/** Split a long line at sentence boundaries, falling back to commas, then words. */
export function splitForSpeech(text: string, lang: Lang): string[] {
  if (estimateDurationMs(text) <= MAX_UTTERANCE_MS) return [text];
  const sentences = segmentL2(text, lang)
    .filter((span) => span.level === 'sentence')
    .map((span) => span.text.trim())
    .filter((part) => part.length > 0);
  if (sentences.length > 1) return sentences;
  const commas = text
    .split(/(?<=,)\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (commas.length > 1) return commas;
  return [text];
}

export function estimateDurationMs(text: string): number {
  return text.length * MS_PER_CHAR;
}

export function createSpeechSynthesisEngine(options: { overrides: VoiceOverrides }): TtsEngine {
  let generation = 0;
  let handles: SpeechSynthesisVoice[] = [];
  const pending = new Set<() => void>();

  function voicesChanged(): void {
    handles = speech()?.getVoices() ?? [];
  }

  function flushPending(): void {
    for (const resolve of [...pending]) resolve();
    pending.clear();
  }

  function liveVoice(name: string): SpeechSynthesisVoice | undefined {
    return handles.find((voice) => voice.name === name);
  }

  function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
    const preferred = PREFERRED_VOICE_NAMES[languageSubtag(lang)] ?? [];
    const exact = handles.filter((voice) => exactLanguage(voice, lang));
    for (const name of preferred) {
      const match = exact.find((voice) => voice.name === name);
      if (match) return match;
    }
    const exactAny = exact[0];
    if (exactAny) return exactAny;
    return handles.find((voice) => sameLanguage(voice, lang)) ?? null;
  }

  function resolve(characterId: CharacterId, voiceId: VoiceId, lang: Lang): string | null {
    void voiceId; // the authored voice is the cache identity; the OS voice is the handle
    if (handles.length === 0) voicesChanged();
    const override = options.overrides[characterId]?.[lang];
    if (override) {
      const live = liveVoice(override);
      if (live) return live.name; // a stale override falls through to the heuristic
    }
    return pickVoice(lang)?.name ?? null;
  }

  function speakPart(text: string, voice: SpeechSynthesisVoice, req: SynthRequest): Promise<void> {
    const api = speech();
    if (!api) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = (): void => {
        pending.delete(done);
        resolve();
      };
      pending.add(done);
      const Ctor = globalThis.SpeechSynthesisUtterance;
      const utterance = Ctor ? new Ctor(text) : ({ text } as unknown as SpeechSynthesisUtterance);
      utterance.text = text;
      utterance.voice = voice;
      utterance.lang = req.lang;
      utterance.rate = req.speed;
      utterance.onend = done;
      utterance.onerror = done;
      api.speak(utterance);
    });
  }

  return {
    id: ENGINE_ID,
    revision: REVISION,
    capabilities: CAPABILITIES,

    async init(): Promise<void> {
      const api = speech();
      if (!api) return;
      voicesChanged();
      if (handles.length > 0) return;
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          api.removeEventListener?.('voiceschanged', finish);
          voicesChanged();
          resolve();
        };
        api.addEventListener?.('voiceschanged', finish);
        setTimeout(finish, VOICE_LIST_TIMEOUT_MS);
      });
    },

    voices(lang: Lang): Promise<VoiceInfo[]> {
      voicesChanged();
      return Promise.resolve(handles.filter((voice) => sameLanguage(voice, lang)).map(toVoiceInfo));
    },

    resolveVoice(characterId: CharacterId, voiceId: VoiceId, lang: Lang): string | null {
      return resolve(characterId, voiceId, lang);
    },

    async synth(req: SynthRequest): Promise<Utterance> {
      const handle = resolve(req.characterId, req.voiceId, req.lang);
      if (handle === null) {
        const error = new Error(`no voice for ${req.lang}`) as Error & { kind: string };
        error.kind = 'no-voice-for-language';
        throw error;
      }
      const voice = liveVoice(handle) ?? handles.find((candidate) => candidate.name === handle);
      if (!voice) {
        const error = new Error(`no voice for ${req.lang}`) as Error & { kind: string };
        error.kind = 'no-voice-for-language';
        throw error;
      }

      const key = await utteranceKey({
        engineId: ENGINE_ID,
        engineRevision: REVISION,
        voiceId: req.voiceId,
        lang: req.lang,
        speed: req.speed,
        text: req.text,
      });

      const parts = splitForSpeech(req.text, req.lang);
      let stopped = false;

      return {
        kind: 'native',
        key,
        durationMs: null,
        async play(): Promise<void> {
          const mine = generation;
          await Promise.resolve();
          if (mine !== generation) return; // cancelled before speaking
          for (const part of parts) {
            if (stopped || mine !== generation) return;
            await speakPart(part, voice, req);
          }
        },
        stop(): void {
          if (stopped) return; // idempotent
          stopped = true;
          generation += 1;
          speech()?.cancel();
          flushPending();
        },
      };
    },

    dispose(): void {
      generation += 1;
      speech()?.cancel();
      flushPending();
      handles = [];
    },
  };
}
