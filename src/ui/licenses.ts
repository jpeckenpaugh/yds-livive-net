/**
 * The About/Licences surface (D4 §13, D3 §6.7, AC-UI-23).
 *
 * **In M1 the surface names the licences by purpose, not by model or repo.** M1
 * ships no model weights, and naming Supertonic or the OPUS-MT repos would put
 * exactly the strings `check:bundle` forbids into the emitted JS. Model names,
 * repo ids and byte sizes arrive at M3.
 */

export type LicenceEntry = {
  id: string;
  licence: string;
  purpose: string;
  /** The one licence whose *use restrictions* must be stated, not merely listed. */
  restrictions?: string;
};

export const M1_LICENCES: readonly LicenceEntry[] = [
  {
    id: 'openrail-m',
    licence: 'OpenRAIL-M',
    purpose: 'planned speech engine (M3)',
    restrictions:
      'OpenRAIL-M is a use-restricted licence. It forbids using the model or its outputs to harm people, to spread disinformation, or to break the law. This app uses the model only to speak a language lesson on the learner\u2019s own device, and it redistributes nothing.',
  },
  { id: 'mit', licence: 'MIT', purpose: 'UI framework' },
  { id: 'apache-2.0', licence: 'Apache-2.0', purpose: 'build-time translation models' },
];

/** The claim a learner is most likely to doubt, stated on the surface. */
export const OFFLINE_STATEMENT =
  'This app is offline and, in M1, downloads nothing. No server, no account, no network after first load.';
