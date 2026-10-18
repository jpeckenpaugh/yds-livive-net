/**
 * Application entry.
 *
 * The engine is constructed from the learner's overrides (D3 §3.1.1) and, at M3,
 * from the model storage seam (D3 §9): the `models` store is fetched from the
 * pinned revision and the `audio` store caches synthesised utterances.
 *
 * The model plumbing is **lazily imported in the M3 branch only**, so an M1
 * build contains no IndexedDB code and no model-fetch origin (AC-TOOL-19).
 */

import { render } from 'preact';
import './ui/styles.css';
import { createTtsEngine, selectedEngineId, withAudioCache } from './engines/tts/index.ts';
import { Shell } from './ui/Shell.tsx';
import type { Preferences } from './domain/types.ts';
import type { TtsEngine } from './engines/ports.ts';

async function engineFactory(): Promise<(overrides: Preferences['voiceOverrides']) => TtsEngine> {
  if (__TTS_ENGINE__ === 'speech-synthesis') {
    return (overrides) => createTtsEngine({ engine: selectedEngineId, overrides });
  }
  const [{ browserRegistry }, models] = await Promise.all([
    import('./engines/registry.browser.ts'),
    import('./engines/models.ts'),
  ]);
  const stores =
    typeof indexedDB === 'undefined'
      ? { audio: models.memoryStore(), models: models.memoryStore() }
      : await models.openDatabase().catch(() => ({
          audio: models.memoryStore(),
          models: models.memoryStore(),
        }));
  const audioCache = models.createAudioCache(stores.audio);
  const sizes = new Map<string, number>(
    browserRegistry.flatMap((entry) => entry.files.map((f) => [f.path, f.bytes] as const)),
  );
  const modelSource = models.createModelSource({
    store: stores.models,
    storage: models.browserStorage(),
    sizes,
  });
  return (overrides) =>
    withAudioCache(
      createTtsEngine({ engine: selectedEngineId, overrides, models: modelSource }),
      audioCache,
    );
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  render(<Shell createEngine={await engineFactory()} />, root);
}

void boot();
