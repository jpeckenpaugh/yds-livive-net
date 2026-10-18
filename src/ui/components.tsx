/**
 * The component tree (D4 §3).
 *
 * Every component listed in D4 §3 is here. The UI is a pure function of
 * `resolveTimeline` plus the engine's declared capabilities: it does not
 * re-derive what a beat says, whether a choice is legal, what plays in what
 * order, or which options are ghosts. Every one of those is D2's.
 */

import { useMemo, useState } from 'preact/hooks';
import { resolveTimeline } from '../domain/resolve.ts';
import type {
  Channel,
  ChoiceKey,
  Conversation,
  Lang,
  ResolvedBeat,
  ResolvedLine,
  ResolvedOption,
} from '../domain/types.ts';
import { glossWords } from './gloss.ts';
import type { Messages } from './i18n/index.ts';
import { ANIMATE_IN_MS, MIN_TARGET_PX, SPEED_MAX, SPEED_MIN } from './constants.ts';
import { browserRegistry } from '../engines/registry.browser.ts';
import { AUDIO_CACHE_STORE, MODELS_CACHE_STORE } from '../engines/ports.ts';
import { licencesFor, OPENRAIL_RESTRICTIONS, licencePurpose } from './licenses.ts';
import { shortcutAction, type Shortcut } from './keys.ts';
import { spokenLine } from './scheduler.ts';
import { useStore } from './store.ts';

/** Channel labels name the actual languages, so a reversed pair reads correctly. */
function channelsFor(
  conversation: Conversation,
  t: Messages,
): Array<{ value: Channel; label: string }> {
  return [
    { value: 'l1', label: t.channelOnly(t.languageName(conversation.l1)) },
    { value: 'l2', label: t.channelOnly(t.languageName(conversation.l2)) },
    { value: 'both', label: t.channelBoth },
    { value: 'none', label: t.channelNone },
  ];
}

/** Which content channel is the learner's native language, and which is the study one. */
function labelLangs(
  conversation: Conversation,
  nativeChannel: Channel,
): { native: string; study: string } {
  return nativeChannel === 'l2'
    ? { native: conversation.l2, study: conversation.l1 }
    : { native: conversation.l1, study: conversation.l2 };
}

/**
 * The option label in a given language. Every learner-facing label must go
 * through this: `label.l1` is only "mine" when the pair is not reversed, and
 * assuming it was a real bug for `es -> en`.
 */
function labelFor(option: ResolvedOption, lang: string, conversation: Conversation): string {
  return lang === conversation.l1 ? option.label.l1 : option.label.l2;
}

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** `ANIMATE_IN_MS`, or 0 under `prefers-reduced-motion` (D4 §11.3). */
export function animateInMs(): number {
  return prefersReducedMotion() ? 0 : ANIMATE_IN_MS;
}

/* ---------------------------------------------------------------- SkipToContent */

export function SkipToContent(): preact.JSX.Element {
  const { t } = useStore();
  return (
    <a class="skip-to-content" href="#transcript">
      {t.skipToContent}
    </a>
  );
}

/* ---------------------------------------------------------------- Transport */

export function AudioStatus({ message }: { message: string }): preact.JSX.Element {
  return (
    <span class="audio-status" role="status" aria-live="polite">
      {message}
    </span>
  );
}

export function Transport(): preact.JSX.Element {
  const { conversation, state, play, stop, sessionOp, status, t } = useStore();
  const cursorIndex = conversation.order.indexOf(state.session.cursor);
  const current = resolveTimeline(conversation, state.session).find(
    (beat) => beat.beatId === state.session.cursor,
  );
  const pending = current?.status === 'pending';

  return (
    <div class="transport">
      <button type="button" onClick={stop}>
        {t.pause}
      </button>
      <button type="button" class="primary-action" onClick={play} aria-label={t.play}>
        {t.play}
      </button>
      <button type="button" onClick={play} aria-label={t.replayCurrent}>
        {t.replay}
      </button>
      <button type="button" onClick={() => sessionOp({ type: 'rewind' })}>
        {t.previous}
      </button>
      <button type="button" disabled={pending} onClick={() => sessionOp({ type: 'advance' })}>
        {t.next}
      </button>
      <span class="beat-counter">{t.beatOf(cursorIndex + 1, conversation.order.length)}</span>
      <AudioStatus message={status} />
    </div>
  );
}

/* ---------------------------------------------------------------- Toolbar */

