import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // Subpath hosting (D5 §5). The built index.html works from a project path.
  base: './',
  build: { target: 'es2022', sourcemap: true, reportCompressedSize: true },
  // Reserved for M2; unused in M1 (D5 §5, D7 §5).
  worker: { format: 'es' },
  define: {
    __TTS_ENGINE__: JSON.stringify(process.env.TTS_ENGINE ?? 'speech-synthesis'),
  },
});
