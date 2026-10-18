/**
 * Keyboard map (D4 §11.1). The help dialog renders this table, because a map
 * that exists only in a design doc does not exist.
 *
 * The **key names** are not translated — `Space`, `R`, `Esc` are what is printed
 * on the keyboard. Only the described action is, so this holds a message key
 * rather than prose (D4 §18).
 */

import type { Messages } from './i18n/index.ts';

export type ShortcutKey =
  | 'shortcutPlayPause'
  | 'shortcutReplay'
  | 'shortcutPrevNext'
  | 'shortcutPick'
  | 'shortcutPreview'
  | 'shortcutHint'
  | 'shortcutGloss'
  | 'shortcutWhatIf'
  | 'shortcutHelp'
  | 'shortcutClose'
  | 'shortcutTab';

export type Shortcut = { keys: string; actionKey: ShortcutKey };

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Space', actionKey: 'shortcutPlayPause' },
  { keys: 'R', actionKey: 'shortcutReplay' },
  { keys: '[ / ]', actionKey: 'shortcutPrevNext' },
  { keys: '1–8', actionKey: 'shortcutPick' },
  { keys: 'Shift+1–8', actionKey: 'shortcutPreview' },
  { keys: 'H', actionKey: 'shortcutHint' },
  { keys: 'G', actionKey: 'shortcutGloss' },
  { keys: 'W', actionKey: 'shortcutWhatIf' },
  { keys: '?', actionKey: 'shortcutHelp' },
  { keys: 'Esc', actionKey: 'shortcutClose' },
  { keys: 'Tab / Shift+Tab', actionKey: 'shortcutTab' },
];

/** The action text for a shortcut, resolved through the active catalog. */
export function shortcutAction(t: Messages, shortcut: Shortcut): string {
  return t[shortcut.actionKey];
}