function ChannelControl({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: Channel;
  onChange: (next: Channel) => void;
}): preact.JSX.Element {
  const { conversation, t } = useStore();
  return (
    <fieldset class="channel-control">
      <legend>{legend}</legend>
      {channelsFor(conversation, t).map((channel) => (
        <label key={channel.value}>
          <input
            type="radio"
            name={legend}
            value={channel.value}
            checked={value === channel.value}
            onChange={() => onChange(channel.value)}
          />
          {channel.label}
        </label>
      ))}
    </fieldset>
  );
}

export function ReadChannelControl(): preact.JSX.Element {
  const { state, dispatch, t } = useStore();
  return (
    <ChannelControl
      legend={t.read}
      value={state.prefs.read}
      onChange={(read) => dispatch({ type: 'prefs', patch: { read } })}
    />
  );
}

export function HearChannelControl(): preact.JSX.Element {
  const { state, dispatch, t } = useStore();
  return (
    <ChannelControl
      legend={t.hear}
      value={state.prefs.hear}
      onChange={(hear) => dispatch({ type: 'prefs', patch: { hear } })}
    />
  );
}

export function HintToggle(): preact.JSX.Element {
  const { state, dispatch, t } = useStore();
  return (
    <label class="hint-toggle">
      <input
        type="checkbox"
        role="switch"
        checked={state.prefs.hint}
        onChange={() => dispatch({ type: 'prefs', patch: { hint: !state.prefs.hint } })}
      />
      {t.hints}
    </label>
  );
}

export function SpeedControl(): preact.JSX.Element {
  const { state, dispatch, t } = useStore();
  return (
    <label class="speed-control">
      {t.speed}
      <input
        type="range"
        min={SPEED_MIN}
        max={SPEED_MAX}
        step={0.05}
        value={state.prefs.speed}
        onChange={(event) =>
          dispatch({
            type: 'prefs',
            patch: { speed: Number((event.target as HTMLInputElement).value) },
          })
        }
      />
    </label>
  );
}

export type DialogName = 'voice' | 'licenses' | 'help' | 'downloads';

export function VoiceAndAboutMenu({
  onOpen,
}: {
  onOpen: (dialog: DialogName, event?: Event) => void;
}): preact.JSX.Element {
  const { t, engine } = useStore();
  return (
    <div class="menu">
      <button type="button" onClick={(event) => onOpen('voice', event)}>
        {t.voices}
      </button>
      {engine.capabilities.cache ? (
        <button type="button" onClick={(event) => onOpen('downloads', event)}>
          {t.storage}
        </button>
      ) : null}
      <button type="button" onClick={(event) => onOpen('licenses', event)}>
        {t.licences}
      </button>
      <button type="button" onClick={(event) => onOpen('help', event)}>
        {t.keyboardHelp}
      </button>
    </div>
  );
}

export function Toolbar({
  onOpen,
}: {
  onOpen: (dialog: DialogName, event?: Event) => void;
}): preact.JSX.Element {
  return (
    <div class="toolbar">
      <ReadChannelControl />
      <HearChannelControl />
      <HintToggle />
      <SpeedControl />
      <VoiceAndAboutMenu onOpen={onOpen} />
    </div>
  );
}

/* ---------------------------------------------------------------- AudioNotice */

