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
  Lang,
  ResolvedBeat,
  ResolvedLine,
  ResolvedOption,
} from '../domain/types.ts';
import { glossWords } from './gloss.ts';
import { ANIMATE_IN_MS, MIN_TARGET_PX, SPEED_MAX, SPEED_MIN } from './constants.ts';
import { M1_LICENCES, OFFLINE_STATEMENT } from './licenses.ts';
import { spokenLine } from './scheduler.ts';
import { useStore } from './store.ts';

const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: 'l1', label: 'English only' },
  { value: 'l2', label: 'Spanish only' },
  { value: 'both', label: 'Both' },
  { value: 'none', label: 'None' },
];

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
  return (
    <a class="skip-to-content" href="#transcript">
      Skip to content
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
  const { conversation, state, play, stop, sessionOp, status } = useStore();
  const cursorIndex = conversation.order.indexOf(state.session.cursor);
  const current = resolveTimeline(conversation, state.session).find(
    (beat) => beat.beatId === state.session.cursor,
  );
  const pending = current?.status === 'pending';

  return (
    <div class="transport">
      <button type="button" onClick={stop}>
        Pause
      </button>
      <button type="button" onClick={play} aria-label="Play">
        Play
      </button>
      <button type="button" onClick={play} aria-label="Replay the current beat">
        Replay
      </button>
      <button type="button" onClick={() => sessionOp({ type: 'rewind' })}>
        Previous
      </button>
      <button type="button" disabled={pending} onClick={() => sessionOp({ type: 'advance' })}>
        Next
      </button>
      <span class="beat-counter">
        Beat {cursorIndex + 1} of {conversation.order.length}
      </span>
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
  return (
    <fieldset class="channel-control">
      <legend>{legend}</legend>
      {CHANNELS.map((channel) => (
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
  const { state, dispatch } = useStore();
  return (
    <ChannelControl
      legend="Read"
      value={state.prefs.read}
      onChange={(read) => dispatch({ type: 'prefs', patch: { read } })}
    />
  );
}

export function HearChannelControl(): preact.JSX.Element {
  const { state, dispatch } = useStore();
  return (
    <ChannelControl
      legend="Hear"
      value={state.prefs.hear}
      onChange={(hear) => dispatch({ type: 'prefs', patch: { hear } })}
    />
  );
}

export function HintToggle(): preact.JSX.Element {
  const { state, dispatch } = useStore();
  return (
    <label class="hint-toggle">
      <input
        type="checkbox"
        role="switch"
        checked={state.prefs.hint}
        onChange={() => dispatch({ type: 'prefs', patch: { hint: !state.prefs.hint } })}
      />
      Hints
    </label>
  );
}

export function SpeedControl(): preact.JSX.Element {
  const { state, dispatch } = useStore();
  return (
    <label class="speed-control">
      Speed
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

export type DialogName = 'voice' | 'licenses' | 'help';

export function VoiceAndAboutMenu({
  onOpen,
}: {
  onOpen: (dialog: DialogName, event?: Event) => void;
}): preact.JSX.Element {
  return (
    <div class="menu">
      <button type="button" onClick={(event) => onOpen('voice', event)}>
        Voices
      </button>
      <button type="button" onClick={(event) => onOpen('licenses', event)}>
        Licences
      </button>
      <button type="button" onClick={(event) => onOpen('help', event)}>
        Keyboard help
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
  const { state, dispatch } = useStore();
  const { audio } = state;
  if (audio.name === 'voice-ok') return null;
  return (
    <div class="audio-notice" role="note">
      <span>{audio.notice}</span>
      {audio.action ? (
        <button
          type="button"
          onClick={() => {
            onPlayAnyway();
            dispatch({ type: 'dismiss-notice' });
          }}
        >
          {audio.action}
        </button>
      ) : null}
      <button type="button" onClick={() => dispatch({ type: 'dismiss-notice' })}>
        Dismiss
      </button>
      {state.noticeDismissed ? (
        <span class="notice-marker" aria-label="Audio notice dismissed but the state remains">
          audio degraded
        </span>
      ) : null}
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
  onActivate,
}: {
  line: ResolvedLine;
  lang: Lang;
  onActivate: (text: string | undefined) => void;
}): preact.JSX.Element {
  const { conversation } = useStore();
  const units = useMemo(
    () => glossWords(line.l2, conversation.l2, conversation.gloss),
    [line.l2, conversation],
  );
  return (
    <p class="dialogue-line" lang={lang}>
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

export function DialogueLine({ text, lang }: { text: string; lang: Lang }): preact.JSX.Element {
  return (
    <p class="dialogue-line" lang={lang}>
      {text}
    </p>
  );
}

export function L2NotSpokenMarker(): preact.JSX.Element {
  return <span class="l2-not-spoken">Spanish audio is not being played</span>;
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
  return (
    <button
      type="button"
      class="preview"
      disabled={disabled}
      aria-label={`Preview ${option.label.l1}`}
      onClick={(event) => {
        event.stopPropagation();
        onPreview(option);
      }}
    >
      Preview
    </button>
  );
}

export function OptionCard({
  option,
  onChoose,
  onPreview,
  showL2,
  canPreview,
}: {
  option: ResolvedOption;
  onChoose: (key: ChoiceKey) => void;
  onPreview: (option: ResolvedOption) => void;
  showL2: boolean;
  canPreview: boolean;
}): preact.JSX.Element {
  const { conversation } = useStore();
  // `ResolvedOption` carries no icon (D2 §11); the icon is label-class data on
  // the built option, so the UI reads it from the conversation (reported gap).
  const icon = Object.values(conversation.beats)
    .flatMap((beat) => beat.alternatives)
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
        {option.label.l1}
        {showL2 ? <span lang="es"> · {option.label.l2}</span> : null}
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
  const ghosts = (beat.options ?? []).filter((option) => option.ghost);
  if (ghosts.length === 0) return null;
  return (
    <ul class="ghost-options">
      {ghosts.map((option) => (
        <li key={option.key} class="ghost-option">
          <span>{option.label.l1}</span>
          <button type="button" disabled={!canPreview} onClick={() => onPreview(option)}>
            Replay
          </button>
        </li>
      ))}
    </ul>
  );
}

export function UnreachableTailNote({ count }: { count: number }): preact.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <p class="unreachable-tail" role="note">
      {count} later {count === 1 ? 'beat was' : 'beats were'} reset because the earlier change
      changed them.
    </p>
  );
}

export function BeatRow({
  beat,
  onChoose,
  onPreview,
  tailCount,
}: {
  beat: ResolvedBeat;
  onChoose: (key: ChoiceKey) => void;
  onPreview: (option: ResolvedOption) => void;
  tailCount: number;
}): preact.JSX.Element {
  const { conversation, state, visibility } = useStore();
  const { audio } = state;
  const name = conversation.characters[beat.speaker]?.name ?? beat.speaker;
  const [activeGloss, setActiveGloss] = useState<string | undefined>(undefined);
  const line = spokenLine(beat);

  return (
    <li class="beat-row" data-status={beat.status} data-speaker={beat.speaker}>
      <SpeakerLabel name={name} />
      {visibility.showHint && beat.hint ? <HintLine hint={beat.hint} /> : null}
      {line && visibility.showL2 ? (
        <Glossable line={line} lang={conversation.l2} onActivate={setActiveGloss} />
      ) : null}
      {line && visibility.showL1 ? <DialogueLine text={line.l1} lang={conversation.l1} /> : null}
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
      {beat.kind === 'choice' && beat.status === 'resolved' ? (
        <GhostOptions beat={beat} onPreview={onPreview} canPreview={audio.canPreview} />
      ) : null}
      {beat.status === 'unreached' ? <UnreachableTailNote count={tailCount} /> : null}
    </li>
  );
}

export function Transcript(): preact.JSX.Element {
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
  const { conversation, state, dispatch } = useStore();
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
    <section class="what-if" aria-label="What if">
      <h2>What if</h2>
      <p>This view is read-only. Beats marked auto-picked were chosen for you.</p>
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
              {option.label.l1}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              makeReal(beat.beatId, changes[beat.beatId] ?? (beat.chosenKey as ChoiceKey))
            }
          >
            Make this real
          </button>
        </div>
      ))}
      <ol>
        {projected.map((beat) => (
          <li key={beat.beatId} data-auto-picked={beat.autoPicked ? 'true' : 'false'}>
            {beat.beatId}
            {beat.autoPicked ? ' (auto-picked)' : ''}
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
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function LicensesDialog({ onClose }: { onClose: () => void }): preact.JSX.Element {
  return (
    <Dialog title="Licences" onClose={onClose}>
      <p>{OFFLINE_STATEMENT}</p>
      <ul>
        {M1_LICENCES.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.licence}</strong> — {entry.purpose}
            {entry.restrictions ? <p>{entry.restrictions}</p> : null}
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
  const { conversation, state, dispatch, engine } = useStore();
  const characters = Object.entries(conversation.characters);
  return (
    <Dialog title="Voices" onClose={onClose}>
      {engine.capabilities.preservesVoiceIdentityAcrossLangs ? null : (
        <p class="voice-independence">
          With the built-in voices, each language uses a different voice.
        </p>
      )}
      <table>
        <tbody>
          {characters.map(([characterId, character]) =>
            [conversation.l1, conversation.l2].map((lang) => (
              <tr key={`${characterId}-${lang}`}>
                <td>{character.name}</td>
                <td>{lang}</td>
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
                    Automatic ({onResolved(characterId, lang) ?? 'no voice'})
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
  shortcuts: Array<{ keys: string; action: string }>;
}): preact.JSX.Element {
  return (
    <Dialog title="Keyboard" onClose={onClose}>
      <table>
        <tbody>
          {shortcuts.map((shortcut) => (
            <tr key={shortcut.keys}>
              <td>
                <kbd>{shortcut.keys}</kbd>
              </td>
              <td>{shortcut.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
