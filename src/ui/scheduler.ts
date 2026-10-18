/**
 * The Scheduler (D4 §6.2).
 *
 * The UI never calls `TtsEngine` directly: it builds a queue of steps and hands
 * them to the playback layer. `beatId`/`alternativeId` ride along because an
 * utterance's identity is the speech tuple, not the variant (D3 §3.2), so "which
 * line is playing" is answerable only because the Scheduler attached it.
 *
 * D4 owns every sequencing rule and timing value; this is where they live.
 */

import type {
  ResolvedBeat,
  ResolvedLine,
  Visibility,
  Conversation,
  BeatId,
  LineId,
  ChoiceSetId,
  CharacterId,
  Lang,
  VoiceId,
  Preferences,
} from '../domain/types.ts';
import type { PlaybackState, TtsEngine, Utterance } from '../engines/ports.ts';
import { GAP_L2_TO_L1_MS } from './constants.ts';

export type SpeakStep = {
  kind: 'speak';
  lang: Lang;
  characterId: CharacterId;
  voiceId: VoiceId;
  text: string;
  beatId: BeatId;
  alternativeId: LineId | ChoiceSetId;
};

function textFor(line: ResolvedLine, lang: Lang, conversation: Conversation): string | null {
  if (lang === conversation.l1) return line.l1;
  if (lang === conversation.l2) return line.l2;
  return null;
}

/** Build the ordered speak steps for one line in the current Hear channel. */
export function stepsForLine(
  line: ResolvedLine,
  beat: ResolvedBeat,
  conversation: Conversation,
  visibility: Visibility,
): SpeakStep[] {
  const voiceId: VoiceId = conversation.characters[beat.speaker]?.voice ?? 'M1';
  const steps: SpeakStep[] = [];
  for (const lang of visibility.playOrder) {
    const text = textFor(line, lang, conversation);
    if (text === null) continue;
    steps.push({
      kind: 'speak',
      lang,
      characterId: beat.speaker,
      voiceId,
      text,
      beatId: beat.beatId,
      alternativeId: line.alternativeId,
    });
  }
  return steps;
}

/** The spoken line of a resolved beat, or null for a pending/unreached beat. */
export function spokenLine(beat: ResolvedBeat): ResolvedLine | null {
  if (beat.status !== 'resolved') return null;
  if (beat.kind === 'line') return beat.line ?? null;
  const chosen = beat.options?.find((option) => option.chosen);
  return chosen?.line ?? null;
}

export type PlayOutcome = 'finished' | 'stopped' | 'unavailable';

export type SchedulerOptions = {
  engine: TtsEngine;
  conversation: Conversation;
  getPrefs: () => Preferences;
  delay?: (ms: number) => Promise<void>;
  onStep?: (step: SpeakStep | null) => void;
  onStateChange?: (state: PlaybackState) => void;
};

export class Scheduler {
  private generation = 0;
  private current: Utterance | null = null;
  private state: PlaybackState = 'idle';
  private readonly listeners = new Set<(state: PlaybackState) => void>();
  private readonly engine: TtsEngine;
  private readonly conversation: Conversation;
  private readonly getPrefs: () => Preferences;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly onStep: (step: SpeakStep | null) => void;
  private readonly onStateChange: (state: PlaybackState) => void;

  constructor(options: SchedulerOptions) {
    this.engine = options.engine;
    this.conversation = options.conversation;
    this.getPrefs = options.getPrefs;
    this.delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onStep = options.onStep ?? (() => undefined);
    this.onStateChange = options.onStateChange ?? (() => undefined);
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  onState(callback: (state: PlaybackState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private setState(next: PlaybackState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange(next);
    for (const listener of [...this.listeners]) listener(next);
  }

  /** Play a resolved beat (or its chosen response). Never called for `unreached`. */
  async playBeat(beat: ResolvedBeat, visibility: Visibility): Promise<PlayOutcome> {
    const line = spokenLine(beat);
    if (!line) return 'unavailable';
    return this.playSteps(stepsForLine(line, beat, this.conversation, visibility));
  }

  /** Play one option's line without committing to it (D4 §7.2). */
  async preview(
    line: ResolvedLine,
    beat: ResolvedBeat,
    visibility: Visibility,
  ): Promise<PlayOutcome> {
    return this.playSteps(stepsForLine(line, beat, this.conversation, visibility));
  }

  async playSteps(steps: readonly SpeakStep[]): Promise<PlayOutcome> {
    const mine = ++this.generation;
    if (steps.length === 0) {
      // `hear: 'none'`, or the only heard channel is G1-disabled: nothing plays,
      // so nothing auto-advances (D4 §6.4).
      return 'unavailable';
    }
    this.setState('playing');
    for (let index = 0; index < steps.length; index += 1) {
      if (mine !== this.generation) return 'stopped';
      const step = steps[index];
      if (!step) continue;
      this.onStep(step);
      const prefs = this.getPrefs();
      // G1's escape hatch (D3 §4.4): with `playAnyway` on, an L2 line with no L2
      // voice is spoken by the default voice. It is opt-in, never silent.
      const lang =
        prefs.playAnyway &&
        this.engine.resolveVoice(step.characterId, step.voiceId, step.lang) === null
          ? this.conversation.l1
          : step.lang;
      let utterance: Utterance;
      try {
        utterance = await this.engine.synth({
          text: step.text,
          characterId: step.characterId,
          voiceId: step.voiceId,
          lang,
          speed: prefs.speed,
        });
      } catch {
        this.onStep(null);
        this.setState('idle');
        return 'unavailable';
      }
      if (mine !== this.generation) return 'stopped';
      this.current = utterance;
      await utterance.play();
      if (index < steps.length - 1) await this.delay(GAP_L2_TO_L1_MS);
    }
    this.current = null;
    this.onStep(null);
    this.setState('idle');
    return 'finished';
  }

  stop(): void {
    this.generation += 1;
    this.current?.stop();
    this.current = null;
    this.onStep(null);
    this.setState('idle');
  }
}
