/**
 * Keyboard map (D4 §11.1). The help dialog renders this table, because a map
 * that exists only in a design doc does not exist.
 */

export type Shortcut = { keys: string; action: string };

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Space', action: 'Play / pause' },
  { keys: 'R', action: 'Replay the current beat' },
  { keys: '[ / ]', action: 'Previous / next beat' },
  { keys: '1–8', action: 'Pick option N at the current pending beat' },
  { keys: 'Shift+1–8', action: 'Preview option N' },
  { keys: 'H', action: 'Toggle hint' },
  { keys: 'G', action: 'Toggle gloss on focus' },
  { keys: 'W', action: 'Open / close the What-if panel' },
  { keys: '?', action: 'Open the keyboard help' },
  { keys: 'Esc', action: 'Close the topmost dialog and restore focus' },
  { keys: 'Tab / Shift+Tab', action: 'Move through the timeline' },
];
