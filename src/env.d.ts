/// <reference types="vite/client" />

/**
 * Build-time TTS engine selector (D5 §5). Read by the single engine constructor
 * (`createTtsEngine`) in `src/engines/**`; it is not read anywhere else (D7 §4).
 */
declare const __TTS_ENGINE__: 'speech-synthesis' | 'supertonic-transformers' | 'supertonic-sherpa';
