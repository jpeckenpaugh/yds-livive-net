import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

/**
 * Four Vitest projects, exactly (D5 §7, AC-TOOL-16). Environments are chosen per
 * project so Node code cannot accidentally depend on jsdom.
 *
 *   domain  — the walk, reduce, resolveTimeline, visibility, segmentL2, the validator
 *   bake    — AC-CONTENT-*, AC-DOM-10/11/12, and AC-TOOL-* under test/tools/**
 *   engines — AC-ENG-* (the conformance suite)
 *   ui      — AC-UI-* (jsdom)
 */
export default defineConfig({
  define: {
    // The build-time engine selector (D5 §5), so tests can exercise either
    // registry selection. Defaults to the M1 engine, as `vite.config.ts` does.
    __TTS_ENGINE__: JSON.stringify(process.env.TTS_ENGINE ?? 'speech-synthesis'),
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: ['test/domain/**/*.spec.ts'],
          setupFiles: ['test/setup/no-network.ts'],
        },
      },
      {
        test: {
          name: 'bake',
          environment: 'node',
          include: ['test/bake/**/*.spec.ts', 'test/tools/**/*.spec.ts'],
          setupFiles: ['test/setup/no-network.ts'],
        },
      },
      {
        test: {
          name: 'engines',
          environment: 'node',
          include: ['test/engines/**/*.spec.ts'],
          setupFiles: ['test/setup/no-network.ts'],
        },
      },
      {
        plugins: [preact()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['test/ui/**/*.spec.tsx'],
        },
      },
    ],
  },
});
