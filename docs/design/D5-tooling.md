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
| | `vitest-axe` | Structural a11y assertions in jsdom (D4 §12). |
| | `@playwright/test`, `@axe-core/playwright` | Browser-based a11y (contrast, zoom) + the M1 smoke path. See §9.4 — the one heavyweight dep. |
| | `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier` | Lint/format. |
| | `@huggingface/transformers`, `onnxruntime-node` | **Build-only** MT drafting (D3 §10, D6 §4.2). |
| *(M2)* | `@huggingface/transformers` in the bundle, or a sherpa-onnx WASM package | TTS, per D3 §6's deferred packaging decision. |

Rules:

1. **`@huggingface/transformers` and `onnxruntime-node` are devDependencies, permanently.** Promoting either to `dependencies` must break the build: it is the mechanical form of "the browser ships zero translation code" (locked decision 3). AC-TOOL-04.
2. **No `postinstall` scripts.** Determinism in CI, and no third-party code executing at install time.
3. `engines.node` is pinned (`>=22`) and a `.nvmrc` pins the local major so local and CI agree. `onnxruntime-node` is sensitive to the Node major and a local/CI mismatch surfaces as a native-module error that looks like a code bug. AC-TOOL-05.
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
| **`bake`** | `node tools/bake/main.mjs` | non-zero on a hard failure |
| **`bake:check`** | `node tools/bake/main.mjs --check --author-only` | **non-zero on any `error` diagnostic** (D2 §14, D6 §6) |
| `check:vocabulary` | `node tools/check-vocabulary.mjs` | non-zero on a mixed `int8`/`q8` usage in code |
| `check:bundle` | `node tools/check-bundle.mjs` (post-`build`) | non-zero on a forbidden string or asset |
| `check:assets` | `node tools/check-assets.mjs` | non-zero on a binary under `src/` |
| `check:ac-map` | `node tools/check-ac-map.mjs` | non-zero on a missing or orphaned AC id |
| `check` | the above in order: `format:check && lint && typecheck && check:vocabulary && bake:check && test && build && check:bundle && check:assets && check:ac-map` | non-zero on the first failure |

`check` is the local equivalent of CI, in the same order, so "works locally" means something. AC-TOOL-01.

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

    "skipLibCheck": true
  }
}
```

| Decision | Why |
|---|---|
| `noUncheckedIndexedAccess: true` | The whole artifact is `Record<string, …>` lookups (D2 §7.1) and D6's defect was exactly this class. Every lookup must handle `undefined`. This single flag would have made the collision bug louder. |
| `strict: true` without `exactOptionalPropertyTypes` | **Deliberate omission.** D2's types carry optional fields (`hint?`, `triageRef?`, `when?`) built from parsed JSON, where `undefined` legitimately appears. `exactOptionalPropertyTypes` would force a reconstruction pass on every parse and buy nothing that a validation phase does not already buy. Recorded so nobody "fixes" it later without reading this. AC-TOOL-06 asserts the flag list exactly, in both directions. |
| `verbatimModuleSyntax` + `isolatedModules` | Type-only imports must be explicit, so a value import cannot smuggle a runtime module across the INV-1 boundary. |
| No path aliases | `import { reduce } from '../domain/session'` makes a layer violation visible in review. Aliases hide it. |
| `resolveJsonModule` | The generated `Conversation` is bundled via `import` so one request serves the app and there is no runtime fetch to fail offline. **Only the generated artifact** — never a `.source.json` (INV-1). |

---

## 5. Vite

```ts
export default defineConfig({
  plugins: [preact()],
  base: './',                       // subdirectory- and file-ish hosting
  build: { target: 'es2022', sourcemap: true, reportCompressedSize: true },
  worker: { format: 'es' },         // reserved for M2; unused in M1
  define: { __TTS_ENGINE__: JSON.stringify(process.env.TTS_ENGINE ?? 'speech-synthesis') },
});
```

- `base: './'` so the built `index.html` works from a subpath (the sibling repo is served from a project path) and from `file://` for smoke checks.
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

D3's AC-ENG-12 forbids mixing `int8` and `q8`. **The check is scoped to code files only** (`.ts`, `.tsx`, `.js`, `.mjs`) and ignores `docs/**`. Reason, recorded because it is not obvious: **D3's own prose must be able to name the wrong term in order to forbid it.** A repo-wide grep fails on its own spec, and a rule that cannot name its own violation becomes a rule that gets deleted. AC-TOOL-07.

