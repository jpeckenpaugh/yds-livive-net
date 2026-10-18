#!/usr/bin/env node
/**
 * AC-ENG-23 evidence producer (D3 §13).
 *
 * Synthesises **every shipping `l2` line** with the selected engine (Supertonic 2
 * int8 via sherpa-onnx, Node WASM), writes one WAV per line, and records the
 * durations and the automated audition in `test-artifacts/tts-audition/`.
 *
 * This is evidence for the owner's audition, not a substitute: the Engineer
 * cannot hear, so the final listen is the owner's. The detector's limits are in
 * `tools/audition.ts`.
 *
 * Requires `sherpa-onnx` (a build-machine-only dependency; `npm i -D sherpa-onnx`)
 * and the pinned model. Run from the repo root:
 *
 *   node tools/evidence/tts-audition.mjs [--model-dir <dir>] [--out <dir>]
 *
 * The model is fetched from the pinned revision if `--model-dir` has no files;
 * it is never committed.
 */

import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { analyseCorpus, rms } from '../audition.ts';

const require = createRequire(join(process.cwd(), 'package.json'));

// The repo id and revision come from the registry, never hardcoded (AC-ENG-11).
globalThis.__TTS_ENGINE__ = 'supertonic-sherpa';
const { browserRegistry } = await import('../../src/engines/registry.browser.ts');
const entries = browserRegistry.filter((e) => e.purpose === 'tts' || e.purpose === 'voice-style');
const entry = entries.find((e) => e.purpose === 'tts');
const REPO = entry.repoId;
const REVISION = entry.revision;
const FILES = entries.flatMap((e) => e.files.map((f) => f.path));

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const modelDir = resolve(arg('--model-dir', '.cache/supertonic-c'));
const outDir = resolve(arg('--out', 'test-artifacts/tts-audition'));
const conversationsDir = resolve('src/data/conversations');

async function ensureModel() {
  mkdirSync(modelDir, { recursive: true });
  for (const file of FILES) {
    const dest = join(modelDir, file);
    if (existsSync(dest)) continue;
    const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${file}`;
    process.stderr.write(`fetching ${file}\n`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch ${file}: ${response.status}`);
    writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
  }
}

/** Every `l2` dialogue line in a conversation artifact (the `lines` map only —
 * not the top-level `l2` language code). */
function collectL2(conversation) {
  const out = [];
  for (const [id, record] of Object.entries(conversation.lines ?? {})) {
    if (record && typeof record.l2 === 'string' && record.l2.trim()) {
      out.push({ id, text: record.l2 });
    }
  }
  return out;
}

function encodeWav(samples, sampleRate) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(v < 0 ? v * 0x8000 : v * 0x7fff, 44 + i * 2);
  }
  return buffer;
}

async function main() {
  await ensureModel();
  const sherpa = require('sherpa-onnx');
  const tts = sherpa.createOfflineTts({
    offlineTtsModelConfig: {
      offlineTtsSupertonicModelConfig: {
        durationPredictor: join(modelDir, 'duration_predictor.int8.onnx'),
        textEncoder: join(modelDir, 'text_encoder.int8.onnx'),
        vectorEstimator: join(modelDir, 'vector_estimator.int8.onnx'),
        vocoder: join(modelDir, 'vocoder.int8.onnx'),
        ttsJson: join(modelDir, 'tts.json'),
        unicodeIndexer: join(modelDir, 'unicode_indexer.bin'),
        voiceStyle: join(modelDir, 'voice.bin'),
      },
      numThreads: 1,
      debug: 0,
      provider: 'cpu',
    },
    maxNumSentences: 1,
  });

  mkdirSync(outDir, { recursive: true });
  const conversations = readdirSync(conversationsDir).filter(
    (f) => f.endsWith('.json') && !f.endsWith('.source.json') && !f.endsWith('.glossary.json'),
  );

  const entries = [];
  let index = 0;
  for (const file of conversations) {
    const conversation = JSON.parse(readFileSync(join(conversationsDir, file), 'utf8'));
    const lines = collectL2(conversation);
    // De-duplicate identical strings (one utterance per distinct line).
    const seen = new Set();
    for (const line of lines) {
      if (seen.has(line.text)) continue;
      seen.add(line.text);
      const audio = tts.generate({ text: line.text, sid: 0, speed: 1.0 });
      const samples = audio.samples;
      const sampleRate = audio.sampleRate || tts.sampleRate;
      index += 1;
      const name = `${String(index).padStart(3, '0')}-${conversation.id}.wav`;
      writeFileSync(join(outDir, name), encodeWav(samples, sampleRate));
      entries.push({
        id: `${conversation.id}:${line.id}`,
        conversation: conversation.id,
        text: line.text,
        file: name,
        durationMs: Math.round((samples.length / sampleRate) * 1000),
        rms: +rms(samples).toFixed(6),
      });
    }
  }

  const analysed = analyseCorpus(entries);
  const flagged = analysed.filter((e) => !e.ok);
  const manifest = {
    generatedBy: 'tools/evidence/tts-audition.mjs',
    engine: 'supertonic-int8-sherpa-v2',
    repo: REPO,
    revision: REVISION,
    note: 'Automated audition only. The final listening check is the owner\u2019s (AC-ENG-23).',
    lines: analysed.length,
    flagged: flagged.length,
    entries: analysed,
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `tts-audition: ${analysed.length} lines synthesised, ${flagged.length} flagged, written to ${outDir}\n`,
  );
  if (flagged.length > 0) {
    for (const f of flagged)
      process.stdout.write(`  FLAG ${f.id}: ${f.flags.join(',')} (${f.durationMs} ms)\n`);
  }
}

await main();
