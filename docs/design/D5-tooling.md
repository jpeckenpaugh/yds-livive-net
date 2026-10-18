# You Don't Say — Tooling (D5)

> **Status:** 🟡 Draft — pending owner review
> **Owner:** Designer · **Reviewer:** Project Manager
> **Purpose:** The build, test and CI contract. Stack config, dependency split, npm scripts and exit codes, the lint boundary that enforces D2's INV-1, test projects, the CI job, the bundle/asset assertions, and the M4 service-worker seam.
> **Depends on:** D2 (INV-1, the diagnostic registry, the constants) · D3 (devDependency-only rule, the four CI assertions, the `speechSynthesis` mock) · D6 (the `bake` CLI, `tools/bake/**`, the `FLAG-*` codes)
> **Owns:** `package.json`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`, `.gitattributes`, `tools/check-*.mjs`, the CI workflow, the AC→test map, `AC-TOOL-*`
> **Related:** D4 (the a11y evidence this harness must produce) · D7 (build vs runtime topology)

**Precedence.** Locked decisions > `docs/design/D2`–`D7` > `README.md`.

**The one rule that shapes this whole doc:** **CI never generates.** A full bake needs ~214 MB of MT models; the CI default is `bake --check --author-only`, which verifies a committed artifact with zero network and zero downloads (D6 §3, PM ruling).

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| `package.json`: deps, devDeps, scripts, engines | Any module design → D7 |
| TypeScript/Vite/ESLint/Vitest configuration, stated exactly | Engine internals and model facts → D3 |
| The lint/test/grep mechanisms that make D2's and D3's invariants checkable | Pipeline phases and the flag format → D6 |
| The CI job, its order, its env, its failure modes | Component behaviour → D4 |
| Bundle and asset assertions | PWA/service-worker implementation (M4) |
| The AC→test map and the evidence convention | The AC criteria themselves → their owning docs |

---

## 2. Dependencies

**Runtime dependencies: one.** `preact`. There is no second runtime dependency, and that is a design constraint rather than an aspiration (README §Decisions, PM Q10): state is a hand-rolled `useReducer` + context.

| | Package | Why |
|---|---|---|
| `dependencies` | `preact` | The framework. |
| `devDependencies` | `vite`, `@preact/preset-vite` | Build. |
| | `typescript` | Types. |
| | `vitest`, `jsdom`, `@testing-library/preact` | Tests. |
| | `vitest-axe` | Structural a11y assertions in jsdom (D4 §12.1). |
| | `@playwright/test`, `@axe-core/playwright` | Browser-based a11y (contrast, zoom) + the M1 smoke path. See §9.4 — the one heavyweight dep. |
| | `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier` | Lint/format. |
| **not in M1** | `@huggingface/transformers`, `onnxruntime-node` | **Build-only, and absent until the first full bake** (D3 §10.8, amendment F3). `bake --check --author-only` never evaluates their import, `tools/bake/translator.node.ts` typechecks against a local shim, and a Node-major incompatibility therefore cannot break M1's gate. Install with `npm i -D @huggingface/transformers` when the first real bake is run (documented in D6). |
| *(M3)* | the selected TTS packaging | Per D3 §6's deferred decision. |

Rules:

1. **`@huggingface/transformers` and `onnxruntime-node`, if ever present, must be devDependencies** — never `dependencies`. Promoting either is the mechanical form of "the browser ships zero translation code" (locked decision 3). In M1 they are absent entirely. AC-TOOL-04.
2. **No `postinstall` scripts.** Determinism in CI, and no third-party code executing at install time.
3. `engines.node` is pinned (`>=22`) and a `.nvmrc` pins a major so local and a future CI agree. `onnxruntime-node` is sensitive to the Node major and a local/CI mismatch surfaces as a native-module error that looks like a code bug. ⚠ **Ratified at freeze with a caveat:** `.nvmrc` reads `22` while the development runtime is Node 26, so today `.nvmrc` is decorative — CI is out of M1's scope (PM ruling), and the floor `>=22` is the operative constraint. **When CI lands, `.nvmrc` and the CI Node version must be set to the same value**, and this note is the reminder that they currently are not. The F3 lazy-import decision (D3 §10.8) is what makes this benign rather than dangerous: nothing in M1 loads a native module.
4. Any new runtime dependency is a design decision, not a tooling decision. This doc does not pre-authorise one.

---

## 3. Scripts and exit codes

| Script | Runs | Exit code |
|---|---|---|
| `dev` | `vite` | — |
| `build` | `vite build` | non-zero on any Vite/TS error |
| `preview` | `vite preview` | — |
| `typecheck` | `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json` | non-zero on any type error |
| `lint` | `eslint .` | non-zero on any error-severity finding |
| `format` / `format:check` | prettier write / check | non-zero on drift |
| `test` / `test:watch` | `vitest run` / `vitest` | non-zero on any failed test |
| **`bake`** | `node tools/bake/main.mjs --conversation <path> [--review-policy <shipping\|fixture>]` | non-zero on a hard failure |
| **`bake:check`** | `node tools/bake/main.mjs --check --author-only --conversation src/data/conversations/m1-fixture.source.json` | **non-zero on any `error` diagnostic** (D2 §14, D6 §6) |
| **`bake:fixture`** | `node tools/bake/fixtures/generate.mjs` | regenerates the committed fixture with the fixture translator (D6 §2.4) |
| **`check:contracts`** | `node tools/check-contracts.mjs` | **non-zero on any change to a frozen contract** (§10.1) |
| `contracts:update` | `node tools/check-contracts.mjs --update` | the only way the manifest changes; **never** part of `check` or CI |
| `check:vocabulary` | `node tools/check-vocabulary.mjs` | non-zero on a mixed `int8`/`q8` usage in code |
| `check:bundle` | `node tools/check-bundle.mjs` (post-`build`) | non-zero on a forbidden string or asset |
| `check:assets` | `node tools/check-assets.mjs` | non-zero on a binary under `src/` |
| `check:ac-map` | `node tools/check-ac-map.mjs` | non-zero on a missing id, an orphaned id, or a missing test for a due id |
| `evidence` | `node tools/test-runner/run.mjs` | writes `test-artifacts/`; not part of `check` |
| `check` | `check:contracts` **first**, then `format:check && lint && typecheck && check:vocabulary && bake:check && test && build && check:bundle && check:assets && check:ac-map` | non-zero on the first failure |

`check` is the local equivalent of CI, in the same order, so "works locally" means something. **`check:contracts` is first on purpose**: if a frozen contract has moved, every later result is describing the wrong codebase, and the reader should see that failure and nothing else. AC-TOOL-01, AC-TOOL-24.

**`--review-policy <shipping|fixture>` is the mechanism behind `meta.reviewPolicy`** (amendment E1). `ConversationSource` is frozen and has no field for it, so the policy is a **bake-time argument, not authored content**:

- **it defaults to `'fixture'`**, and `'shipping'` must be given explicitly. The default is the *conservative* value on purpose: if the flag is forgotten, the artifact says "unreviewed fixture content" and the review gate downgrades to warnings, which is loud and honest. The opposite default would let an unreviewed artifact claim to be shipping content with no signal at all — which is the single thing the field exists to prevent. **Omitting the flag can never claim a human review**, and that is the property worth having.
- it is **ignored in `check` mode**, which reads the policy from the artifact it is validating;
- the only routine caller is `bake:fixture` (D6 §2.4), which passes it for clarity even though it is the default.

Consequences for the committed scripts: `npm run bake` may omit the flag and produces a fixture artifact; a shipping bake must pass `--review-policy shipping`; and `AC-CONTENT-25` is what catches a shipping bake that forgot, because the M3 criterion requires the shipping artifact to carry `'shipping'`.

### 3.0 Three things that must be arguments or explicit acts (amendments E1, E2, X0b)

Two gate defects are fixed by making a constant into a parameter:

**(a) The conversation is selected by `--conversation <path>`** (amendment E2). An earlier revision fixed the input at `src/data/conversations/ron-bobby-01.source.json`, which M1 does not have: M1's content is the development fixture. The selector makes M1 and M2 differ by **one argument** and nothing else, and it keeps the fixture out of the shipping conversation's id (D6 §2).

**(b) `check:ac-map` requires a mapped test only for ids that are *due*** (amendment E1). It demands an existing test for every id at or before `currentMilestone`, while still failing on a missing id in the docs or an orphaned id in the map. The alternative — mapping all 123 ids to `describe.skip` placeholders — was explicitly rejected: a skipped test is not evidence, and writing 60 of them to make a gate green is exactly the wrong incentive.

```jsonc
// tools/ac-map.json
{
  "currentMilestone": "M1",
  "ids": {
    "AC-DOM-09": { "milestone": "M1", "tests": ["domain/variant-key.spec.ts"] },
    "AC-UI-24":  { "milestone": "M1", "tests": ["ui/transport.spec.tsx"] },
    "AC-ENG-13": { "milestone": "M3", "tests": [] }
  }
}
```

Bumping `currentMilestone` is the only edit needed to advance the gate, and it happens in the same commit that lands the milestone's tests. AC-TOOL-10.

**(c) The contract manifest is regenerated only by an explicit act** (amendment X0b). §10.1 specifies it; the rule that matters here is that no script in `check`, and no CI job, may write `tools/contracts.sha256`. `check:contracts` only compares.

### 3.1 Spec-only deliverables — the whole `tools/` tree is written by the Engineer in M1

**Nothing under `tools/` exists yet.** Every path below is a specification in this doc set, not a file on disk, and the Engineer creates all of them in M1. Reading this doc set, five different documents name paths inside `tools/`, which is correct division of labour (specification here, creation there) but must not be mistaken for an existing tree.

| Path | Specified by | Delivers |
|---|---|---|
| `tools/scan-excludes.json` | D5 §6 (single machine-readable copy of the INV-1 boundary; D2 §13 documents the rule) | the lint boundary |
| `tools/bake/main.mjs` | D6 §3–§9 | the pipeline CLI: `--check`, `--author-only`, `--prune`, `--report`, `--adjudicate`, `--conversation <path>` |
| `tools/bake/translator.node.ts` | D3 §10 (port), D6 §4.2 (injection) | the Node `Translator` implementation, typed against a local interface and importing the runtime lazily (D3 §10.8) |
| `tools/bake/runtime-shim.d.ts` | D3 §10.8 | `declare module` for the absent inference runtime, so `typecheck` passes without it installed |
| `tools/bake/registry.build.ts` | D3 §11.1 | the build-only registry: the two OPUS-MT entries |
| `tools/check-vocabulary.mjs` | D5 §6.1 | the code-scoped `int8`/`q8` check |
| `tools/check-bundle.mjs` | D5 §6.3 | the bundle assertions, with an engine-derived forbidden list |
| `tools/check-assets.mjs` | D5 §6.2 | the binary and size assertions |
| `tools/check-ac-map.mjs` | D5 §7.4 | the milestone-aware AC→test completeness check |
| `tools/ac-map.json` | D5 §3.0(b), §7.4 | `currentMilestone` + the AC id → milestone → test file map |
| `tools/contracts.sha256` | D5 §10.1 (X0b) | the frozen-contract manifest |
| `tools/check-contracts.mjs` | D5 §10.1 (X0b) | the mismatch guard, and `--update` |
| `tools/bake/fixtures/generate.mjs` | D6 §2.4 | the fixture generator, the one caller of `--review-policy` |
| `tools/test-runner/` | D5 §10, D1 §6 | the evidence producer: writes `test-artifacts/result.json`, `test.log` and numbered artefacts |
| `tools/bake/**` fixtures | D6 §4.2 | the fake translator and its deliberately-wrong fixture |
| `test/helpers/speech-synthesis-mock.ts` | D5 §7.1, assertions D3 §4.6 | the four R5 landmines plus "no `es` voice" |

**This is the complete M1 `tools/` deliverable list** (amendment E6 adds `tools/test-runner/`, which the index and D1 §6 name as the evidence producer but nothing previously specified). Each `tools/*.mjs` script is *specified* by the AC it implements and *verified* by `check:ac-map` resolving its AC id to a real test.

---

## 4. TypeScript — exact flags

Two projects so browser and Node code cannot see each other's globals: `tsconfig.json` (app + tests) and `tsconfig.node.json` (`tools/**`, `vite.config.ts`), with no `references` cross-talk and no `paths` aliasing (aliases hide real dependency direction).

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,

    "allowImportingTsExtensions": true,
    "types": ["vite/client", "node"],

    "skipLibCheck": true
  }
}
```

| Decision | Why |
|---|---|
| `noUncheckedIndexedAccess: true` | The whole artifact is `Record<string, …>` lookups (D2 §7.1) and D6's variant-key defect was exactly this class. Every lookup must handle `undefined`. |
| **`allowImportingTsExtensions: true`** | **Required, and only because of how bake runs** (amendment E3). `tools/bake/main.mjs` is Node ESM that imports the domain's TypeScript **at runtime** under Node's type-stripping, and type-stripping does **not** resolve extensionless specifiers — so `src/domain/**` imports carry explicit `.ts` extensions and `tsc` must accept them. Legal here because `noEmit` is set; removing this flag breaks `typecheck` *and* `bake` together, which is why it is documented rather than discovered. |
| **`types: ["vite/client", "node"]`** | `vite/client` for `import.meta.env`; `node` because the bake tests use `node:fs` and `child_process` (amendment E3). ⚠ Adding `node` to the **app** project means `src/**` *could* reach a Node global. That is a real loosening, and the architecture test in §7.5 is what closes it: no `src/**` file may import `node:` or read `process.env`. The alternative — a third tsconfig for tests — was judged not worth the configuration, because the test is mechanical and cheaper to read. |
| `strict: true` without `exactOptionalPropertyTypes` | **Deliberate omission.** D2's types carry optional fields (`hint?`, `triageRef?`, `when?`) built from parsed JSON, where `undefined` legitimately appears. `exactOptionalPropertyTypes` would force a reconstruction pass on every parse and buy nothing that validation does not already buy. |
| `verbatimModuleSyntax` + `isolatedModules` | Type-only imports must be explicit, so a value import cannot smuggle a runtime module across the INV-1 boundary. |
| No path aliases | `import { reduce } from '../domain/session'` makes a layer violation visible in review. Aliases hide it. |
| `resolveJsonModule` | The generated `Conversation` is bundled via `import` so one request serves the app and there is no runtime fetch to fail offline. **Only the generated artifact** — never a `.source.json` (INV-1). |

---

## 5. Vite

```ts
export default defineConfig({
  plugins: [preact()],
  base: './',                       // subpath hosting; see §5
  build: { target: 'es2022', sourcemap: true, reportCompressedSize: true },
  worker: { format: 'es' },         // reserved for M2; unused in M1
  define: { __TTS_ENGINE__: JSON.stringify(process.env.TTS_ENGINE ?? 'speech-synthesis') },
});
```

- `base: './'` so the built `index.html` works from a subpath (the sibling repo is served from a project path). ⚠ **Amended at freeze:** an earlier revision also claimed it works from `file://` "for smoke checks". That was wrong twice over — ES modules do not load from `file://` in Chromium regardless, and `crypto.subtle` is absent in that non-secure context (D3 §7.7). The smoke path serves `dist/` over HTTP (§9.4), and `base: './'` is kept for subpath hosting only.
- `sourcemap: true` in the build: this is a learner-facing static app with no secrets, and a stack trace without a map is useless in a field report.
- `worker.format: 'es'` is present from day one **though M1 has no worker** (D3 §4.2.4). It is one line, and adding a worker config later is exactly the kind of change that gets forgotten alongside an engine swap.
- `__TTS_ENGINE__` is the build-time engine selector. The M2 swap is then `TTS_ENGINE=supertonic-transformers npm run build`, and **the port means no other file changes** (D3 §6, D7 §7).
- No `define` secrets, ever. Everything in this app is public.
- **No service worker in M1** (§12).

---

## 6. The lint boundary (INV-1)

D2's INV-1 is the structural half of "no interpolation in translated text": app code must not be able to reach a template. The mechanism lives here.

```js
// eslint.config.js (flat) — the load-bearing rule
import { readFileSync } from 'node:fs';
const excludes = JSON.parse(readFileSync(new URL('./tools/scan-excludes.json', import.meta.url), 'utf8'));

export default [{
  files: ['src/**/*.{ts,tsx}'],
  ignores: excludes.scanRootExcludes,
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['**/*.source.json'], message: 'INV-1: templates never reach the browser (D2 §8).' },
        { group: ['**/tools/**'],      message: 'Bake-only module reachable from app code (D2 §13).' },
        { group: ['**/transformers*'], message: 'Translation runs in tools/ only (locked decision 3).' },
        { group: ['**/onnxruntime*'],  message: 'Inference runtime is not app code.' },
      ],
    }],
  },
}];
```

**Why the boundary is a JSON file and not a constant in `src/domain/types.ts`** — this is a real constraint I hit while specifying it: an ESLint flat config is a Node ESM module, and Node cannot import a `.ts` constant without a transpile step. So `tools/scan-excludes.json` is the **single machine-readable copy**, read by both the ESLint config and `check:inv1`. The alternative — a constant plus a retyped duplicate plus an equality assertion — is strictly worse, and a transpile step in the lint path is worse still. D2 §13 documents the rule in prose and names this file; `types.ts` deliberately exports nothing for it. AC-TOOL-08.

Other rules: `typescript-eslint` recommended-type-checked, `react-hooks` for the reducers, and **no rule that a doc cannot justify** — every custom rule cites the AC or the invariant it enforces.

### 6.1 `check:vocabulary` — the scoped grep

D3's AC-ENG-12 forbids mixing `int8` and `q8`. The check is scoped to code files only (`.ts`, `.tsx`, `.js`, `.mjs`) and ignores `docs/**`. Reason, recorded because it is not obvious: **D3's own prose must be able to name the wrong term in order to forbid it.** A repo-wide grep fails on its own spec, and a rule that cannot name its own violation becomes a rule that gets deleted.

**It is case-sensitive and it skips its own file** (ratified judgment call 6). Both are required, not stylistic:

- **case-sensitive**, because the forbidden term is the lowercase `dtype` string `q8`. The PM ruling id `Q8` (Hear=both plays L2 then L1) is a *different* token and must not trip the check. A case-insensitive match would force the ruling to be renamed, which is the tail wagging the dog.
- **skips itself**, because `tools/check-vocabulary.mjs` necessarily contains the forbidden string in order to search for it — the same reason `docs/**` is exempt.

AC-TOOL-07.

### 6.2 `check:assets`

- no file >100 KB under `src/` (D3 / PM C10);
- **no `.bin`, `.onnx`, `.onnx_data`, or `.wasm` anywhere under `src/`** — added because ~49 KB voice styles sail under the size limit, so the size rule alone does not enforce "never commit model binaries";
- no file >1 MB under `src/data/` (the generated artifact should be tens of KB, and a sudden order-of-magnitude jump means enumeration exploded).

### 6.3 `check:bundle` (R11)

Post-`build`, over `dist/`. **The forbidden list is derived from the build's engine selection** (D3 §11.1 rule 5), because a flat list cannot be right in both milestones:

| Always forbidden in emitted JS | Why |
|---|---|
| `transformers`, `onnxruntime`, `opus-mt` | Translation never runs in a browser (locked decision 3), in any milestone |
| any registry `repoId` or pinned revision string **that is not the selected TTS packaging's** | D3 §11's rule, mechanised; catches a leaked registry entry even when its module name contains no forbidden word |
| `supertonic`, `sherpa` — **only while `__TTS_ENGINE__ === 'speech-synthesis'`** | M1 ships no engine, so their presence means a leak. At M3 the engine genuinely is in the bundle and these become permitted. |

Checks:

1. The always-forbidden list, per the table above.
2. No unselected registry `repoId` or revision in any emitted JS.
3. **No `.onnx`, `.onnx_data`, `.bin`, `.wasm` asset** in `dist/`.
4. `dist/assets/*.js` total gzip ≤ `MAX_BUNDLE_GZ_KB`. Initial value **90**, accounting for Preact plus the bundled conversation JSON plus glosses; it is an invented guard and one line to change. AC-TOOL-09.
5. `dist/index.html` exists and references no absolute origin (no `http://` or `https://` host in the emitted HTML/JS/CSS), the mechanical form of "no network after first load". Allow-listed: the licence URLs in the About surface, matched out explicitly rather than by loosening the rule.
6. **The Licences surface in M1 names no model, repo or engine** (amendment E4). This is not a separate scan: it is check 1 applied to the one surface that is *required* to talk about licences, which is why D4 §13 names licences by purpose instead (D4 §13's table).
7. **The one other allow-list entry is `www.w3.org`, and it must stay narrow** (ratified judgment call 5). The Preact JSX runtime emits the SVG/XML namespace identifier `http://www.w3.org/2000/svg`, which is a **name**, not a fetch origin — it appears in string form and would otherwise trip check 5 on a UI that renders a single `<svg>`. The allow-list matches the **namespace identifier exactly**, never the `www.w3.org` host generally, so it cannot hide a real outbound reference. If a future allow-list entry is ever proposed for a host rather than a full identifier, that is a design decision and not a tooling one.

---

## 7. Tests

Four Vitest projects, one config, environments chosen per project so Node code cannot accidentally depend on jsdom. **Exactly four** (AC-TOOL-16) — the tooling's own tests live in the `bake` project under `test/tools/**`, so nobody adds a fifth project.

| Project | Environment | Covers | Owned by |
|---|---|---|---|
| `domain` | node | `AC-DOM-01`–`09` and `13`–`23` — the walk, `reduce`, `reduceChecked`, `resolveTimeline`, `visibility`, `segmentL2`, the validator | D2 |
| `bake` | node | `AC-CONTENT-*`; **`AC-DOM-10`, `AC-DOM-11`, `AC-DOM-12`** (provenance, staleness, gloss coverage are bake behaviours, not domain behaviours — amendment D5); and **`AC-TOOL-*` under `test/tools/**`** (amendment E5) | D6 + D5 |
| `engines` | node (+ the mock) | `AC-ENG-*` — the conformance suite, cache keys, stable-key fallback, capability gating | D3 |
| `ui` | jsdom | `AC-UI-*` — presentation states, keyboard, focus, the G1 state machine, `vitest-axe` | D4 |

### 7.1 The `speechSynthesis` mock

One shared helper, `test/helpers/speech-synthesis-mock.ts`, owned by D5 as a harness, with **assertions** owned by D3 (D3 §4.6). It must be able to reproduce all four R5 landmines: a late `voiceschanged`, an unreliable `cancel()` (a `speak()` that keeps firing `onend` after cancel), a long-utterance truncation, and **complete absence** of the API. It must also support "no voice for `es`", which is the G1 path.

### 7.2 The bake fake translator

D6 owns the fixtures; D5 owns the harness. Requirements the harness must satisfy: deterministic output, byte-stable across runs, zero network, and one **deliberately wrong** fixture so the triage path is testable (D6 §4.2).

### 7.3 Forbidding network in tests

The `domain` and `bake` projects run with `network: forbid` — a test that performs a real `fetch` fails. Concretely: a `setupFiles` shim replaces global `fetch` with a thrower, and the shift is undone only for the `ui` project's fixture-serving cases. This is what makes "zero downloads in M1" a test result rather than a claim.

### 7.5 The architecture test that closes the `types: ["node"]` loosening

`tsconfig.json` includes `node` in `types` (§4), which means `src/**` *could* reach Node globals. One test closes that, and it is a ratified judgment call rather than an oversight:

> No file under `src/**` may `import 'node:…'` or read `process.env`.

This is the mechanical half of "the browser ships no Node code", and it is also what keeps the app testable in jsdom. It belongs to `AC-ARCH-01`, which already asserts the import graph; no new id. The alternative — a third `tsconfig` for the test project — was judged not worth the configuration, because the test is cheaper to read than the config is to reason about.

### 7.4 The AC→test map, and the milestone gate

`tools/ac-map.json` carries `currentMilestone` plus a per-id entry (the shape is in §3.0(b)). `check:ac-map` asserts, in both directions:

- **every** `AC-*` id in `docs/design/**` appears in the map (a missing id fails);
- every mapped id exists in the docs (an orphaned id fails);
- for every id whose `milestone <= currentMilestone`: the mapped path exists and contains at least one test whose name references the id;
- for ids beyond the current milestone: `tests` may be empty, but the id and its milestone must still be present;
- **an id may map to more than one test file** (amendment E8). `tests` is an array for exactly this, and `check:ac-map` requires **at least one** test per due id, not exactly one. `AC-DOM-21` is the case in point: it is a criterion about the *coverage of a code set*, so it is satisfied across two projects — the source and walk codes in `domain/diagnostics.spec.ts`, and the pipeline-only `E_SOURCE_STALE` in `bake/provenance.spec.ts`. Splitting the criterion would be worse: it would turn one readable statement about a set into two statements that can drift apart.

**No `describe.skip` placeholders.** A skipped test is not evidence, and writing sixty of them to turn a gate green is the wrong incentive — the Engineer was right to refuse, and this rule exists so the refusal is the specified behaviour rather than a judgement call.

This is the mechanism that lets the Engineer self-verify against the acceptance criteria and lets D1's registry stay honest. AC-TOOL-10.

---

## 8. The build order, and why it matters

```
tools/bake ──writes──▶ src/data/conversations/<id>.json  (committed)
                              │
                    import (resolveJsonModule)
                              ▼
src/domain ◀── src/engines ◀── src/ui ──▶ vite build ──▶ dist/
```

Bake **precedes** the build and is never invoked by it. There is no `prebuild` hook: a build that silently re-drafts Spanish would make every build non-reproducible and could rewrite a human's edit. `npm run build` asserts the artifact exists and is fresh only in the sense of type-checking it; **freshness is `bake:check`'s job**, in CI, before the build. AC-TOOL-03.

---

## 9. CI

One job, ordered steps, fail-fast. Then a second, optional job for the browser pass.

| # | Step | Fails on |
|---|---|---|
| 1 | checkout · setup-node (from `.nvmrc`) · `npm ci` | lockfile drift |
| 2 | `npm run format:check` | formatting drift |
| 3 | `npm run lint` | any error-severity finding, including INV-1 |
| 4 | `npm run typecheck` | any type error |
| 5 | `npm run check:vocabulary` | mixed `int8`/`q8` in code |
| 6 | **`npm run bake:check`** with `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, an empty `HF_HOME`, and `--author-only` | any `error` diagnostic |
| 7 | `npm run test` | any failed test |
| 8 | `npm run build` | build error |
| 9 | `npm run check:bundle` · `check:assets` · `check:ac-map` | any assertion |
| 10 | *(browser job)* Playwright: smoke + a11y | §9.4 |

### 9.1 CI never generates

There is no job that runs `bake` in `write` mode, and no job with a cacheable HF model directory. `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` are set on step 6 so that a stray un-cached model load **fails loudly** instead of quietly downloading 214 MB from a CI runner. That env pair is the enforcement mechanism behind AC-CONTENT-13, and it is the reason the offline claim is checkable.

### 9.2 The coverage report

D6 §9's `review/report.<id>.md` is generated. CI regenerates it into a **temp path and compares**, rather than writing in-tree, so a stale committed report fails the job instead of being silently rewritten. AC-TOOL-11.

### 9.3 Cache

Cache `~/.npm` only. Never cache an HF model directory, and never cache `node_modules` without the lockfile hash in the key.

### 9.4 The browser job (the one heavyweight dependency)

Playwright in Chromium, on the built artifact, serving `dist/` locally. It earns its place three times over:

1. **It is the only place `AC-UI-22`'s contrast, 200%-zoom and resize requirements can actually be checked.** jsdom computes no layout and no colours, so `vitest-axe` in the `ui` project covers structure and ARIA only. `AC-UI-22` therefore has **two evidence sources**, and that split is stated rather than implied.
2. It provides a real end-to-end smoke path over the whole loop.
3. **Headless Chromium typically has no `es` voice**, so the browser job exercises the **G1 `no-l2-voice` state** for free. The degraded path — the one hardest to notice in manual testing — is the one CI sees on every run. That is worth the dependency on its own.

If the owner would rather not carry Playwright in M1, the honest downgrade is to move the contrast/zoom half of `AC-UI-22` to M2 and record it, rather than to claim it passes. Flagged (§11).

---

## 10. Repository hygiene

`.gitattributes`:

```
* text=auto eol=lf
*.png binary
*.onnx binary
*.onnx_data binary
*.bin binary
```

`eol=lf` is not cosmetic: `Conversation.meta.sourceDigest` is a hash of the source **file's bytes** (D2 §7.1), so a Windows checkout with CRLF would make every CI run report `E_SOURCE_STALE`. AC-TOOL-12.

`.gitignore`:

```
node_modules/  dist/  coverage/  test-artifacts/  *.log  .DS_Store
.cache/  .hf-cache/  .huggingface/        # MT model cache (D3 §10.6)
*.onnx  *.onnx_data  *.bin  *.wasm        # model binaries are never committed (D3 / PM C10)
```

The MT cache directory needs an explicit entry: `@huggingface/transformers` in Node writes a cache beside the project by default, and an ignored-but-unlisted 214 MB directory is how a repo gets a 300 MB first commit. AC-TOOL-13.

`.prettierignore` (amendment E3, extended by X0a):

```
docs/**              # frozen specs the Engineer may not modify
dist/**
test-artifacts/**
node_modules/**
package-lock.json    # npm owns its formatting
src/data/**/*.json   # bake owns the generated format; idempotence is the check
review/report.*.md   # `bake --report` owns this file's format; idempotence is the check
src/domain/types.ts  # FROZEN CONTRACT
src/engines/ports.ts # FROZEN CONTRACT
tools/contracts.sha256  # generated by an explicit act; never rewritten
```

**The two frozen contract files are in this list, and that is not tidiness — it is a contract rule** (amendment X0a). Formatting a read-only file *is* a change to it: whitespace and comment reflow alter the file's bytes, so the manifest below would fail and, worse, a reviewer could not tell a formatting change from a semantic one. **Anything that may not be edited by the Engineer must not be rewritten by a tool the Engineer is told to run.** The incident that produced this line is the evidence: `npm run format` rewrote both contracts from 613/350 lines to 677, and it was caught only because someone noticed the line count.

**Why `docs/**` is ignored rather than formatted:** the specs are frozen and read-only to the Engineer, so a single prettier disagreement would make `format:check` permanently red with no permitted fix. A gate nobody is allowed to satisfy is worse than no gate. `src/data/**/*.json` and `review/report.*.md` are ignored for the same class of reason: `bake` writes those files, and `bake:check`'s idempotence assertion (AC-CONTENT-03) governs their stability, so prettier must not fight the writer.

### 10.1 The contract manifest (amendment X0b)

The ignore list prevents *prettier* from rewriting the contracts. The manifest prevents **anything** from doing it silently — a formatter, an editor, a codemod, a `sed`, or a well-meaning refactor.

| Artefact | Role |
|---|---|
| `tools/contracts.sha256` | `sha256` of `src/domain/types.ts` and `src/engines/ports.ts`, one line each, `<hash>  <path>` |
| `tools/check-contracts.mjs` | recomputes both hashes and fails on **any** mismatch, and on the file *set* differing (an added, removed or renamed contract is also a failure) |
| `npm run check:contracts` | the runner |
| `npm run contracts:update` | `node tools/check-contracts.mjs --update` — **the only way the manifest changes** |

**Regenerating the manifest is an explicit, reviewable act**, and the rules around it are the point:

1. It is **never** a side effect of `build`, `bake`, `test`, `format`, `lint`, or any script in `check`. If it were, the guard would be self-defeating: the thing it protects against is a tool changing a file without anyone deciding to.
2. It accompanies a **legitimate contract amendment**, in the same commit as the doc edit that authorises it, so the diff shows a hash change next to the sentence that permits it. A hash change with no doc change is the signature of an accident.
3. It is therefore **never** run by CI. CI runs `check:contracts` and nothing else; a CI job that regenerated the manifest would make every contract change invisible.
4. The manifest is placed in `tools/` alongside `scan-excludes.json` and `ac-map.json`, because all three are machine-readable check inputs that D5 owns and the Engineer generates. Its **path** is my choice, not a ruling; the PM named the file without a directory.

`check:contracts` runs **first** in `check`'s order: if the contracts have moved, nothing after it means anything, and a mismatch is the one failure a reader should see before a hundred downstream ones.

**Evidence convention.** `test-artifacts/` holds `result.json`, `test.log` and numbered artefacts (screenshots from the browser job), written by `tools/test-runner/` — the eleventh M1 deliverable (§3.1, amendment E6). It is **generated and ignored**; the committed part is `test-artifacts/README.md` documenting the format. Committing per-run logs would churn the tree on every CI run, so only the format is committed.

---

## 11. What the service worker will be (M4 reserve only)

**M1 ships no service worker** (PM ruling Q9). M1 has nothing to cache — the app is one HTML file, one JS bundle and one JSON import, all fetched once — and a versioned precache is pure cache-versioning risk in the milestone that should be about branching correctness.

What is reserved now, and nothing more:

1. `base: './'` (§5), so assets are referenced relatively and a precache manifest can be generated without rewriting URLs.
2. A single asset-reference convention: no absolute origin anywhere in the build (§6.3 item 5), so M4's manifest needs no rewriting pass.
3. The named plan: precache the build output; derive `CACHE_VERSION` from the build hash so a deploy invalidates; keep model weights in **IndexedDB**, never in the SW cache (D3 §9 owns them, and mixing them breaks eviction handling); delete stale caches on `activate`.
4. No `vite-plugin-pwa`, and no SW code, in M1.

---

## 12. Acceptance criteria (`AC-TOOL-*`)

| ID | Criterion |
|---|---|
| **AC-TOOL-01** | `npm run check` runs every assertion in §3's order and fails on the first failure; CI runs the same commands in the same order. |
| **AC-TOOL-02** | The lockfile is committed and `npm ci` in CI installs exactly it. |
| **AC-TOOL-03** | No `prebuild`/`postbuild` hook invokes bake; the build reads the committed artifact and never writes content. |
| **AC-TOOL-04** | `@huggingface/transformers` and `onnxruntime-node` are **absent from `package.json` in M1**; if either is ever added it must be a devDependency, and a test fails if it appears in `dependencies`. |
| **AC-TOOL-05** | `engines.node` and `.nvmrc` are present, and `.nvmrc`'s value is not below `engines.node`'s floor. ⚠ They are **not** required to match in M1 (CI is out of scope) and they currently do not (`.nvmrc` is `22`, the dev runtime is 26); when CI lands they must match, per §2 rule 3. |
| **AC-TOOL-06** | The flag set in §4 is present **in full**, including `allowImportingTsExtensions` and `types: ["vite/client", "node"]`, and `exactOptionalPropertyTypes` is absent; a test asserts both directions. The two additions are required by runtime type-stripping and the bake tests (E3), so "exact" means *the §4 set*, not *the set as it was before E3*. |
| **AC-TOOL-07** | `check:vocabulary` scans code files only; D3.md's `q8` occurrences do not fail it, and a `q8` literal introduced in a `.ts` file does. |
| **AC-TOOL-08** | The INV-1 boundary is enforced by lint over `tools/scan-excludes.json`; a module under `src/**` importing a `*.source.json` or `tools/**` fails, and that JSON is the only machine-readable copy of the boundary. |
| **AC-TOOL-09** | `check:bundle` asserts all six conditions in §6.3, including the **engine-derived** forbidden list, a registry `repoId` leak, and the gzip budget. |
| **AC-TOOL-10** | `check:ac-map` fails on a missing id, an orphaned id, or a missing test for an id whose milestone is at or before `currentMilestone`; it passes for later ids with empty `tests`; and no mapped test is a `describe.skip`. |
| **AC-TOOL-11** | CI regenerates the coverage report into a temp path and compares; it never writes in-tree; a stale committed report fails the job. |
| **AC-TOOL-12** | `.gitattributes` forces `eol=lf`; a CRLF-mutated source file makes `bake:check` report `E_SOURCE_STALE`, demonstrating why. |
| **AC-TOOL-13** | `.gitignore` covers the MT model cache; `check:assets` fails on any `.bin`, `.onnx`, `.onnx_data` or `.wasm` under `src/`, and on any file >100 KB under `src/`. |
| **AC-TOOL-14** | CI's bake step runs with `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and an empty model cache, and passes. |
| **AC-TOOL-15** | The `domain` and `bake` test projects fail on any real network access. |
| **AC-TOOL-16** | **Exactly four** Vitest projects exist with the environments in §7; `AC-DOM-10/11/12` live in `bake`; the tooling's own tests live in `bake` under `test/tools/**`; and no `domain`/`bake` test can reach jsdom globals. |
| **AC-TOOL-17** | The `speechSynthesis` mock reproduces all four R5 landmines plus "no `es` voice", and is used by both the `engines` and `ui` projects from one helper. |
| **AC-TOOL-18** | The browser job builds `dist/`, serves it locally, passes the smoke path, and asserts the G1 `no-l2-voice` state renders. |
| **AC-TOOL-19** | `check:bundle` finds no absolute origin in the build except allow-listed licence URLs. |
| **AC-TOOL-20** | No service-worker code, manifest or PWA plugin exists in the M1 build; `worker.format` is set and unused. |
| **AC-TOOL-21** | `bake` and `bake:check` accept `--conversation <path>`; M1's `bake:check` selects the fixture and M2 differs by that argument alone. |
| **AC-TOOL-22** | `.prettierignore` covers `docs/**`, `dist/**`, `test-artifacts/**`, `node_modules/**`, `package-lock.json`, `src/data/**/*.json`, `review/report.*.md` **and both frozen contract files**, so `format:check` cannot be made permanently red by a frozen spec or a generated artefact — and `npm run format` cannot rewrite a read-only contract (X0a). |
| **AC-TOOL-23** | `tools/test-runner/` exists and writes `test-artifacts/result.json`, `test.log` and numbered artefacts; `test-artifacts/README.md` documents the format and is the only committed file there. |
| **AC-TOOL-24** | `tools/contracts.sha256` lists exactly `src/domain/types.ts` and `src/engines/ports.ts`; `check:contracts` fails on any hash mismatch **and** on the file set differing; it runs **first** in `check`; no script in `check`, and no CI job, writes the manifest; and `contracts:update` is the only writer (§10.1, X0b). |

---

## 13. Cross-doc notes — pushback

**On D2 — nothing.** The INV-1 boundary is *implemented here* from `tools/scan-excludes.json`, and D2 §13 points at that file rather than at a TypeScript constant (A5).

**On D3 — three items, all now cross-referenced in both places:**

1. `sourceDigest` stability needs `.gitattributes eol=lf` (D3 §10 rule 7, AC-TOOL-12).
2. **The dependency list changed** (D3 §10.8, amendment F3): `@huggingface/transformers` and `onnxruntime-node` are not installed in M1, the runtime is imported lazily inside the injected port, and a `declare module` shim satisfies typecheck. AC-TOOL-04 is reworded to match.
3. **`check:bundle`'s forbidden list is engine-derived** (D3 §11.1 rule 5, §6.3). A flat list cannot be correct in both M1 and M3.

**On D6 — two additions:** §9.2's temp-path report comparison (a stale committed report must be caught by CI, not by a human noticing), and the `--conversation` selector (D6 §3, amendment E2), which is what makes M1's fixture and M2's real conversation differ by one argument.

**On D4 — one item, now resolved in D4:** `AC-UI-22`'s two evidence sources are named in D4 §12.1 (jsdom for structure, ARIA, focus order and names; Playwright for contrast, boundaries, targets, zoom, reflow). The id is unchanged. D4 §13 also now names licences by *purpose* in M1, which is what keeps §6.3's check 6 satisfiable.

**Should any of this block M1?** No. Every item is additive tooling, with one decision attached (§9.4's Playwright). The smallest viable M1 CI is steps 1–9; step 10 is the browser job and is the only optimisable line.

**Open items for the owner:**

1. §9.4 — Playwright in M1, or defer the browser-based half of `AC-UI-22` to M2? The G1-in-headless property is the argument for keeping it.
2. §6.3 — `MAX_BUNDLE_GZ_KB = 90` is an invented guard; measure after the first build and set it just above.
3. §7.4 — the AC→test map is my addition, and §3.0(b)'s milestone gate is what makes it usable in M1 rather than a wall of skips.
4. §10 — `test-artifacts/` is generated and ignored, with only its format committed. If you want the last accepted run committed as evidence, that is a one-line change and a churn decision.
