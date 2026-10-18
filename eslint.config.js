// ESLint flat config (D5 §6).
//
// The load-bearing rule is INV-1: app code must not be able to reach a template
// or a bake-only module. The boundary's single machine-readable copy is
// `tools/scan-excludes.json` (D5 §6, A5) — a Node ESM config cannot import a
// TypeScript constant without a transpile step.
//
// Two explicit `project` entries rather than `projectService: true`: the project
// service resolves the *nearest* `tsconfig.json`, which for `tools/**` and the
// root `*.config.ts` files is the app config that deliberately excludes them.

import { readFileSync } from 'node:fs';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const excludes = JSON.parse(
  readFileSync(new URL('./tools/scan-excludes.json', import.meta.url), 'utf8'),
);
const tsconfigRootDir = import.meta.dirname;

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-artifacts/**',
      'coverage/**',
      'docs/**',
      'vendor/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir } },
    rules: {
      // The frozen contracts deliberately use distinct aliases that are all
      // `string` (`LineId | ChoiceSetId`); the rule is a false positive there.
      '@typescript-eslint/no-duplicate-type-constituents': 'off',
    },
  },
  {
    files: ['tools/**/*.ts', 'vite.config.ts', 'vitest.config.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { project: './tsconfig.node.json', tsconfigRootDir } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: excludes.scanRootExcludes,
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.source.json'],
              message: 'INV-1: templates never reach the browser (D2 §8).',
            },
            {
              group: ['**/tools/**'],
              message: 'Bake-only module reachable from app code (D2 §13).',
            },
            {
              group: ['**/transformers*'],
              message: 'Translation runs in tools/ only (locked decision 3).',
            },
            { group: ['**/onnxruntime*'], message: 'Inference runtime is not app code.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [...tseslint.configs.recommended],
  },
  {
    // Tests deliberately use async stubs (`async () => undefined`), DOM type
    // assertions and stored method references; these three rules are noise there
    // and catch nothing a type-check does not already catch.
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
