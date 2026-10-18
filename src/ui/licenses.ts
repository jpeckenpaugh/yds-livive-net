/**
 * The About/Licences surface (D4 §13, D3 §6.7, AC-UI-23).
 *
 * **In M1 the surface names the licences by purpose, not by model or repo.** M1
 * ships no model weights, and naming Supertonic or the OPUS-MT repos would put
 * exactly the strings `check:bundle` forbids into the emitted JS. Model names,
 * repo ids and byte sizes arrive at M3.
 *
 * Licence **identifiers** are never translated — `MIT`, `Apache-2.0` and
 * `OpenRAIL-M` are names, not prose. Only the purpose and the restriction text
 * are, so those are message keys (D4 §18.6).
 */

import type { Messages } from './i18n/index.ts';

export type LicencePurposeKey =
  'licencePurposeSpeech' | 'licencePurposeUi' | 'licencePurposeTranslation';

export type LicenceEntry = {
  id: string;
  /** A licence identifier. Verbatim, in every language. */
  licence: string;
  purposeKey: LicencePurposeKey;
  /** The one licence whose *use restrictions* must be stated, not merely listed. */
  restricted?: boolean;
};

export const M1_LICENCES: readonly LicenceEntry[] = [
  {
    id: 'openrail-m',
    licence: 'OpenRAIL-M',
    purposeKey: 'licencePurposeSpeech',
    restricted: true,
  },
  { id: 'mit', licence: 'MIT', purposeKey: 'licencePurposeUi' },
  { id: 'apache-2.0', licence: 'Apache-2.0', purposeKey: 'licencePurposeTranslation' },
];

export function licencePurpose(t: Messages, entry: LicenceEntry): string {
  return t[entry.purposeKey];
}

/**
 * The use-restriction statement for OpenRAIL-M.
 *
 * **Deliberately not translated, in any UI language** (AC-I18N-07). It states
 * licence terms, and a translation of terms is a different set of terms — the
 * learner is entitled to read the actual condition they are bound by. Only the
 * labels around it are localized.
 */
export const OPENRAIL_RESTRICTIONS =
  'OpenRAIL-M is a use-restricted licence. It forbids using the model or its outputs to harm people, to spread disinformation, or to break the law. This app uses the model only to speak a language lesson on the learner\u2019s own device, and it redistributes nothing.';
