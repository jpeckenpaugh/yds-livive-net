/**
 * The message catalogs (D4 §18.1).
 *
 * A `Messages` **type** with one member per message, not a key/value lookup.
 * `en` and `es` are both typed as `Messages`, so a missing or misspelled
 * translation is a compile error rather than a runtime fallback to English.
 *
 * Parameterised messages are functions, which is what makes the plural forms and
 * the language-name agreement expressible at all: `{count} later beats were
 * reset` cannot be built by substituting into a template in a language whose verb
 * agrees with the count.
 *
 * Licence *names* (MIT, Apache-2.0, OpenRAIL-M) are identifiers and never
 * translated — only the prose around them is (D4 §18.6).
 */

import { plural } from './plural.ts';

const EN_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
};

export type Messages = {
  /* welcome */
  appName: string;
  welcomeLede: string;
  iSpeak: string;
  imLearning: string;
  start: string;
  save: string;
  cancel: string;

  /* conversations list */
  conversations: string;
  pairLabel: (native: string, study: string) => string;
  noConversations: (native: string, study: string) => string;
  progress: (
    beats: number,
    beatsTotal: number,
    decisions: number,
    decisionsTotal: number,
  ) => string;
  complete: string;

  /* transport */
  pause: string;
  play: string;
  replay: string;
  replayCurrent: string;
  previous: string;
  next: string;
  beatOf: (n: number, total: number) => string;
  readyToPlay: string;
  playingBeat: (n: number, total: number) => string;
  paused: string;
  finished: string;

  /* toolbar */
  read: string;
  hear: string;
  channelOnly: (language: string) => string;
  channelBoth: string;
  channelNone: string;
  hints: string;
  speed: string;
  voices: string;
  licences: string;
  keyboardHelp: string;

  /* audio state */
  audioNoL2Voice: (language: string) => string;
  audioUnavailable: string;
  audioDifferentVoice: string;
  playAnyway: string;
  dismiss: string;
  audioDegraded: string;
  l2NotSpoken: (language: string) => string;

  /* transcript and choices */
  skipToContent: string;
  backToConversations: string;
  laterBeatsReset: (count: number) => string;
  preview: string;
  replayOption: string;

  /* completion */
  conversationReady: string;
  completionLede: (decisions: number) => string;
  playWhole: string;

  /* what-if */
  whatIf: string;
  whatIfLede: string;
  makeThisReal: string;
  autoPicked: string;

  /* dialogs */
  close: string;
  keyboardHeading: string;
  licencesHeading: string;
  offlineStatement: string;
  offlineStatementDownloads: string;
  storage: string;
  storageTotal: (mb: number) => string;
  deleteCachedAudio: string;
  storageDeleted: string;
  voiceOverridesHeading: string;
  voiceFor: (character: string, language: string) => string;
  resolvedVoice: (name: string) => string;
  unresolvableVoice: string;
  voiceIndependence: string;
  voiceAutomatic: (name: string) => string;

  /* licence prose (names stay verbatim in licenses.ts) */
  licencePurposeSpeech: string;
  licencePurposeUi: string;
  licencePurposeTranslation: string;
  licencePurposeRuntime: string;

  /* shortcuts (key names themselves are not translated) */
  shortcutPlayPause: string;
  shortcutReplay: string;
  shortcutPrevNext: string;
  shortcutPick: string;
  shortcutPreview: string;
  shortcutHint: string;
  shortcutGloss: string;
  shortcutWhatIf: string;
  shortcutHelp: string;
  shortcutClose: string;
  shortcutTab: string;

  /* language names, localised */
  languageName: (code: string) => string;
};