### 6.2 `check:assets`

- no file >100 KB under `src/` (D3 / PM C10);
- **no `.bin`, `.onnx`, `.onnx_data`, or `.wasm` anywhere under `src/`** — added because ~49 KB voice styles sail under the size limit, so the size rule alone does not enforce "never commit model binaries";
- no file >1 MB under `src/data/` (the generated artifact should be tens of KB, and a sudden order-of-magnitude jump means enumeration exploded).

### 6.3 `check:bundle` (R11)

Post-`build`, over `dist/`:

1. **No occurrence of** `transformers`, `onnxruntime`, `opus-mt`, `supertonic`, `sherpa` in any emitted JS.
2. **No registry `repoId` or pinned revision string** in any emitted JS (D3 §11's rule, mechanised). This catches a leaked registry entry even if its module name contains none of the forbidden words.
3. **No `.onnx`, `.onnx_data`, `.bin`, `.wasm` asset** in `dist/`.
4. `dist/assets/*.js` total gzip ≤ `MAX_BUNDLE_GZ_KB`. Initial value **90**, which accounts for Preact plus the bundled conversation JSON plus glosses; it is an invented guard and one line to change. AC-TOOL-09.
5. `dist/index.html` exists and references no absolute origin (no `http://` or `https://` host in the emitted HTML/JS/CSS), which is the mechanical form of "no network after first load". Allow-listed: the license URLs in the About surface, which are `href`s and are matched out explicitly rather than by loosening the rule.

---

## 7. Tests

Four Vitest projects, one config, environments chosen per project so Node code cannot accidentally depend on jsdom:

| Project | Environment | Covers | Owned by |
|---|---|---|---|
| `domain` | node | `AC-DOM-*` — the walk, `reduce`, `resolveTimeline`, `visibility`, `segmentL2`, the validator | D2 |
| `bake` | node | `AC-CONTENT-*` — the pipeline with the **fake translator**, staleness, provenance, idempotence | D6 |
| `engines` | node (+ the mock) | `AC-ENG-*` — the conformance suite, cache keys, capability gating | D3 |
| `ui` | jsdom | `AC-UI-*` — presentation states, keyboard, focus, the G1 state machine, `vitest-axe` | D4 |

### 7.1 The `speechSynthesis` mock

One shared helper, `test/helpers/speech-synthesis-mock.ts`, owned by D5 as a harness, with **assertions** owned by D3 (D3 §4.6). It must be able to reproduce all four R5 landmines: a late `voiceschanged`, an unreliable `cancel()` (a `speak()` that keeps firing `onend` after cancel), a long-utterance truncation, and **complete absence** of the API. It must also support "no voice for `es`", which is the G1 path.

### 7.2 The bake fake translator

D6 owns the fixtures; D5 owns the harness. Requirements the harness must satisfy: deterministic output, byte-stable across runs, zero network, and one **deliberately wrong** fixture so the triage path is testable (D6 §4.2).

### 7.3 Forbidding network in tests

The `domain` and `bake` projects run with `network: forbid` — a test that performs a real `fetch` fails. Concretely: a `setupFiles` shim replaces global `fetch` with a thrower, and the shift is undone only for the `ui` project's fixture-serving cases. This is what makes "zero downloads in M1" a test result rather than a claim.

### 7.4 The AC→test map

`tools/ac-map.json`: `{ "AC-DOM-09": ["domain/variant-key.spec.ts"], … }`. `check:ac-map` asserts both directions:

- every `AC-*` id in `docs/design/**` appears in the map;
- every mapped path exists and contains at least one test whose name references the id.

This is the mechanism that lets the Engineer self-verify against the acceptance criteria and lets D1's registry stay honest. It is an addition of mine, not a ruling; it costs one script and one JSON file, and without it the AC ids are prose. AC-TOOL-10.

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

**Evidence convention.** `test-artifacts/` holds `result.json`, `test.log` and numbered artifacts (screenshots from the Playwright job). It is **generated and ignored**; the committed part is `test-artifacts/README.md` documenting the format. Judgment call: committing per-run logs would churn the tree on every CI run, so only the format is committed. Flagged (§11).

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
| **AC-TOOL-04** | `@huggingface/transformers` and `onnxruntime-node` are devDependencies, and a test fails if either appears in `dependencies`. |
| **AC-TOOL-05** | `engines.node` and `.nvmrc` are present and agree with the CI Node version. |
| **AC-TOOL-06** | The exact flag set in §4 is present, **and** `exactOptionalPropertyTypes` is absent; a test asserts both directions so the omission is deliberate rather than accidental. |
| **AC-TOOL-07** | `check:vocabulary` scans code files only; D3.md's four `q8` occurrences do not fail it, and a `q8` literal introduced in a `.ts` file does. |
| **AC-TOOL-08** | The INV-1 boundary is enforced by lint over `tools/scan-excludes.json`; a module under `src/**` importing a `*.source.json` or `tools/**` fails, and that JSON is the only machine-readable copy of the boundary (no TS constant, no retyped duplicate). |
| **AC-TOOL-09** | `check:bundle` asserts all five conditions in §6.3, including a registry `repoId` leak and the gzip budget. |
| **AC-TOOL-10** | `check:ac-map` fails on an AC id with no mapped test and on a mapped test path that does not exist or does not name its id. |
| **AC-TOOL-11** | CI regenerates the coverage report into a temp path and compares; it never writes in-tree; a stale committed report fails the job. |
| **AC-TOOL-12** | `.gitattributes` forces `eol=lf`; a CRLF-mutated source file makes `bake:check` report `E_SOURCE_STALE`, demonstrating why. |
| **AC-TOOL-13** | `.gitignore` covers the MT model cache; `check:assets` fails on any `.bin`, `.onnx`, `.onnx_data` or `.wasm` under `src/`, and on any file >100 KB under `src/`. |
| **AC-TOOL-14** | CI's bake step runs with `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and an empty model cache, and passes. |
| **AC-TOOL-15** | The `domain` and `bake` test projects fail on any real network access. |
| **AC-TOOL-16** | Four Vitest projects exist with the environments in §7, and no `domain`/`bake` test can reach jsdom globals. |
| **AC-TOOL-17** | The `speechSynthesis` mock reproduces all four R5 landmines plus "no `es` voice", and is used by both the `engines` and `ui` projects from one helper. |
| **AC-TOOL-18** | The browser job builds `dist/`, serves it locally, passes the smoke path, and asserts the G1 `no-l2-voice` state renders. |
| **AC-TOOL-19** | `check:bundle` finds no absolute origin in the build except allow-listed license URLs. |
| **AC-TOOL-20** | No service-worker code, manifest or PWA plugin exists in the M1 build; `worker.format` is set and unused. |

---

## 13. Cross-doc notes — pushback

**On D2 — nothing.** The INV-1 boundary is *implemented here* from D2's constant, and PM A2's path amendment is what makes it enforceable rather than decorative.

**On D3 — one item, resolved here rather than in D3:** `sourceDigest` stability needs `.gitattributes eol=lf`. D3 pins model revisions to stop MT output drifting; nothing pinned the *input* bytes. D3 §10 now carries the cross-reference (rule 7) and the mechanism is AC-TOOL-12.

**On D6 — one addition:** §9.2's temp-path report comparison. D6 says the report is generated; nothing said where a *stale* one is caught, and the answer must be CI rather than a human noticing.

**On D4 — one honest request, one flag:**

1. **`AC-UI-22` has two evidence sources and D4 should say so explicitly** (§9.4): structure and ARIA from `vitest-axe` in jsdom, contrast/zoom from Playwright. I am not renumbering the id — D4's ids are frozen — but D4's §12 table would be more honest if it named which requirement is checked where.
2. **The Playwright dependency is the one place I have added weight.** If the owner declines it, the honest downgrade is to move the contrast/zoom half of `AC-UI-22` to M2 and record the deferral, rather than claiming AA. The G1-in-headless property (§9.4.3) is the argument for keeping it.

**Should any of this block M1?** No. Every item is additive tooling, with one decision attached (§9.4's Playwright). The smallest viable M1 CI is steps 1–9; step 10 is the browser job and is the only optimisable line.

**Open items for the owner:**

1. §9.4 — Playwright in M1, or defer the browser-based half of `AC-UI-22` to M2?
2. §6.3 — `MAX_BUNDLE_GZ_KB = 90` is an invented guard; measure after the first build and set it just above.
3. §7.4 — the AC→test map is my addition. It is the only mechanism that keeps 100+ AC ids from becoming prose, but it is one more artefact to maintain.
4. §10 — `test-artifacts/` is generated and ignored, with only its format committed. If you want the last accepted run committed as evidence, that is a one-line change and a churn decision.
