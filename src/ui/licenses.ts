/**
 * The About/Licences surface (D4 §13, D3 §6.7, AC-ENG-21).
 *
 * The set is a function of the selected engine. In M1 the surface names licences
 * by **purpose** and ships no weights (D4 §13, amendment E4), so no model, repo
 * or engine string reaches the M1 bundle. At M3 it names the selected
 * packaging's licences, its runtime's, and the bytes — read from the registry,
 * never hardcoded, so no repo id lives outside the registry modules (AC-ENG-11).
 *
 * Licence **identifiers** are never translated — `MIT`, `Apache-2.0` and
 * `OpenRAIL-M` are names, not prose. Only the purpose and the restriction text
 * are, so those are message keys (D4 §18.6).
 */

import type { EngineId, BrowserAssetRegistry } from '../engines/ports.ts';
import type { Messages } from './i18n/index.ts';

export type LicencePurposeKey =
  | 'licencePurposeSpeech'
  | 'licencePurposeUi'
  | 'licencePurposeTranslation'
  | 'licencePurposeRuntime';

export type LicenceEntry = {
  id: string;
  /** A licence identifier. Verbatim, in every language. */
  licence: string;
  purposeKey: LicencePurposeKey;
  /** The one licence whose *use restrictions* must be stated, not merely listed. */
  restricted?: boolean;
  /** Verbatim product/repo/bytes — untranslated, and only present at M3. */
  detail?: string;
};

const isRestricted = (licence: string): boolean => licence.startsWith('OpenRAIL');

/** The licences of what the app ships itself, in every milestone. */
const STATIC_LICENCES: readonly LicenceEntry[] = [
  { id: 'mit-preact', licence: 'MIT', purposeKey: 'licencePurposeUi' },
  { id: 'apache-mt', licence: 'Apache-2.0', purposeKey: 'licencePurposeTranslation' },
];

/**
 * The licences to render for the selected engine. `entries` is the browser
 * registry (empty for M1), so the M3 detail strings come from data.
 */
export function licencesFor(engineId: EngineId, entries: BrowserAssetRegistry): LicenceEntry[] {
  if (engineId === 'speech-synthesis') {
    // M1: by purpose only, no product named (D4 §13).
    return [
      {
        id: 'openrail-m',
        licence: 'OpenRAIL-M',
        purposeKey: 'licencePurposeSpeech',
        restricted: true,
      },
      ...STATIC_LICENCES,
    ];
  }
  const fromRegistry = entries.flatMap((entry) => {
    const out: LicenceEntry[] = [];
    const ref = `${entry.repoId} @ ${entry.revision.slice(0, 8)} · ${(entry.totalBytes / 1048576).toFixed(1)} MB`;
    if (entry.license.weights) {
      out.push({
        id: `${entry.id}-weights`,
        licence: entry.license.weights,
        purposeKey: 'licencePurposeSpeech',
        restricted: isRestricted(entry.license.weights),
        detail: ref,
      });
    }
    if (entry.license.code && entry.purpose === 'runtime') {
      out.push({
        id: `${entry.id}-code`,
        licence: entry.license.code,
        purposeKey: 'licencePurposeRuntime',
        detail: ref,
      });
    }
    return out;
  });
  return [...fromRegistry, ...STATIC_LICENCES];
}

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

/** Kept for the M1 surface and existing tests. */
export const M1_LICENCES = licencesFor('speech-synthesis', []);