export function AudioNotice({
  onPlayAnyway,
}: {
  onPlayAnyway: () => void;
}): preact.JSX.Element | null {
  const { state, dispatch, t } = useStore();
  const { audio } = state;
  if (audio.name === 'voice-ok') return null;

  const notice = audio.notice;
  const text = !notice
    ? ''
    : notice.id === 'no-l2-voice'
      ? t.audioNoL2Voice(t.languageName(notice.lang ?? ''))
      : notice.id === 'engine-absent'
        ? t.audioUnavailable
        : t.audioDifferentVoice;

  return (
    <div class="audio-notice" role="note">
      <span>{text}</span>
      {audio.action ? (
        <button
          type="button"
          onClick={() => {
            onPlayAnyway();
            dispatch({ type: 'dismiss-notice' });
          }}
        >
          {t.playAnyway}
        </button>
      ) : null}
      <button type="button" onClick={() => dispatch({ type: 'dismiss-notice' })}>
        {t.dismiss}
      </button>
      {state.noticeDismissed ? <span class="notice-marker">{t.audioDegraded}</span> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- GlossPopover */

export function GlossPopover({ text }: { text: string | undefined }): preact.JSX.Element | null {
  if (!text) return null;
  return (
    <span class="gloss-popover" role="tooltip">
      {text}
    </span>
  );
}

export function Glossable({
  line,
  lang,
  role,
  onActivate,
}: {
  line: ResolvedLine;
  lang: Lang;
  /** Which side of the pair this line is on — the study line is de-emphasised. */
  role: 'native' | 'study';
  onActivate: (text: string | undefined) => void;
}): preact.JSX.Element {
  const { conversation } = useStore();
  const units = useMemo(
    () => glossWords(line.l2, conversation.l2, conversation.gloss),
    [line.l2, conversation],
  );
  return (
    <p class="dialogue-line" lang={lang} data-role={role}>
      {units.map((unit, index) =>
        unit.entry ? (
          <span
            key={`${unit.start}-${index}`}
            class="glossable"
            tabIndex={0}
            role="button"
            aria-describedby={`gloss-desc-${unit.start}`}
            onMouseEnter={() => onActivate(unit.entry?.l1)}
            onFocus={() => onActivate(unit.entry?.l1)}
            onClick={() => onActivate(unit.entry?.l1)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onActivate(unit.entry?.l1);
            }}
          >
            {unit.text}
            <span class="visually-hidden" id={`gloss-desc-${unit.start}`}>
              {unit.entry.l1}
            </span>
          </span>
        ) : (
          <span key={`${unit.start}-${index}`}>{unit.text}</span>
        ),
      )}
    </p>
  );
}

/* ---------------------------------------------------------------- Transcript */

export function SpeakerLabel({ name }: { name: string }): preact.JSX.Element {
  return <span class="speaker-label">{name}</span>;
}

export function HintLine({ hint }: { hint: string }): preact.JSX.Element {
  return <p class="hint-line">{hint}</p>;
}

export function DialogueLine({
  text,
  lang,
  role,
}: {
  text: string;
  lang: Lang;
  role: 'native' | 'study';
}): preact.JSX.Element {
  return (
    <p class="dialogue-line" lang={lang} data-role={role}>
      {text}
    </p>
  );
}

export function L2NotSpokenMarker(): preact.JSX.Element {
  const { conversation, t } = useStore();
  return <span class="l2-not-spoken">{t.l2NotSpoken(t.languageName(conversation.l2))}</span>;
}

export function PreviewButton({
  option,
  onPreview,
  disabled,
}: {
  option: ResolvedOption;
  onPreview: (option: ResolvedOption) => void;
  disabled: boolean;
}): preact.JSX.Element {
  const { conversation, t, nativeChannel } = useStore();
  const langs = labelLangs(conversation, nativeChannel);
  return (
    <button
      type="button"
      class="preview"
      disabled={disabled}
      aria-label={`${t.preview}: ${labelFor(option, langs.native, conversation)}`}
      onClick={(event) => {
        event.stopPropagation();
        onPreview(option);
      }}
    >
      {t.preview}
    </button>
  );
}

export function OptionCard({
  option,
  beatId,
  onChoose,
  onPreview,
  showL2,
  canPreview,
}: {
  option: ResolvedOption;
  /** The owning beat. Option keys are unique within a beat, not across a conversation. */
  beatId: string;
  onChoose: (key: ChoiceKey) => void;
  onPreview: (option: ResolvedOption) => void;
  showL2: boolean;
  canPreview: boolean;
}): preact.JSX.Element {
  const { conversation, nativeChannel } = useStore();
  const langs = labelLangs(conversation, nativeChannel);
  // `ResolvedOption` carries no icon (D2 §11); the icon is label-class data on
  // the built option, so the UI reads it from the conversation — scoped to the
  // owning beat, because option keys are only unique within one (AC-UI-35).
  const icon = (conversation.beats[beatId]?.alternatives ?? [])
    .flatMap((alternative) => alternative.options ?? [])
    .find((built) => built.key === option.key)?.icon;
  return (
    <li class="option-card" data-ghost={option.ghost ? 'true' : 'false'}>
      <button
        type="button"
        class="option-choose"
        onClick={() => onChoose(option.key)}
        style={{ minHeight: `${MIN_TARGET_PX}px` }}
      >
        {icon ? (
          <span class="option-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {labelFor(option, langs.native, conversation)}
        {showL2 ? (
          <span lang={langs.study}> · {labelFor(option, langs.study, conversation)}</span>
        ) : null}
      </button>
      <PreviewButton option={option} onPreview={onPreview} disabled={!canPreview} />
    </li>
  );
}

export function ChoiceCards({
  beat,
  onChoose,
  onPreview,
  showL2,
  canPreview,
}: {
  beat: ResolvedBeat;
  onChoose: (key: ChoiceKey) => void;
  onPreview: (option: ResolvedOption) => void;
  showL2: boolean;
  canPreview: boolean;
}): preact.JSX.Element {
  return (
    <ul class="choice-cards">
      {(beat.options ?? []).map((option) => (
        <OptionCard
          key={option.key}
          option={option}
          beatId={beat.beatId}
          onChoose={onChoose}
          onPreview={onPreview}
          showL2={showL2}
          canPreview={canPreview}
        />
      ))}
    </ul>
  );
}

export function GhostOptions({
  beat,
  onPreview,
  canPreview,
}: {
  beat: ResolvedBeat;
  onPreview: (option: ResolvedOption) => void;
  canPreview: boolean;
}): preact.JSX.Element | null {
  const { t, conversation, nativeChannel } = useStore();
  const langs = labelLangs(conversation, nativeChannel);
  const ghosts = (beat.options ?? []).filter((option) => option.ghost);
  if (ghosts.length === 0) return null;
  return (
    <ul class="ghost-options">
      {ghosts.map((option) => (
        <li key={option.key} class="ghost-option">
          <span>{labelFor(option, langs.native, conversation)}</span>
          <button type="button" disabled={!canPreview} onClick={() => onPreview(option)}>
            {t.replayOption}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function UnreachableTailNote({ count }: { count: number }): preact.JSX.Element | null {
  const { t } = useStore();
  if (count <= 0) return null;
  return (
    <p class="unreachable-tail" role="note">
      {t.laterBeatsReset(count)}
    </p>
  );
}

/**
 * The completion state.
 *
 * The moment the conversation is fully determined is the only thing the learner
 * actually authored, so it gets its own surface: the chain of decisions they
 * made, each one editable in place, and a way to hear the whole thing. Tapping
 * the other option on a step is the same `choose` the transcript uses, so
 * downstream beats are re-derived by the domain rather than by this component.
 */
export function CompletionPanel({
  decisions,
  onPlay,
  onChoose,
}: {
  decisions: ResolvedBeat[];
  onPlay: () => void;
  onChoose: (beatId: string, key: ChoiceKey) => void;
}): preact.JSX.Element {
  const { conversation, t, nativeChannel } = useStore();
  const langs = labelLangs(conversation, nativeChannel);
  return (
    <section class="completion" aria-labelledby="completion-title">
      <h2 id="completion-title">{t.conversationReady}</h2>
      <p class="completion-lede">{t.completionLede(decisions.length)}</p>
      <ol class="decision-chain">
        {decisions.map((beat) => (
          <li key={beat.beatId} class="decision-step">
            <span class="decision-speaker">
              {conversation.characters[beat.speaker]?.name ?? beat.speaker}
            </span>
            <span class="decision-options">
              {(beat.options ?? []).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  class={option.chosen ? 'decision-option chosen' : 'decision-option'}
                  aria-pressed={option.chosen}
                  onClick={() => {
                    if (!option.chosen) onChoose(beat.beatId, option.key);
                  }}
                >
                  {labelFor(option, langs.native, conversation)}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <button type="button" class="primary play-whole" onClick={onPlay}>
        {t.playWhole}
      </button>
    </section>
  );
}

export function BeatRow({
  beat,
  onChoose,
  onPreview,
  tailCount,
  playback = false,
  active = false,
}: {
  beat: ResolvedBeat;
  onChoose: (key: ChoiceKey) => void;
  onPreview: (option: ResolvedOption) => void;
  tailCount: number;
  /** Playback hides the ghosts so the composed conversation reads cleanly. */
  playback?: boolean;
  active?: boolean;
}): preact.JSX.Element {
  const { conversation, state, visibility, nativeChannel } = useStore();
  const { audio } = state;
  const name = conversation.characters[beat.speaker]?.name ?? beat.speaker;
  const [activeGloss, setActiveGloss] = useState<string | undefined>(undefined);
  const line = spokenLine(beat);

  return (
    <li
      class="beat-row"
      data-status={beat.status}
      data-speaker={beat.speaker}
      data-active={active ? 'true' : 'false'}
    >
      <SpeakerLabel name={name} />
      {visibility.showHint && beat.hint ? <HintLine hint={beat.hint} /> : null}
      {line && visibility.showL2 ? (
        <Glossable
          line={line}
          lang={conversation.l2}
          role={nativeChannel === 'l2' ? 'native' : 'study'}
          onActivate={setActiveGloss}
        />
      ) : null}
      {line && visibility.showL1 ? (
        <DialogueLine
          text={line.l1}
          lang={conversation.l1}
          role={nativeChannel === 'l1' ? 'native' : 'study'}
        />
      ) : null}
      {line && !audio.l2Available && visibility.showL2 ? <L2NotSpokenMarker /> : null}
      <GlossPopover text={activeGloss} />
      {beat.kind === 'choice' && beat.status === 'pending' ? (
        <ChoiceCards
          beat={beat}
          onChoose={onChoose}
          onPreview={onPreview}
          showL2={visibility.showL2}
          canPreview={audio.canPreview}
        />
      ) : null}
      {beat.kind === 'choice' && beat.status === 'resolved' && !playback ? (
        <GhostOptions beat={beat} onPreview={onPreview} canPreview={audio.canPreview} />
      ) : null}
      {beat.status === 'unreached' ? <UnreachableTailNote count={tailCount} /> : null}
    </li>
  );
}

export function Transcript({
  playback = false,
  activeBeatId = null,
}: {
  playback?: boolean;
  activeBeatId?: string | null;
} = {}): preact.JSX.Element {
  const { conversation, state, scheduler, visibility, choose } = useStore();
  const beats = resolveTimeline(conversation, state.session);
  const revealedIndex = conversation.order.indexOf(state.session.revealed);
  const visible = beats.filter((beat) => conversation.order.indexOf(beat.beatId) <= revealedIndex);
  const unreachedCount = beats.filter((beat) => beat.status === 'unreached').length;
  // The tail note describes beats invalidated by a re-pick (D4 §7.5), so it only
  // appears once the learner has actually chosen something. Before the first
  // choice the tail is just the unplayed remainder, and announcing that beats
  // "were reset" on load — before anything has happened — is simply wrong.
  const hasChosen = Object.keys(state.session.choices).length > 0;

  function preview(option: ResolvedOption): void {
    const beat = beats.find((candidate) =>
      (candidate.options ?? []).some((candidateOption) => candidateOption.key === option.key),
    );
    if (!beat) return;
    // Preview never changes session state (AC-UI-10); it is a read.
    void scheduler.preview(option.line, beat, visibility);
  }

  return (
    <ol class="transcript" id="transcript">
      {visible.map((beat) => (
        <BeatRow
          key={beat.beatId}
          beat={beat}
          onChoose={choose}
          onPreview={preview}
          tailCount={0}
          playback={playback}
          active={activeBeatId === beat.beatId}
        />
      ))}
      {hasChosen && unreachedCount > 0 ? (
        <li class="tail-row">
          <UnreachableTailNote count={unreachedCount} />
        </li>
      ) : null}
    </ol>
  );
}

/* ---------------------------------------------------------------- WhatIfPanel */

export function WhatIfPanel(): preact.JSX.Element {
  const { conversation, state, dispatch, t, nativeChannel } = useStore();
  const langs = labelLangs(conversation, nativeChannel);
  const beats = resolveTimeline(conversation, state.session);
  const decisions = beats.filter((beat) => beat.kind === 'choice' && beat.chosenKey);
  const [changes, setChanges] = useState<Record<string, ChoiceKey>>({});
  const projected = resolveTimeline(
    conversation,
    { ...state.session, choices: { ...state.session.choices, ...changes } },
    { autoPick: true },
  );

  function makeReal(beatId: string, key: ChoiceKey): void {
    dispatch({ type: 'session', op: { type: 'choose', beatId, key } });
  }

  return (
    <section class="what-if" aria-label={t.whatIf}>
      <h2>{t.whatIf}</h2>
      <p>{t.whatIfLede}</p>
      {decisions.map((beat) => (
        <div key={beat.beatId} class="what-if-decision">
          <span>{beat.beatId}</span>
          {(beat.options ?? []).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={(changes[beat.beatId] ?? beat.chosenKey) === option.key}
              onClick={() => setChanges((current) => ({ ...current, [beat.beatId]: option.key }))}
            >
              {labelFor(option, langs.native, conversation)}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              makeReal(beat.beatId, changes[beat.beatId] ?? (beat.chosenKey as ChoiceKey))
            }
          >
            {t.makeThisReal}
          </button>
        </div>
      ))}
      <ol>
        {projected.map((beat) => (
          <li key={beat.beatId} data-auto-picked={beat.autoPicked ? 'true' : 'false'}>
            {beat.beatId}
            {beat.autoPicked ? t.autoPicked : ''}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- Dialogs */

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: preact.ComponentChildren;
}): preact.JSX.Element {
  const { t } = useStore();
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  );
}

/** Delete the `audio` and `models` stores without importing the model layer. */
function clearCachedAudio(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const request = indexedDB.open('yds.audio.v1', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction([AUDIO_CACHE_STORE, MODELS_CACHE_STORE], 'readwrite');
      tx.objectStore(AUDIO_CACHE_STORE).clear();
      tx.objectStore(MODELS_CACHE_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
    request.onerror = () => resolve();
  });
}

export function DownloadsDialog({ onClose }: { onClose: () => void }): preact.JSX.Element {
  const { t } = useStore();
  const [deleted, setDeleted] = useState(false);
  const totalMb = Math.round(browserRegistry.reduce((sum, e) => sum + e.totalBytes, 0) / 1048576);
  return (
    <Dialog title={t.storage} onClose={onClose}>
      <p>{t.storageTotal(totalMb)}</p>
      <button
        type="button"
        onClick={() => {
          void clearCachedAudio().then(() => setDeleted(true));
        }}
      >
        {t.deleteCachedAudio}
      </button>
      {deleted ? <p role="status">{t.storageDeleted}</p> : null}
    </Dialog>
  );
}

export function LicensesDialog({ onClose }: { onClose: () => void }): preact.JSX.Element {
  const { t, engine } = useStore();
  const entries = licencesFor(engine.id, browserRegistry);
  return (
    <Dialog title={t.licencesHeading} onClose={onClose}>
      <p>{engine.id === 'speech-synthesis' ? t.offlineStatement : t.offlineStatementDownloads}</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.licence}</strong> — {licencePurpose(t, entry)}
            {entry.detail ? <span class="licence-detail"> ({entry.detail})</span> : null}
            {entry.restricted ? <p>{OPENRAIL_RESTRICTIONS}</p> : null}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function VoiceOverridesDialog({
  onClose,
  onResolved,
}: {
  onClose: () => void;
  onResolved: (characterId: string, lang: Lang) => string | null;
}): preact.JSX.Element {
  const { conversation, state, dispatch, engine, t } = useStore();
  const characters = Object.entries(conversation.characters);
  return (
    <Dialog title={t.voiceOverridesHeading} onClose={onClose}>
      {engine.capabilities.preservesVoiceIdentityAcrossLangs ? null : (
        <p class="voice-independence">{t.voiceIndependence}</p>
      )}
      <table>
        <tbody>
          {characters.map(([characterId, character]) =>
            [conversation.l1, conversation.l2].map((lang) => (
              <tr key={`${characterId}-${lang}`}>
                <td>{character.name}</td>
                <td>{t.languageName(lang)}</td>
                <td>
                  <label>
                    <input
                      type="radio"
                      name={`${characterId}-${lang}`}
                      checked={state.prefs.voiceOverrides[characterId]?.[lang] === undefined}
                      onChange={() => {
                        const next = { ...state.prefs.voiceOverrides };
                        const forCharacter = { ...(next[characterId] ?? {}) };
                        delete forCharacter[lang];
                        next[characterId] = forCharacter;
                        dispatch({ type: 'prefs', patch: { voiceOverrides: next } });
                      }}
                    />
                    {t.voiceAutomatic(onResolved(characterId, lang) ?? t.unresolvableVoice)}
                  </label>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </Dialog>
  );
}

export function KeyboardHelpDialog({
  onClose,
  shortcuts,
}: {
  onClose: () => void;
  shortcuts: readonly Shortcut[];
}): preact.JSX.Element {
  const { t } = useStore();
  return (
    <Dialog title={t.keyboardHeading} onClose={onClose}>
      <table>
        <tbody>
          {shortcuts.map((shortcut) => (
            <tr key={shortcut.keys}>
              <td>
                <kbd>{shortcut.keys}</kbd>
              </td>
              <td>{shortcutAction(t, shortcut)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