export const en: Messages = {
  appName: "You Don't Say",
  welcomeLede:
    'Listen to a conversation between two people, and decide what one of them says next. You build the conversation; then you can hear it whole.',
  iSpeak: 'I speak',
  imLearning: "I'm learning",
  start: 'Start',
  save: 'Save',
  cancel: 'Cancel',

  conversations: 'Conversations',
  pairLabel: (native, study) => `${native} → ${study} · change`,
  noConversations: (native, study) =>
    `No conversations for ${native} → ${study} yet. Try another pair.`,
  progress: (beats, beatsTotal, decisions, decisionsTotal) =>
    `${beats} of ${beatsTotal} beats · ${decisions} of ${decisionsTotal} decisions`,
  complete: 'Complete — play it again',

  pause: 'Pause',
  play: 'Play',
  replay: 'Replay',
  replayCurrent: 'Replay the current beat',
  previous: 'Previous',
  next: 'Next',
  beatOf: (n, total) => `Beat ${n} of ${total}`,
  readyToPlay: 'Ready to play',
  playingBeat: (n, total) => `Playing beat ${n} of ${total}`,
  paused: 'Paused',
  finished: 'Finished',

  read: 'Read',
  hear: 'Hear',
  channelOnly: (language) => `${language} only`,
  channelBoth: 'Both',
  channelNone: 'None',
  hints: 'Hints',
  speed: 'Speed',
  voices: 'Voices',
  licences: 'Licences',
  keyboardHelp: 'Keyboard help',

  audioNoL2Voice: (language) => `No ${language} voice is installed on this device.`,
  audioUnavailable: 'Audio is unavailable on this device. The transcript still works.',
  audioDifferentVoice: 'The spoken language is being played with a different voice.',
  playAnyway: 'Play anyway with the default voice',
  dismiss: 'Dismiss',
  audioDegraded: 'audio degraded',
  l2NotSpoken: (language) => `${language} audio is not being played`,

  skipToContent: 'Skip to content',
  backToConversations: 'Conversations',
  laterBeatsReset: (count) =>
    plural(
      count,
      '1 later beat was reset because the earlier change changed it.',
      `${count} later beats were reset because the earlier change changed them.`,
    ),
  preview: 'Preview',
  replayOption: 'Replay',

  conversationReady: 'Your conversation is ready',
  completionLede: (decisions) =>
    plural(
      decisions,
      '1 decision made. Tap the other option on any step to change it.',
      `${decisions} decisions made. Tap the other option on any step to change it.`,
    ),
  playWhole: 'Play the whole conversation',

  whatIf: 'What if',
  whatIfLede: 'This view is read-only. Beats marked auto-picked were chosen for you.',
  makeThisReal: 'Make this real',
  autoPicked: ' (auto-picked)',

  close: 'Close',
  keyboardHeading: 'Keyboard',
  licencesHeading: 'Licences',
  offlineStatement:
    'This app is offline and, in M1, downloads nothing. No server, no account, no network after first load.',
  offlineStatementDownloads:
    'The app runs offline. On first use it downloads the audio engine once (~92 MB) and caches it on this device. After that, there is no network.',
  storage: 'Audio engine',
  storageTotal: (mb) => `Downloaded to this device: ${mb} MB.`,
  deleteCachedAudio: 'Delete cached audio',
  storageDeleted: 'Cached audio deleted. It will download again on next play.',
  voiceOverridesHeading: 'Voices',
  voiceFor: (character, language) => `${character} in ${language}`,
  resolvedVoice: (name) => `Using ${name}`,
  unresolvableVoice: 'No voice available',
  voiceIndependence: 'With the built-in voices, each language uses a different voice.',
  voiceAutomatic: (name) => `Automatic (${name})`,

  licencePurposeSpeech: 'planned speech engine (M3)',
  licencePurposeUi: 'UI framework',
  licencePurposeTranslation: 'build-time translation models',
  licencePurposeRuntime: 'speech engine runtime',

  shortcutPlayPause: 'Play / pause',
  shortcutReplay: 'Replay the current beat',
  shortcutPrevNext: 'Previous / next beat',
  shortcutPick: 'Pick option N at the current pending beat',
  shortcutPreview: 'Preview option N',
  shortcutHint: 'Toggle hint',
  shortcutGloss: 'Toggle gloss on focus',
  shortcutWhatIf: 'Open / close the What-if panel',
  shortcutHelp: 'Open the keyboard help',
  shortcutClose: 'Close the topmost dialog and restore focus',
  shortcutTab: 'Move through the timeline',

  languageName: (code) => EN_LANGUAGES[code] ?? code.toUpperCase(),
};
