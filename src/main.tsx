/**
 * M1 application entry.
 *
 * The engine is constructed from the learner's overrides (D3 §3.1.1), and the
 * conversation comes from the single entry module (D6 §2.1, F1).
 */

import { render } from 'preact';
import './ui/styles.css';
import { createTtsEngine, selectedEngineId } from './engines/tts/index.ts';
import { Shell } from './ui/Shell.tsx';

const root = document.getElementById('app');
if (root) {
  render(
    <Shell
      createEngine={(overrides) => createTtsEngine({ engine: selectedEngineId, overrides })}
    />,
    root,
  );
}
