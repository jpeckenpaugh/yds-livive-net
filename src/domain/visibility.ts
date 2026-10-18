/**
 * `visibility()` (D2 §12).
 *
 * A function of `Preferences` alone (amendment C5). `showL1`/`showL2` come from
 * `read`; `showHint` from `hint`; `playOrder` from `hear`, with L2 first when both
 * are heard (PM ruling Q8). The two carve-outs that feel beat-dependent (option
 * labels always render in at least L1; a textless beat still occupies a row) are
 * D4 §5.3 presentation rules, not part of this derivation.
 */

import type { Lang, Visibility, VisibilityOf } from './types.ts';

export const visibility: VisibilityOf = (p) => {
  const showL1 = p.read === 'l1' || p.read === 'both';
  const showL2 = p.read === 'l2' || p.read === 'both';

  let playOrder: Lang[];
  switch (p.hear) {
    case 'l1':
      playOrder = ['en'];
      break;
    case 'l2':
      playOrder = ['es'];
      break;
    case 'both':
      playOrder = ['es', 'en'];
      break;
    default:
      playOrder = [];
      break;
  }

  const result: Visibility = { showL1, showL2, showHint: p.hint, playOrder };
  return result;
};
