/**
 * First-run language pair, and the place to change it later.
 *
 * Both option lists come from the catalog, so a pair that has no content can
 * never be chosen — the list can never dead-end. With a single conversation this
 * offers two directions over the same content (`en -> es` and `es -> en`), which
 * is a real choice rather than a formality.
 */

import { useState } from 'preact/hooks';
import { nativeOptions, studyOptions } from '../../data/catalog.ts';
import { messagesFor } from '../i18n/index.ts';

export function Welcome({
  initialNative,
  initialStudy,
  isFirstRun,
  onStart,
  onCancel,
}: {
  initialNative: string | null;
  initialStudy: string | null;
  isFirstRun: boolean;
  onStart: (native: string, study: string) => void;
  onCancel?: () => void;
}): preact.JSX.Element {
  const natives = nativeOptions();
  const [native, setNative] = useState(initialNative ?? natives[0] ?? 'en');
  const studies = studyOptions(native);
  const [study, setStudy] = useState(
    initialStudy && studies.includes(initialStudy) ? initialStudy : (studies[0] ?? 'es'),
  );
  // The welcome screen follows the language being chosen, not the persisted one,
  // so the effect of the choice is visible before it is committed.
  const t = messagesFor(native);

  function changeNative(next: string): void {
    setNative(next);
    const options = studyOptions(next);
    if (!options.includes(study)) setStudy(options[0] ?? '');
  }

  const ready = native !== '' && study !== '' && study !== native;

  return (
    <div class="screen screen-welcome">
      <div class="welcome-card">
        <h1>{t.appName}</h1>
        <p class="welcome-lede">{t.welcomeLede}</p>

        <label class="field">
          <span class="field-label">{t.iSpeak}</span>
          <select value={native} onChange={(event) => changeNative(event.currentTarget.value)}>
            {natives.map((code) => (
              <option key={code} value={code}>
                {t.languageName(code)}
              </option>
            ))}
          </select>
        </label>

        <label class="field">
          <span class="field-label">{t.imLearning}</span>
          <select value={study} onChange={(event) => setStudy(event.currentTarget.value)}>
            {studies.map((code) => (
              <option key={code} value={code}>
                {t.languageName(code)}
              </option>
            ))}
          </select>
        </label>

        <div class="welcome-actions">
          <button
            type="button"
            class="primary"
            disabled={!ready}
            onClick={() => onStart(native, study)}
          >
            {isFirstRun ? t.start : t.save}
          </button>
          {onCancel ? (
            <button type="button" onClick={onCancel}>
              {t.cancel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
