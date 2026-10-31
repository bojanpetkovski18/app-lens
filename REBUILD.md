# AppLens: full build record and rebuild guide

This file records **everything that has been built and changed in AppLens so far**, in enough detail to rebuild the project from an empty folder and end up with the same behaviour.

- [HANDOFF.md](HANDOFF.md) says **what to do next**: the GitHub workflow, the phase plan and the rules.
- This file says **what already exists, how it was built, and how to rebuild it**.

Last updated: 2026-10-31, after the pre-release work (see Part A).

---

## How to use this file

1. **Picking the project up (normal case):** you do not need to rebuild anything. Clone the project, then follow [HANDOFF.md](HANDOFF.md) section 0.
2. **Rebuilding from scratch** (e.g. lost files, or a clean re-implementation):
   - Follow HANDOFF section 0.1 and 0.2 first: personal git identity and an empty GitHub repo.
   - Create `main` with an empty commit, then a `dev` branch from it.
   - Work through **Part B** below, step by step, in order. Commit after each step (`chore:`, `feat:`, `test:`).
   - Run the checks in **Part C**. All must pass before you open the first PR.
   - Then continue with **Phase 3** in HANDOFF section 10, on a new branch and a new PR.
3. **Rules that apply throughout** (from HANDOFF sections 8 and 11):
   - Strict TypeScript everywhere. `packages/core/src` stays pure: no DOM or Node APIs.
   - Generated data is fictional and deterministic.
   - Every CSS class starts with `al-` and is scoped under `.al-root`.
   - Manifests, attributes and URL parameters are untrusted input and are validated at the boundary.
   - No employer or third-party code, data, names or config. Samples stay fictional.

---

# Part A: What has been done (chronological record)

The history of the earlier working sessions is not available as a log, so Phases 1 and 2 below are reconstructed from the code as it exists now. The last session (2026-10-30) is recorded in full.

## A.1 Phase 1: MVP (done)

- npm workspaces monorepo with a shared strict `tsconfig.base.json`.
- `@app-lens/core`:
  - zod manifest schema and two-stage validation (shape, then references)
  - field-spec mini-language (`"money:10..500"`, `"ref:Customer"`, ...) with 27 field kinds
  - seeded PRNG (FNV-1a hash + mulberry32) with independent forked streams
  - deterministic mock data generator with dependency ordering and cycle detection
  - scenario runner (`create`, `select`, `update`, `delete`, `note`) that never mutates its input
- React viewer: Overview, Features (cards + persona matrix), Data explorer, Walkthroughs player, persona switch.
- Two fictional samples: InvoiceFlow and TaskPilot.
- Core tests.

## A.2 Phase 2: Distribution (done)

- UI extracted into the shared `@app-lens/ui` package (`AppLensView`, `Showcase`, `Frame`, `styles.css`).
- Theming: `primary`, `accent`, `radius`, `font`, `mode` (`light|dark|auto`), with sanitising of untrusted values.
- Embedded mode (no top bar), iframe mode with `postMessage` height reporting.
- `<app-lens>` web component (`@app-lens/embed`) in a Shadow DOM, built as `app-lens.js` (IIFE) and `app-lens.mjs` (ES).
- Standalone sites and the `app-lens` CLI: `init`, `validate`, `build`, `preview`, `schema`.
- JSON Schema output for editor autocomplete (`manifestJsonSchema()`).
- **Product demo video**: `buildDemo` in core, plus a research-progress step and a video-like player in the UI.
- CLI tests. Final state: **48 tests** (35 core, 13 CLI), typecheck clean, build clean.

## A.3 Session 2026-10-30: handoff planning and clean-up

All of these were made in one working session, in this order:

1. **Added a "Project intake" phase to HANDOFF.md.** The user wants to attach a project as a local folder, a GitHub link or an already published URL (example: `www.reddit.com`). The phase was planned as `app-lens attach <source>` with auto-detection, a pure `draftManifest(signals)` in core, CLI adapters per source, an SSRF guard, tarball path-traversal protection, "structure only" crawling, a viewer "Attach project" dialog and a test plan.
2. **Added section 0 to HANDOFF.md: GitHub repo and PR workflow.**
   - One-time setup, creating an empty repo, an empty `main` commit, then **PR #1 with everything built until now** (plus `LICENSE` and `README.md`).
   - **Every later phase is a new branch and a new PR.**
   - A PR plan table and rules for every PR.
3. **Added Phase 3: Code review.** An agent acting as a **senior software developer** reviews the whole codebase, finds bugs of every severity (Critical, High, Medium, Low), other issues and performance problems, and **fixes them**, with regression tests and before/after measurements.
4. **Renumbered the phases:**

   | Phase | Name | PR |
   |---|---|---|
   | 1 | MVP | #1 |
   | 2 | Distribution | #1 |
   | 3 | Code review | #2 |
   | 4 | Smarts | #3 |
   | 5 | Project intake | #4 |
   | 6 | Studio | #5 |

   Cross-references were updated: intake reuses the Phase 4 importers, and Studio starts from the Phase 5 "Attach project" flow.
5. **Removed a private third-party manifest and its tooling:**
   - Deleted the gitignored `private/` folder and the manifest in it.
   - [apps/viewer/vite.config.ts](apps/viewer/vite.config.ts): removed the dev-only `privateManifests()` Vite plugin that served `/__app-lens/private`. The config is now only `base: './'` and the React plugin.
   - [apps/viewer/src/sources.ts](apps/viewer/src/sources.ts): removed `fetchPrivateSources()`.
   - [apps/viewer/src/App.tsx](apps/viewer/src/App.tsx): removed the `privateLoaded` state and its loading effect. `sources` is now constant, and an unknown `?source=` key shows an error straight away.
   - [.gitignore](.gitignore): removed the `private/` entry.
   - HANDOFF.md: removed every reference to that manifest and `private/` (checks, layout, section 8 rules, security list, known issues). Phase 5 now writes third-party drafts to a gitignored `drafts/` folder, which that PR adds.
   - Verified afterwards: typecheck passes, 46 tests pass, build passes, and the build output has 0 matches for the removed manifest or `__app-lens/private`.
6. **Created this file (REBUILD.md).**

## A.4 Phase 3: Code review (done)

The review started with a baseline, and each confirmed bug got a regression test that failed before its fix. The fixes are in the history of `phase-3/code-review`. Changes to the behaviour described in Part B:

- **Tooling:** Node 20.19+ (CI on 22), vitest 4.1, `@types/node` 22, esbuild target `node20`, GitHub Actions CI, Playwright e2e in `e2e/`, `scripts/measure.mjs`, UI and embed unit tests with jsdom.
- **Core:** `isoDate` rejects dates that don't exist. Date offsets are limited to ±100000 days and numbers to the safe integer range. `ownValue` replaces direct lookups of untrusted names. Scenario values are checked against the field kind. Upper-case http schemes are accepted, and generated numbers are never `-0`.
- **UI:** `Showcase` is keyed by manifest and follows `initialTab` and `initialPersona` after mount. Tabs have a roving tabindex, arrow keys and a linked tabpanel. The data explorer paginates at 50 rows, opens rows from the keyboard and clears the search when the data type changes. Ref lookups use `recordIndex`, Intl formatters are cached, and `matchMedia` is optional. The demo clock steps at most 250 ms per frame, starts paused with reduced motion and finds fullscreen through `getRootNode()`.
- **Viewer:** the pinned manifest wins over `?manifest=`, invalid URLs and invalid JSON show errors, and fetches use `AbortController`.
- **Embed:** waits for inline JSON that isn't parsed yet, shares one constructable stylesheet, aborts stale fetches, has no `key` on `AppLensView`, and fires `app-lens:error` for invalid manifests.
- **CLI:** `parseCliArgs` and `serveStatic` are exported. Bad flags, folders and busy ports are `CliError`s. `init` creates parent folders. Built sites get a CSP meta tag, and the server checks `Host`.

## A.5 Phase 4: Smarts (done)

New core modules, all pure:

- `intake.ts`: `ProjectSignals`, `mergeSignals`, `kindForName`, and `draftManifest`, which cleans names, applies limits, breaks reference cycles, generates a walkthrough from a status enum and returns a report with evidence for each item.
- `importers.ts`: `importOpenApi` (OpenAPI 3 and Swagger 2, local `$ref` only), `importPrisma`, `importReadme`.
- `lint.ts`: `lintManifest` (a 0-100 score with findings) and `diffManifests`.
- `export.ts`: `buildOnePager`, `renderMarkdown`, `entityDiagram`, and `renderPdf`, a dependency-free writer using the standard PDF fonts.
- `csv.ts`: `recordsToCsv`, which neutralises spreadsheet formulas.

Elsewhere:

- The schema gains an optional top-level `draft` object (`thirdParty`, `source`).
- UI: `analytics.tsx` (`AnalyticsProvider`, `useTrack`), `onEvent` on `AppLensView`, `video.ts` (canvas renderer, `recordDemo` with `MediaRecorder`), and one-pager, CSV and JSON download buttons.
- Embed: re-dispatches interactions as `app-lens:event`. Viewer: forwards them to an iframe parent.
- CLI: `smarts.ts` with `ingest`, `export`, `lint` and `diff`; `preview --watch` with live reload over server-sent events. The `yaml` dependency is bundled, so the esbuild banner adds a `require` created with `createRequire`.
- `e2e/cli.spec.ts` runs the built binary, because unit tests import the sources and cannot catch bundling problems.

## A.6 Phase 5: Project intake (done)

- Core `projectfiles.ts`: `shouldReadPath` (shared by the CLI and the browser), `signalsFromFiles` (`package.json`, README, OpenAPI, Prisma, routes, forms, theme colours, role enums as personas, known dependencies as integrations) and `signalsFromPages`, which keeps structure only and drops anything that looks personal.
- CLI `intake/`: `folder.ts` (read-only walk, `.gitignore`, limits, no symlinks), `github.ts` (strict URL parsing, tarball through the REST API, hand-written guarded tar extraction, slash-containing branches), `net.ts` (SSRF guard, `safeFetch`), `site.ts` (`robots.txt`, sitemap, `htmlparser2` page parsing), `attach.ts` (source detection, third-party rules).
- `build` refuses a manifest with `draft.thirdParty`. `drafts/` is gitignored.
- Viewer: *Attach project* dialog, loaded lazily because of the YAML parser, and `attach-endpoint.ts`, a dev-only Vite plugin that shells out to the built CLI with no shell and checks `Host`, `Origin` and content type.

## A.7 Phase 6: Studio (done)

- `apps/studio`: `editor.ts` (undo/redo reducer, `analyze`, `locatePath`), `FormEditor.tsx`, `App.tsx` (JSON tab, problem jumping, suggestions, review step, autosave).
- `starterManifest` moved to core, and `AttachDialog` moved to `@app-lens/ui/attach` so the viewer and Studio share them.
- `AppLensView` gained `stateKey`, which keeps the tab and persona across edits. `Showcase` follows `mock.seed` and drops a persona that no longer exists.
- CLI: `studio.ts` (`app-lens studio`, local API), `ai.ts` (`aiDraft` with the official SDK), and `ingest --ai`. `serveStatic` takes an API handler. The build copies `apps/studio/dist` to `dist/studio`.
- `.github/workflows/pages.yml` publishes the samples and Studio.

## A.8 Pre-release work (2026-10-31)

- Added a `dev` branch and merged every phase into it. `dev` is now the default branch, CI runs on pushes to it, and new work uses `#00nn-...` branches.
- Added `CLAUDE.md`, `PROGRESS.md`, `DECISIONS.md` and `docs/ARCHITECTURE.md`, plus an AI-assistance note in the README. HANDOFF section 0 now describes the workflow in use.
- Added `e2e/audit.spec.ts` and `docs/AUDIT.md`. Fixes: zod runs jitless, built sites allow no inline styles, `useDialog` handles dialog focus, table wrappers can be scrolled by keyboard, and long saved paths wrap.
- `fetchManifest` in `@app-lens/ui` loads manifests for the viewer and web component, with a 5 MB limit enforced while reading.
- Pinned CI actions to commit SHAs and direct dependencies to exact versions. CI gained ESLint, a gitleaks scan of the full history, actionlint and editorconfig-checker.

---

# Part B: Rebuild from scratch

Part B describes the Phase 2 baseline. Apply the changes in Part A, sections A.4 to A.7, on top of it to reach the current code.

Follow the steps in order. File paths are relative to the repo root.

## B.1 Workspace root

**Requirements:** Node 18.20+ (Node 22 LTS recommended), npm 10.

`package.json`:
```json
{
  "name": "app-lens",
  "version": "0.2.0",
  "private": true,
  "description": "Manifest-driven, interactive showcase of what an application does, powered by generated mock data.",
  "workspaces": ["packages/core", "packages/ui", "packages/embed", "apps/viewer", "packages/cli"],
  "scripts": {
    "dev": "npm run dev -w @app-lens/viewer",
    "dev:embed": "npm run dev -w @app-lens/embed",
    "build": "npm run build -w @app-lens/viewer && npm run build -w @app-lens/embed && npm run build -w @app-lens/cli",
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "app-lens": "node packages/cli/dist/cli.js"
  },
  "devDependencies": { "@types/node": "^18.19.64", "typescript": "^5.6.3" },
  "overrides": { "vite": "6.4.5" }
}
```
The workspace order matters: core, ui, embed, viewer, cli. The build order is **viewer, then embed, then cli**, because the CLI build copies the other two outputs.

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
*.log
.DS_Store
```

Folder layout to create:
```
packages/core  packages/ui  packages/embed  packages/cli  apps/viewer  samples
```

## B.2 `@app-lens/core` (pure TypeScript)

`packages/core/package.json`:
- `name` is `@app-lens/core`, `version` is `0.2.0`, `private: true`, `type: module`.
- `main`, `types` and `exports["."]` all point to `./src/index.ts`. Packages consume the TS source directly; there is no build step.
- Scripts: `test` runs `vitest run`; `typecheck` runs `tsc --noEmit`.
- Dependencies: `zod ^4.6.7`. Dev dependencies: `vitest ^3.2.7`.

`packages/core/tsconfig.json` extends the base config with `lib: ["ES2022"]` and `types: ["node"]`, and includes `src` and `test`.

`src/index.ts` re-exports `./demo`, `./fields`, `./generator`, `./rng`, `./scenario`, `./schema` and `./validate`.

### B.2.1 `src/rng.ts`: seeded random numbers

- `Rng` interface:
  - `next()` returns a float in [0, 1)
  - `int(min, max)` is inclusive
  - `float(min, max)`
  - `pick(items)` throws `Cannot pick from an empty list` on an empty list
  - `bool(probability = 0.5)` returns `next() < probability`
  - `fork(label)`
- **Seed hash (FNV-1a, 32-bit):** start at `0x811c9dc5`. For each char code: `hash ^= c; hash = Math.imul(hash, 0x01000193)`. Return `hash >>> 0`.
- **`createRng(seed)` (mulberry32):** `state = hash(String(seed))`. Each `next()`:
  ```
  state = (state + 0x6d2b79f5) >>> 0
  t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  ```
- `int(min, max) = min + floor(next() * (max - min + 1))`, and `float(min, max) = min + next() * (max - min)`.
- `fork(label) = createRng(`${seedKey}::${label}`)`. A fork is independent of how much the parent has been used, so adding data in one place doesn't reshuffle another.
- Comment in the file: not suitable for anything security related.

### B.2.2 `src/words.ts`: fictional vocabulary (all `as const`)

| Constant | Count | Content |
|---|---|---|
| `FIRST_NAMES` | 30 | Ava, Liam, Mia, Noah, Zoe, Leo, Isla, Kai, Nora, Owen, Lena, Milo, Aria, Elias, Ruby, Theo, Ivy, Jonas, Sara, Felix, Maya, Adam, Elena, Hugo, Clara, Omar, Yara, Lucas, Emma, Ravi |
| `LAST_NAMES` | 30 | Novak, Berg, Silva, Moreau, Kowalski, Lind, Ferreira, Hart, Petrov, Okafor, Tanaka, Rossi, Keller, Dalton, Nyberg, Costa, Varga, Quinn, Larsen, Haddad, Mendes, Schultz, Ivanova, Reyes, Sato, Fischer, Ahmed, Brooks, Marin, Walsh |
| `COMPANY_PREFIXES` | 20 | Bright, North, Blue, Silver, Green, Swift, Clear, Bold, Prime, Urban, Golden, Atlas, Pine, River, Summit, Coral, Iron, Maple, Nova, Echo |
| `COMPANY_SUFFIXES` | 20 | Labs, Works, Studio, Partners, Systems, Logistics, Foods, Design, Consulting, Retail, Health, Media, Supply, Analytics, Ventures, Goods, Energy, Craft, Digital, Group |
| `JOB_TITLES` | 15 | Product Manager, Software Engineer, Designer, Data Analyst, Account Manager, Operations Lead, Support Specialist, Marketing Manager, Finance Officer, HR Partner, Team Lead, QA Engineer, Sales Representative, Project Coordinator, Office Manager |
| `CITIES` | 20 | Lisbon, Oslo, Vienna, Dublin, Prague, Toronto, Melbourne, Austin, Kyoto, Cape Town, Valencia, Tallinn, Zurich, Montreal, Auckland, Porto, Gothenburg, Ljubljana, Denver, Seville |
| `COUNTRIES` | 18 | Portugal, Norway, Austria, Ireland, Czechia, Canada, Australia, United States, Japan, South Africa, Spain, Estonia, Switzerland, New Zealand, Sweden, Slovenia, Netherlands, Finland |
| `CODENAMES` | 20 | Aurora, Nimbus, Atlas, Beacon, Comet, Horizon, Summit, Orbit, Harbor, Lumen, Vertex, Zephyr, Cascade, Meridian, Quasar, Ember, Polaris, Tundra, Sierra, Delta |
| `TITLE_VERBS` | 12 | Review, Update, Design, Prepare, Migrate, Draft, Plan, Test, Publish, Refine, Audit, Configure |
| `TITLE_NOUNS` | 16 | onboarding flow, billing dashboard, release notes, quarterly report, API docs, customer survey, pricing page, security review, mobile layout, data export, team handbook, support macros, search filters, invoice template, notification settings, access policy |
| `WORDS` | 50 | account, agile, balance, budget, channel, client, cloud, cycle, dashboard, delivery, insight, feature, focus, growth, impact, launch, market, metric, network, office, partner, pipeline, plan, portal, process, product, project, quality, report, review, schedule, service, signal, strategy, support, system, target, team, timeline, update, value, vision, workflow, simple, smart, secure, quick, shared, weekly, local |
| `EMAIL_DOMAINS` | 3 | example.com, example.org, example.net (RFC 2606 reserved) |

### B.2.3 `src/fields.ts`: field-spec language and value generation

- `Scalar = string | number | boolean | null`.
- `FIELD_KINDS` (27 kinds):
  ```
  id seq ref enum const
  int float money percent bool date datetime
  fullName firstName lastName email phone company jobTitle city country
  codename title word words sentence paragraph
  ```
- `FieldSpec = { raw, kind, range?, options?, target?, pattern?, value? }`. `ParseFieldResult = { ok: true; spec } | { ok: false; error }`.
- **Default ranges:**

  | Kind | Default |
  |---|---|
  | `int` | 0..100 |
  | `float` | 0..1 |
  | `money` | 10..1000 |
  | `percent` | 0..100 |
  | `date` | -365..0 |
  | `datetime` | -30..0 |
  | `words` | 2..4 |
  | `sentence` | 6..12 |
  | `paragraph` | 2..4 |

- Whole numbers are required for `int`, `percent`, `date`, `words`, `sentence` and `paragraph`. Counts (`words`, `sentence`, `paragraph`) must be in 1..`MAX_COUNT` (50).
- Range syntax is `/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/`, or a single number `/^-?\d+(?:\.\d+)?$/`, which means min = max.
- **`parseFieldSpec(raw)`** splits at the first `:`, trims both parts, then:
  - unknown kind: `Unknown field kind "<k>". Supported kinds: <list>.`
  - `ref` without a target: `"ref" needs a target entity, e.g. "ref:Customer".`
  - `enum` (comma-split, trimmed, empties dropped) with no options: `"enum" needs at least one option, e.g. "enum:draft,sent,paid".`
  - `seq`: the pattern defaults to `#`. `const`: the value is the raw argument.
  - Range kinds:
    - `Invalid range "<arg>" for "<k>". Use "min..max", e.g. "<k>:1..10".`
    - `Range minimum is greater than maximum in "<raw>".`
    - `"<k>" needs a whole-number range, e.g. "<k>:1..10".`
    - `"<k>" counts must be between 1 and 50.`
  - Any other kind given an argument: `"<k>" does not take arguments.`
- **`generateValue(spec, ctx)`**, where `ctx = { rng, baseDate, sequence (1-based), hints, pickRef }`:

  | Kind | Generated value |
  |---|---|
  | `id` | v4-style UUID from the seeded rng: 32 hex digits, `[12]='4'`, `[16]=8+int(0,3)`, formatted 8-4-4-4-12 |
  | `seq` | `formatSequence(pattern, sequence)` |
  | `ref` | `pickRef(target)`: a random id from the already generated target pool, or `null` |
  | `enum` | `rng.pick(options)` |
  | `const` | the value |
  | `int`, `percent` | `rng.int(min, max)` |
  | `float`, `money` | `rng.float(min, max)` rounded to 2 decimals |
  | `bool` | `rng.bool()` |
  | `date` | `isoDate(baseDate + int(min, max) days)` |
  | `datetime` | `baseDate + float(min, max) days`, rounded to the minute, as ISO |
  | `fullName` | `First Last` |
  | `firstName`, `lastName` | one name |
  | `company` | `Prefix Suffix` |
  | `phone` | `+1 555-01NN` (NN is 00–99, padded) |
  | `jobTitle`, `city`, `country`, `codename`, `word` | one pick |
  | `title` | `Verb noun` |
  | `words` | N words joined with spaces |
  | `sentence` | N words, first letter capitalised, ending with `.` |
  | `paragraph` | N sentences of 6–14 words each, joined with a space |

  `fullName`, `firstName`, `lastName` and `company` also store the first value of each into `hints` (`??=`).
- **Email:**
  - The local part is the slug, with `.` as separator, of `hints.full`, or else first + last, or else a random first and last name.
  - The domain is `<slug(company, '')>.example` if the record has a company, otherwise a pick from `EMAIL_DOMAINS`.
  - `slug` lowercases, applies NFKD, strips combining marks, splits on non-`[a-z0-9]` and joins with the separator.
  - Field order matters: name and company fields declared **before** `email` make the email match them.
- `formatSequence(pattern, n)` replaces the first run of `#` with `n` zero-padded to the run length. With no `#`, it appends `n`. Examples: `INV-####` with 7 gives `INV-0007`; `TP-#` with 42 gives `TP-42`; `N` with 3 gives `N3`.
- `isoDate(d) = d.toISOString().slice(0, 10)`. `DAY_MS = 86_400_000`.

### B.2.4 `src/schema.ts`: manifest schema (zod 4)

Exported constants:
- `HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`
- `FONT_STACK = /^[\w\s,'"-]{1,120}$/` (it ends up in a CSS custom property, so only plain family names are allowed)
- `THEME_MODES = ['light','dark','auto']`

Building blocks:
- `id`: `/^[a-z0-9][a-z0-9-]*$/`, max 60. Message: `Use lowercase letters, digits and dashes, e.g. "get-paid".`
- `entityName` and `fieldName`: `/^[A-Za-z][A-Za-z0-9_]*$/`, max 60. Starting with a letter also rules out `__proto__`. Message: `Use letters, digits and underscores, starting with a letter.`
- `text(max)`: `string().trim().min(1).max(max)`.
- `httpUrl`: `.url()` plus a refine that it starts with `http(s)://`. Message: `Only http(s) URLs are allowed.`
- `hexColor`: message `Use a hex color such as "#4f46e5".`
- `isoDate`: `YYYY-MM-DD`, message `Use YYYY-MM-DD.`
- `scalar`: a string of max 500 characters, a number, a boolean or null. `valueMap = record(fieldName, scalar)`.

Every object below is `.strict()`, so unknown keys are rejected.

| Object | Keys |
|---|---|
| `theme` | `primary?`, `accent?` (hex); `mode?`; `radius?` (int 0–24); `font?` (FONT_STACK, message `Use a plain font stack such as "Inter, sans-serif".`) |
| `app` | `name` text(80); `tagline?` 160; `description?` 2000; `category?` 60; `version?` 30; `website?` httpUrl; `currency` `/^[A-Z]{3}$/`, default `USD` (message `Use an ISO 4217 code such as "USD".`); `theme?` |
| `attribution` | `text` 500; `url?` httpUrl |
| `persona` | `id`; `label` 60; `description?` 500; `goals` text(200)[] max 10, default `[]` |
| `entity` | `label?` 60; `description?` 500; `count` int 0–500, default 8; `display?` fieldName; `fields` record(fieldName, string 1–300), refined to at least 1 (`Define at least one field.`) and at most 40 (`Use at most 40 fields per entity.`) |
| `feature` | `id`; `title` 80; `description?` 1000; `category?` 60; `tier?` 30; `personas` id[]; `entities` entityName[]; `highlights` text(200)[] max 10 (all default `[]`) |
| `step` | discriminated union on `action`, each with `narration` text(500): `create` (+`values?`), `select` (+`where?`), `update` (+`set`, required), `delete`, `note` |
| `scenario` | `id`; `title` 80; `description?` 1000; `persona?` id; `entity` entityName; `steps` 1–30 |
| `integration` | `name` 60; `category?` 60; `description?` 500 |
| `manifest` | `$schema?`; `manifestVersion` literal 1, default 1; `app`; `attribution?`; `personas` max 12; `entities` record, max 30 (`Use at most 30 entities.`), default `{}`; `features` max 100; `scenarios` max 30; `integrations` max 50; `mock` `{ seed: string(max 100) \| number, default 'app-lens'; baseDate?: isoDate }`, default `{ seed: 'app-lens' }` |

Exports:
- Types: `ManifestInput` (`z.input`), `Manifest` (`z.output`), `AppInfo`, `ThemeSettings`, `ThemeMode`, `Persona`, `EntityDefinition`, `Feature`, `Scenario`, `ScenarioStep`, `Integration`.
- `manifestJsonSchema()` returns `z.toJSONSchema(manifestSchema, { io: 'input' })`.

### B.2.5 `src/generator.ts`: deterministic dataset

- Types: `MockRecord = { id: string; [field]: Scalar }` and `Dataset = Record<string, MockRecord[]>`. `GenerateOptions = { seed?, baseDate? }`.
- `ReferenceCycleError(cycle)`: `name = 'ReferenceCycleError'`. Message: `Entities reference each other in a cycle: A -> B -> A. Only self-references are supported.`
- `getEntityFields(entity)` parses all field specs and caches them in a `WeakMap` keyed by the entity object. It throws `Field "<name>": <error>` on an invalid spec.
- `resolveBaseDate(manifest, override?)`:
  - The source is the override, else `mock.baseDate`, else today.
  - An invalid date throws `Invalid base date "<x>".`
  - The result is normalised to **UTC midnight**.
- `entityOrder(entities)` runs a DFS with `visiting`/`done` states, so referenced entities come first. Self-references and refs to unknown entities are skipped. A back-edge throws `ReferenceCycleError` with the cycle path.
- `createRecord(manifest, entityName, dataset, rng, sequence, baseDate)`:
  - The id is `<entityname lowercased>-<sequence padded to 3>`, e.g. `customer-001`.
  - Fields are generated in declaration order with a fresh `hints` object. `pickRef` picks from `dataset[target]`.
- `generateDataset(manifest, { seed, baseDate })` uses `root = createRng(seed ?? mock.seed)`. For each entity in `entityOrder`, it uses `rng = root.fork(name)` and generates `count` records with sequence `1..count`. The dataset entry is registered before generating, so self-references can pick earlier records; the first record of a self-referencing entity gets `null`.
- `displayField(entity)`:
  1. `entity.display`
  2. else the first field named `name`, `title` or `label`
  3. else the first field whose kind is one of `seq`, `fullName`, `company`, `title`, `codename`, `jobTitle`, `firstName`, `words`, `email`
- `displayOf(manifest, entity, record)` returns that field's value, or `record.id` if it is empty or missing.

### B.2.6 `src/scenario.ts`: walkthrough engine

- `ScenarioFrame = { index, step, records, subject, changed: string[], removed }`. `RunScenarioOptions = { seed?, baseDate? }`.
- Tokens: the string `$today` becomes `isoDate(baseDate)` and `$now` becomes `baseDate.toISOString()`.
- `runScenario(manifest, dataset, scenario, options)`:
  - An unknown entity throws `Scenario "<id>" uses unknown entity "<entity>".`
  - The rng is `createRng(seed ?? mock.seed).fork('scenario:<id>')`. It works on a shallow copy of the dataset, with `records` being a copy of the scenario entity's list; **the input is never mutated**. `nextSequence = records.length + 1`.
  - `create`: build a new record with `createRecord`, overlay the resolved `values` and keep the generated `id`. **Prepend** it, make it the subject, and set `changed = ['id', ...all fields]`.
  - `select`: subject = the first record where every `where` field is strictly equal, or `null`.
  - `update`: no-op without a subject. `changed` = only the keys whose value really changes. The record is replaced in place and becomes the subject.
  - `delete`: no-op without a subject. `removed = subject`, the record is filtered out and the subject becomes `null`.
  - `note`: no change.
  - One frame is pushed per step.

### B.2.7 `src/validate.ts`: two-stage validation

- `ManifestIssue = { path, message }`. `ParseManifestResult = { ok: true; manifest } | { ok: false; issues }`.
- `parseManifest(input)`:
  1. Runs `manifestSchema.safeParse`. On failure it returns the zod issues with formatted paths, e.g. `entities.Invoice.fields.amount` or `features[0].personas[1]`, and `(root)` for an empty path.
  2. Otherwise it runs the reference checks below. Because of this order, **reference errors only appear once the schema errors are fixed.**
- Reference checks:
  - Duplicate ids in `personas`, `features` and `scenarios`.
  - For every entity field:
    - a field named `id` gives `"id" is generated automatically. Use a different field name.`
    - spec errors from `parseFieldSpec`
    - a `ref` to a missing entity gives `References unknown entity "<x>".`
  - A `display` that is not one of the fields gives `Unknown field "<x>".`
  - `entityOrder` cycle errors, reported at path `entities`.
  - Features: `Unknown persona "<x>".` and `Unknown entity "<x>".`
  - Scenarios: unknown persona; unknown entity (that scenario's steps are skipped).
  - For `create.values`, `update.set` and `select.where`:
    - an unknown field gives `Unknown field "<f>" on <Entity>.` (`id` is allowed in `select`)
    - an enum value not in the options gives `"<v>" is not one of: a, b, c.`

### B.2.8 `src/demo.ts`: product demo script

- Scene types share `{ id, title, caption, durationMs }`, and each kind adds:
  - `intro`: nothing extra
  - `personas`: `personas`
  - `feature`: `feature`, `entity | null`, `records` (up to 4)
  - `data-model`: `entities: DemoEntity[]`, where `DemoEntity = { name, label, count, refs: {field, target}[] }`
  - `scenario`: `scenario`, `frames`, `leadInMs`, `stepMs`
  - `outro`: `stats: {label, value}[]`, `integrations: string[]`
- `DemoScript = { scenes, durationMs, findings }`. `DemoFindings = { featuresReviewed, featuresPicked, personas, dataTypes, relationships, workflows, scenes }`.
- `BuildDemoOptions = { persona?, seed?, baseDate?, maxFeatures = 4, maxScenarios = 2 }`.
- `DEMO_TIMING` (ms):

  | Key | ms |
  |---|---|
  | `intro` | 4500 |
  | `personas` | 5000 |
  | `feature` | 4500 |
  | `perHighlight` | 700 |
  | `dataModel` | 5500 |
  | `scenarioLeadIn` | 1800 |
  | `scenarioStep` | 3000 |
  | `outro` | 5000 |

- **Feature score:**
  ```
  score = highlights.length
        + 2 * min(entities.length, 2)
        + (description ? 1 : 0)
        + (tier ? 0 : 1)
        + (persona && feature.personas includes persona ? 2 : 0)
  ```
- `rankFeatures(manifest, persona = null)`: when a persona is set, it keeps only features with no personas or that include the persona. It sorts by score descending, then by manifest order.
- `buildDemo(manifest, dataset, options)` builds these scenes in order:
  1. **intro**: the caption is the tagline, else the description, else `Meet <name>.`
  2. **personas**, only if there are any. Title `Who it is for`; caption `Built for a, b and c.` (labels lowercased).
  3. **feature scenes**: the top `maxFeatures` ranked features, re-sorted into manifest order. The entity is the first listed entity that exists, with up to 4 records. Duration is `4500 + 700 × highlights`.
  4. **data-model**, only if there are entities. Title `What it keeps track of`; caption `Manages x, y and z` plus `, all linked together` if there are refs, then a full stop.
  5. **scenario scenes**: scenarios filtered by persona (a scenario without a persona always qualifies), then the first `maxScenarios`. Frames come from `runScenario`. Duration is `1800 + 3000 × steps`.
  6. **outro**: title `That's <name>`. Stats are Features (number ranked), Personas, Data types and Workflows (all scenarios). Caption `<n> features, <m> types of data and <k> guided workflows. Explore the rest at your own pace.` Integration names are listed.

  `findings.workflows` counts the **selected** scenarios.
- `sceneAt(script, elapsedMs)` returns `{ index, scene, start, progress (0..1) }`. It clamps to the last scene and throws `A demo needs at least one scene.` when there are no scenes.
- `scenarioStepAt(scene, progress)`: `elapsed = progress × duration − leadIn`. It returns `-1` during the lead-in, otherwise `min(frames − 1, floor(elapsed / stepMs))`.

### B.2.9 Core tests (35)

`test/fields.test.ts` (14 tests):
- `parseFieldSpec`: parses kinds with arguments; applies default ranges.
- Rejects each of `nope`, `ref`, `enum:`, `int:10..1`, `int:1.5..3`, `money:abc`, `words:1..500` and `email:x` (8 cases).
- `formatSequence` pads the first run of `#`.
- `createRng`: is deterministic per seed; forks independent streams; keeps integers within bounds (500 samples of `int(-2, 2)`).

`test/demo.test.ts` (6 tests):
- `rankFeatures` prefers well-described features and filters by persona.
- `buildDemo`:
  - scripts intro, personas, top features in manifest order, data model, scenarios and outro, and the duration is the sum of the scenes
  - describes relationships and replays scenarios
  - tailors the demo to a persona
- `sceneAt` locates scenes on the timeline, including clamping. `scenarioStepAt` maps progress to steps (`-1` during the lead-in).

`test/manifest.test.ts` (15 tests):
- The fixture:
  - app `Demo`, persona `admin`
  - `Customer` (5 records) and `Invoice` (10 records: `seq:INV-####`, `ref:Customer`, `money:100..200`, `enum:draft,sent,paid`)
  - feature `billing`; scenario `lifecycle` (create, update, delete)
  - `mock { seed: 'test', baseDate: '2025-01-15' }`
- `parseManifest` (9 tests):
  - accepts a valid manifest and applies defaults (`currency` USD, ...)
  - accepts every bundled sample: it reads `samples/*.app-lens.json`, generates the data, runs every scenario, and every `select` must find a subject
  - rejects `javascript:` and `data:` URLs in `app.website` and `attribution.url`
  - rejects unknown keys
  - reports unknown references (persona, entity, scenario persona and entity)
  - reports an invalid display, a reserved `id` field, `ref:Ghost` and an unknown kind
  - reports reference cycles but allows self-references
  - reports unknown step fields and enum typos (`payed`)
  - reports duplicate ids
- `generateDataset` (4 tests): is deterministic for a seed; generates valid, linked records (`INV-0001`…, valid refs, amounts in range, valid statuses); only uses reserved example email domains; supports self-references (the first record's parent is `null`).
- `runScenario` (2 tests): creates, updates and deletes without mutating the dataset; selects by field values and resolves `$today` against the base date.

## B.3 Samples (`samples/*.app-lens.json`)

Both samples are fictional and say so in their description. The viewer bundles every `samples/*.app-lens.json` at build time, and the core test validates and runs them.

### InvoiceFlow (`samples/invoiceflow.app-lens.json`)

- **App:**
  - name `InvoiceFlow`, tagline `Invoicing and payments for small teams`, category `Finance`, version `2.4`, currency `EUR`
  - theme `primary #4f46e5`, `accent #06b6d4`
  - description ends with "This is a fictional sample app bundled with AppLens."
- **Personas:**

  | id | Label | Goals |
  |---|---|---|
  | `owner` | Business owner | send invoices in under a minute; see cash flow; spend less time chasing |
  | `accountant` | Accountant | reconcile quickly; export clean data |
  | `client` | Client | understand what is owed; pay securely |

- **Entities:**

  | Entity | Count | Display | Fields |
  |---|---|---|---|
  | Customer | 10 | `company` | `company: company`, `contact: fullName`, `email: email`, `country: country`, `since: date:-900..-30` |
  | Invoice | 16 | `number` | `number: seq:INV-####`, `customer: ref:Customer`, `amount: money:120..4800`, `issued: date:-60..0`, `due: date:0..30`, `status: enum:draft,sent,overdue,paid` |
  | Payment | 10 | `reference` | `reference: seq:PAY-#####`, `invoice: ref:Invoice`, `amount: money:120..4800`, `method: enum:card,bank transfer,direct debit`, `received: date:-45..0` |

- **Features:**

  | id | Title | Category | Tier | Personas | Entities |
  |---|---|---|---|---|---|
  | `quick-invoice` | Invoice in seconds | Billing | – | owner, accountant | Invoice, Customer |
  | `reminders` | Automatic reminders | Billing | Pro | owner | Invoice |
  | `online-payments` | Online payments | Payments | – | owner, client | Payment, Invoice |
  | `reconciliation` | Payment reconciliation | Payments | Pro | accountant | Payment |
  | `cashflow` | Cash flow dashboard | Insights | – | owner, accountant | – |
  | `client-portal` | Client portal | Collaboration | – | client | Invoice, Payment |
  | `exports` | Accounting exports | Insights | Business | accountant | – |

  Each feature has 2–3 highlights.
- **Scenarios:**
  - `get-paid` (owner, Invoice): create (`status: draft`, `issued: $today`), update (`sent`), note (reminder), update (`paid`).
  - `chase-overdue` (accountant): select (`status: overdue`), note, update (`paid`).
  - `cleanup-draft` (owner): select (`status: draft`), delete.
- **Integrations:** Payment gateway, Email delivery, Accounting software.
- **Mock:** `seed: "invoiceflow"`.

### TaskPilot (`samples/taskpilot.app-lens.json`)

- **App:**
  - name `TaskPilot`, tagline `Lightweight project planning for product teams`, category `Productivity`, version `1.8`
  - theme `primary #0f766e`, `accent #f59e0b`
- **Personas:** `lead` (Team lead), `member` (Team member), `stakeholder` (Stakeholder).
- **Entities:**

  | Entity | Count | Display | Fields |
  |---|---|---|---|
  | Member | 8 | `name` | `name: fullName`, `email: email`, `role: jobTitle`, `location: city` |
  | Project | 4 | `name` | `name: codename`, `owner: ref:Member`, `progress: percent:5..95`, `health: enum:on track,at risk,off track` |
  | Task | 24 | `key` | `key: seq:TP-###`, `title: title`, `project: ref:Project`, `assignee: ref:Member`, `priority: enum:low,medium,high,urgent`, `status: enum:backlog,todo,in progress,review,done`, `estimate: int:1..13`, `due: date:-5..30` |

- **Features:**

  | id | Title | Category | Tier | Personas | Entities |
  |---|---|---|---|---|---|
  | `boards` | Boards and lists | Planning | – | lead, member | Task |
  | `sprints` | Sprint planning | Planning | Team | lead | Task, Project |
  | `health` | Project health | Insights | – | lead, stakeholder | Project |
  | `my-work` | My work | Execution | – | member | Task |
  | `share-links` | Read-only share links | Collaboration | Business | stakeholder, lead | – |

- **Scenarios:**
  - `plan-task` (lead, Task): create (`backlog`, `medium`), update (`todo`, `high`, `estimate 5`), update (`in progress`), update (`review`), update (`done`).
  - `pick-up-work` (member): select (`status: todo`), update (`in progress`).
- **Integrations:** Code hosting, Team chat, Calendar.
- **Mock:** `seed: "taskpilot"`.

## B.4 `@app-lens/ui` (React components and styles)

`packages/ui/package.json`:
- `name` is `@app-lens/ui`, version `0.2.0`, private, `type: module`.
- `main`, `types` and `exports["."]` point to `./src/index.ts`, and `exports["./styles.css"]` points to `./src/styles.css`.
- Script `typecheck`.
- Dependencies: `@app-lens/core: *`. Peer dependencies: `react` and `react-dom` `^18.3.1`.
- Dev dependencies: `@types/react ^18.3.12`, `@types/react-dom ^18.3.1`, `react`, `react-dom`.

`tsconfig.json`: `lib: ES2022, DOM, DOM.Iterable`, `jsx: react-jsx`, `types: []`, includes `src`.

`src/index.ts` exports: `AppLensView`, `AppLensViewProps`, `IssuesView`, `Showcase`, `TABS`, `Tab`, `ShowcaseProps`, `Frame`, `sanitizeTheme`, `useTheme`, `FrameProps`, `ThemeOverrides`.

### B.4.1 `src/theme.tsx`

- `ThemeOverrides = Partial<ThemeSettings>`.
- `sanitizeTheme({ mode, primary, accent, radius, font })` keeps only valid values:
  - `mode` must be in `THEME_MODES`
  - colours must match `HEX_COLOR`
  - `radius` must match `/^\d{1,2}$/` and be ≤ 24
  - `font` must match `FONT_STACK`
- `usePrefersDark()` tracks `matchMedia('(prefers-color-scheme: dark)')`, with a `change` listener that is removed on cleanup.
- `useTheme(base, overrides)`:
  - Merges the base theme with the overrides that are not `undefined`.
  - The scheme is `dark` if mode is `dark`, or `auto` and the system prefers dark. Otherwise it is `light`, which is also the result when no mode is given.
  - It sets the style variables `--al-primary`, `--al-accent`, `--al-radius` (`<n>px`) and `--al-font`.
- `Frame({ theme, overrides, embedded, toolbar, children })` renders:
  ```
  <div class="al-root [is-embedded]" data-theme="light|dark" style=…>
    <div class="al-shell">
      <header class="al-topbar"> <Brand/> + toolbar </header>   (only if not embedded, or if a toolbar is given)
      children
  ```

### B.4.2 `src/util.ts`

| Helper | Behaviour |
|---|---|
| `isForPersona(feature, persona)` | true when the persona is null, the feature has no personas, or it includes the persona |
| `isScenarioForPersona` | same rule, using `scenario.persona` |
| `initials(name)` | first letters of the first two words, uppercased |
| `slug(value, sep)` | lowercase and split on non-alphanumerics |
| `humanize(name)` | camelCase or snake_case to "Sentence case" (`dueDate` becomes `Due date`) |
| `hue(value)` | stable `(h*31 + c) \| 0` hash, then `abs % 360` |
| `formatMoney(value, currency)` | `Intl.NumberFormat` currency, falling back to `toFixed(2)` |
| `formatDate(value, withTime)` | `medium` date (UTC) or `medium` date + `short` time; returns the raw value if it doesn't parse |
| `messageOf(error)` | the error's message, or `String(error)` |

### B.4.3 Components (`src/components/`)

- **`AppLensView`** takes `{ manifest: unknown, theme?, embedded?, toolbar?, initialTab?, initialPersona? }`.
  - It runs `useMemo(parseManifest(manifest))`.
  - Invalid: `<Frame>` with `<IssuesView>`. Valid: `<Showcase>`.
- **`Showcase`**:
  - `TABS = ['overview','features','data','scenarios']`.
  - State:
    - `tab` (a valid `initialTab`, else `overview`)
    - `persona` (`initialPersona` only if it exists in the manifest)
    - `seed` (from `mock.seed`)
    - `focus` (`DataFocus`)
  - `dataset = useMemo(generateDataset(manifest, { seed }))`. "New sample data" sets `seed = Math.floor(Math.random() * 1e9)`.
  - Layout:
    - `Frame`
    - optional attribution `al-alert al-alert-info`
    - `al-app-header`: initials mark, eyebrow category, `h1`, tagline, and the persona switch (buttons with `aria-pressed`)
    - `nav.al-tabs[role=tablist]` with `role=tab` buttons and `aria-selected`. Tab labels: Overview; Features (count filtered by persona); Data (number of entities); **Walkthroughs** (count filtered by persona).
    - `main.al-main`
    - `footer.al-footer`
- **`Overview`**, in order:
  - about card (description, website)
  - stat buttons that switch tab: Features, Data types, Sample records, Walkthroughs
  - "Who it's for": persona cards with goals and a toggle-active button
  - "Key capabilities": the first 6 features, with a tier badge
  - "What it manages": entity cards, with chips that open the data explorer
  - "Works with": integrations
- **`Features`**:
  - Category chips ("All" + the unique categories), filtered by persona.
  - A `cards` / `matrix` segmented control (`role=group`, `aria-label="Layout"`), shown when there are personas.
  - Cards show the description, highlights, tier badge, and persona and entity tags. Entity tags open the data explorer.
  - The matrix is a `table.al-matrix` with features as rows and personas as columns. Cells show ✓ or – with an `aria-label`.
  - With a persona selected, a line says "showing X of Y".
- **`DataExplorer`** (`DataFocus = { entity, id? }`):
  - Left: `nav.al-entity-list` ("Data types"), with a count per entity.
  - A toolbar with the title, a search input (case-insensitive substring over all values) and **New sample data**.
  - A table (`al-table al-table-hover`) showing the first `MAX_COLUMNS = 6` fields. Clicking a row focuses it.
  - Detail panel `aside.al-card.al-detail` ("Record details"): `dl.al-fields` with every field. Ref values are buttons that jump to the referenced record.
- **`FieldValue`** renders by kind:
  - empty: `—`
  - `ref`: the display label, as a button when it can be opened
  - `enum`: `Badge`, coloured through `--al-hue: hue(value)`
  - `money`: formatted
  - `percent`: a bar (clamped 0–100) plus the number
  - `date`/`datetime`: formatted
  - `bool`: Yes/No
  - `int`/`float`: `al-num`
  - `id`/`seq`: `<code class="al-code">`
  - anything else: text
- **`IssuesView`** renders `div.al-alert.al-alert-error[role=alert]` with "This manifest has N problem(s)." and a list of `<code>path</code> message`.
- **`ScenarioPlayer`** (Walkthroughs tab):
  - A sidebar with **Product demo** (labelled "Video", sentinel id `__demo__`) and the scenarios with their step counts.
  - Shows either `DemoTheater` or `Player`.
  - `Player`:
    - `frames = useMemo(runScenario(...))`. `position` starts at `-1` (intro).
    - Auto-advance: `400 ms` from the intro, then `STEP_DELAY_MS = 2200` per step. The timeout is cleaned up.
    - Step labels: Create, Open, Update, Delete, Info.
    - Controls: Restart, Back, Play/Pause/Replay, Next, plus a progress label.
    - Narration in an `aria-live="polite"` region.
    - A subject card that highlights changed fields (`.is-changed` flash animation) or shows a "removed" message.
    - A preview table with 4 columns and `PREVIEW_ROWS = 6` rows.
- **`DemoTheater`**:
  - Phases: `idle` (poster with **Generate demo**), `researching`, `ready`.
  - Research stages, each shown with its detail:
    1. Reading the app profile (name · category)
    2. Identifying who uses it (N personas)
    3. Ranking the main features (X of N features selected)
    4. Mapping the data model (N data types, N relationships)
    5. Scripting workflows (N workflows)
    6. Rendering the demo video (N scenes, M:SS)
  - Each stage takes `STAGE_MS = 950`, or `250` with `prefers-reduced-motion`. That is about 6 seconds in total, or about 1.5 seconds with reduced motion.
  - The session cache `researched: WeakMap<Manifest, Set<string>>` uses the key `"<persona>:<seed>"`. A researched demo opens straight in `ready`.
  - **`DemoVideo`** player:
    - Clock: a `requestAnimationFrame` loop adds the real time delta to `elapsed`, clamped to the duration, and is cancelled on cleanup. It auto-pauses at the end.
    - Keys on the focused player: `Space`/`k` toggle, `→`/`←` seek ±`SEEK_STEP_MS = 5000`. Keys are ignored while focus is in an input.
    - Fullscreen uses `requestFullscreen` / `exitFullscreen`.
    - Layout:
      - `section.al-video` with `aria-label="Product demo video"`
      - browser chrome: dots plus the fake URL `<app-slug>.example/<scene kind>`
      - `al-video-stage`, keyed by scene id so the enter animation restarts
      - an `aria-live` caption
      - a play/replay overlay when paused
      - controls: play/pause, restart, a range slider (step 100) with chapter markers, `M:SS` time, fullscreen
      - a chapter list and a "Research again" link
- **`DemoScenes`**:
  - `reveal(ms, at)` returns `al-reveal is-in` once `ms ≥ at`, for staggered reveals.
  - `sceneCaption` shows the current frame's narration in scenario scenes.
  - The scenes:
    - **intro**: initials mark at 0 ms, eyebrow at 500, title at 800, tagline at 1400
    - **personas**: heading, then a card every 700 ms (from 500), each with an avatar, description and 2 goals
    - **feature**: split layout. The copy and highlights are revealed in turn. A mock window shows records, with an animated cursor hovering over rows (`CURSOR_START_MS = 1600`, `CURSOR_ROW_MS = 1100`). Without records, the feature's personas are shown instead.
    - **data-model**: entity cards with counts, then relationship chips
    - **scenario**: split layout with the step list (`is-done` / `is-current`) and a mock record window showing the current subject or a "removed" message
    - **outro**: stat values count up over 1500 ms, integration tags, closing line
- **`Brand`**: an `al-brand` element with an inline magnifier SVG (`aria-hidden`) and the text "AppLens".

### B.4.4 `src/styles.css`

- Every rule is under `.al-root`, with a `box-sizing` reset for descendants.
- Light defaults:
  - `--al-primary #4f46e5`, `--al-accent #0ea5e9`
  - `--al-bg #f5f6fa`, `--al-surface #ffffff`, `--al-border #e3e6ee`
  - `--al-text #1b2130`, `--al-muted #657085`, `--al-radius 12px`
  - `--al-primary-soft` / `--al-primary-strong` / `--al-accent-soft` are built with `color-mix`
  - info: `#eef5fd` / `#bfd7f5` / `#1d3f6b`; error: `#fdf1f0` / `#f3c3c0` / `#7a1f17`
  - `--al-badge-l-bg 94%`, `--al-badge-l-text 30%`
- `.al-root[data-theme="dark"]`:
  - `--al-bg #0e1218`, `--al-surface #161b24`, `--al-border #283041`
  - `--al-text #e6e9f0`, `--al-muted #98a2b5`
  - darker shadow; the badge lightness values are swapped to `22%` / `82%`
- Class groups:
  - layout: shell (max 1200px), stack, row, toolbar, grid (280px, compact 240px)
  - typography; segmented control, tabs, chips, badges, tags; buttons and links; cards
  - tables and matrix; explorer (220px sidebar + main, sticky 300px detail panel)
  - player and steps; demo poster, research and progress; video (16:9 screen, min 380px)
  - scenes and the mock window; alerts; footer
- Keyframes: `al-flash`, `al-fade-in`, `al-spin`, `al-cursor-in`.
- `@media (max-width: 900px)`: single-column layouts, a horizontal entity list, a static detail panel, a smaller scene title, and a 460px-minimum video screen.
- `@media (prefers-reduced-motion: reduce)`: turns off the changed-field, narration, stage, caption and cursor animations, and the reveal transitions.
- `.al-root.is-embedded`: no min-height, and the shell has no max-width and 12px padding.

## B.5 `@app-lens/viewer` (standalone and iframe app)

`apps/viewer/package.json`:
- `name` is `@app-lens/viewer`, private, `type: module`.
- Scripts: `dev` (`vite`), `build` (`tsc --noEmit && vite build`), `preview`, `typecheck`.
- Dependencies: core, ui, `react` and `react-dom` `^18.3.1`. Dev dependencies: React types, `@vitejs/plugin-react 4.7.0`, `vite 6.4.5`. Part B shows the original `^` ranges for other packages; `package.json` now holds exact versions.

`tsconfig.json`: the DOM libs, `jsx: react-jsx`, `types: ["vite/client", "node"]`, includes `src` and `vite.config.ts`.

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built viewer works from any folder; the CLI copies it into generated sites.
  base: './',
  plugins: [react()],
});
```

`index.html` has the title `AppLens` (the CLI replaces this title), `body { margin: 0 }`, `#root`, and the module `/src/main.tsx`. `main.tsx` imports `@app-lens/ui/styles.css` and renders `<App/>` in `StrictMode`.

`src/sources.ts`:
- `ManifestSource = { key, label, group, load }`.
- `sampleSources()` uses `import.meta.glob('../../../samples/*.app-lens.json', { eager: true, import: 'default' })`. The key is `sample:<file>`, the label is `app.name` (or the file name), the group is `Samples`, and the list is sorted by label.
- `fetchJson(url)` fetches with `credentials: 'omit'` and throws `Could not load manifest (HTTP <status>).` on an error status.
- `sourceFromUrl(value)` resolves the URL against the page and allows **only http(s)**. The key is `url:<href>`, the group is `From URL`.
- `pinnedManifestUrl()` reads `<meta name="app-lens-manifest">`, which `app-lens build` writes into generated sites.

`src/App.tsx`:
- URL parameters: `embed` (`1` or `true`), `tab`, `theme`, `primary`, `accent`, `radius`, `font` (all passed through `sanitizeTheme`), `persona`, `source`, and `manifest` (or the pinned meta tag).
- With a manifest URL, the viewer is "pinned": a single source and no picker.
- Loads with an `active` flag so a stale load can't overwrite a newer one. An unknown source key gives `Unknown manifest source "<key>".`
- Changing the source updates `?source=` with `history.replaceState`.
- **Iframe mode:** with `embed` set and running inside a frame, a `ResizeObserver` on `body` posts `{ type: 'app-lens:resize', height }` to the parent (`'*'`).
- The picker is shown only when the viewer is not embedded, not pinned, and has more than one source.
- Empty, loading and error states are rendered inside `Frame`.

`src/components/SourcePicker.tsx` renders `div.al-picker` with a visually-hidden label "Manifest" and a `<select>` with an `<optgroup>` per group.

## B.6 `@app-lens/embed` (`<app-lens>` web component)

`packages/embed/package.json`:
- `name` is `@app-lens/embed`, private, `type: module`.
- Scripts: `dev` (`vite`), `build` (`tsc --noEmit && vite build`), `typecheck`.
- Dependencies: core, ui, React 18. Dev dependencies: the same as the viewer.

`tsconfig.json` is like the viewer's but includes `src`, `demo` and `vite.config.ts`.

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Library builds don't replace this automatically, and React needs it to pick its production build.
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  build: {
    lib: {
      entry: 'src/index.tsx',
      name: 'AppLens',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'app-lens.mjs' : 'app-lens.js'),
    },
  },
}));
```

`src/index.tsx` defines `class AppLensElement extends HTMLElement` and registers it as `app-lens`, unless a component with that name is already defined. It also adds `HTMLElementTagNameMap`.
- `observedAttributes`: `src`, `theme`, `primary`, `accent`, `radius`, `font`, `tab`, `persona`.
- Private fields: `#root`, `#manifest`, `#state` (loading / ready / error), and a `#request` counter that discards stale fetches.
- The `manifest` setter increments `#request`, stores the value and sets state to `ready`.
- `connectedCallback`:
  - Re-applies a `manifest` value that was assigned before the element was upgraded: it reads the own property descriptor, deletes it and calls the setter.
  - Creates an open shadow root with `<style>` (`styles.css?inline` + `:host { display: block; } :host([hidden]) { display: none; }`) and a mount `<div>`, then `createRoot`.
  - Loads from markup if there is no manifest yet; otherwise renders.
- `disconnectedCallback` unmounts in a microtask, and only if the element is still disconnected, so moving it within the page does not tear it down.
- `attributeChangedCallback`: `src` reloads; any other attribute re-renders.
- Source order:
  1. the `manifest` property
  2. an inline `<script type="application/json">` child (invalid JSON gives `The inline manifest is not valid JSON.`)
  3. the `src` attribute, resolved against `document.baseURI`. It must be http(s), is fetched with `credentials: 'omit'`, and an error status gives `Could not load manifest (HTTP <status>).`
  4. otherwise it waits in the loading state.
- Events: `app-lens:ready` and `app-lens:error` (with `detail: { message }`). Both are `bubbles: true, composed: true`.
- Rendering:
  - Theme attributes go through `sanitizeTheme`, `tab` is checked against `TABS`, and `persona` is passed along.
  - `<AppLensView key="<tab>|<persona>" … embedded/>`, or `Frame` with "Loading…" or an error alert.

Demo page:
- `index.html`, titled "AppLens embed demo", has two sections:
  1. `<app-lens id="taskpilot" tab="scenarios">`, with the manifest set from script
  2. inline JSON for the fictional **CafeQueue** app (theme `dark`, primary `#e11d48`, accent `#f59e0b`, radius `6`):
     - one `Order` entity: `seq:Q-###`, `firstName`, `money:3..18`, `enum:placed,brewing,ready,collected`
     - features `order-ahead` and `queue`
     - scenario `coffee-run`
     - `seed: "cafequeue"`
- `demo/demo.ts` imports the TaskPilot sample, sets it on `#taskpilot`, and logs `app-lens:error` events.

## B.7 `@app-lens/cli` (`app-lens` command)

`packages/cli/package.json`:
- `name` is `@app-lens/cli`, private, `type: module`, `bin: { "app-lens": "./dist/cli.js" }`.
- Scripts: `build` (`node scripts/build.mjs`), `test` (`vitest run`), `typecheck`.
- Dependencies: `@app-lens/core: *`. Dev dependencies: `esbuild ^0.25.0`, `vitest ^3.2.7`.

`tsconfig.json`: `lib: ES2022`, `types: ["node"]`, includes `src` and `test`.

`scripts/build.mjs`:
1. Requires `apps/viewer/dist/` and `packages/embed/dist/app-lens.js`; exits with code 1 if either is missing.
2. Empties and recreates `packages/cli/dist/`.
3. Runs esbuild on `src/cli.ts`, producing `dist/cli.js` with `bundle`, `platform: node`, `format: esm`, `target: node18`, banner `#!/usr/bin/env node` and `logLevel: warning`.
4. Copies the viewer `dist` to `dist/viewer/` and the embed `app-lens.js` to `dist/embed/app-lens.js`.
5. Logs `Built packages/cli/dist (cli.js, viewer/, embed/app-lens.js)`.

`src/cli.ts`:
- Version `0.2.0`.
- Parses arguments with `node:util` `parseArgs` (`allowPositionals`). Options: `out`/`-o`, `force`/`-f`, `name`, `port`/`-p`, `help`/`-h`, `version`/`-v`.
- `help`, no command or `-h` prints the help text. An unknown command gives `Unknown command "<x>". Run "app-lens --help".`
- Errors are printed as `app-lens: <message>` with exit code 1. A stack trace is printed only for unexpected errors (not `CliError`).
- Help text:
  ```
  AppLens 0.2.0: interactive showcases for your apps, built from one manifest file.

  Usage
    app-lens init [file] [--name "My App"] [--force]   Create a starter manifest and its JSON schema
    app-lens validate <file>                           Check a manifest and report problems
    app-lens build <file> [--out folder] [--force]     Generate a static showcase site (default: app-lens-site)
    app-lens preview <file|folder> [--port 4317]       Build if needed and serve locally
    app-lens schema [--out file]                       Print or write the manifest JSON schema

  Options
    -h, --help      Show this help
    -v, --version   Show the version
  ```

`src/commands.ts`:
- Exports `CliError`. Constants: `SITE_MARKER = '.app-lens-site'`, `DEFAULT_OUT = 'app-lens-site'`, `DEFAULT_PORT = 4317`.
- MIME types are defined for `.html`, `.js`, `.mjs`, `.css`, `.json`, `.svg`, `.png` and `.ico`.
- `readManifestFile`: the file must exist; it is read as UTF-8, a **leading BOM is stripped**, and invalid JSON throws a `CliError`.
- **`init [file=app-lens.json] [--name] [--force]`**:
  - Refuses to overwrite an existing file without `--force`.
  - Writes `starterManifest(name)` and validates it.
  - Also writes `app-lens.schema.json` next to it.
  - Prints the next steps (`validate`, `preview`).
- **`validate <file>`** prints `OK <file> is valid: N features, N personas, N data types, N walkthroughs.`, or `ERROR <file> has N problem(s):` followed by `  - path: message` lines, with exit code 1.
- **`schema [--out]`** writes `manifestJsonSchema()` as pretty-printed JSON to stdout or to the file.
- **`build <file> [--out app-lens-site] [--force]`**:
  1. Validates the manifest.
  2. `prepareOutDir`: an existing path that is not a folder is an error. A non-empty folder without `.app-lens-site` and without `--force` gives `<out> is not empty and was not created by AppLens. Use --force to write into it anyway.` **It never deletes files.**
  3. Copies the bundled `viewer/` into the output folder.
  4. `pinManifest(html, appName)` replaces `<title>…</title>` using a **function replacer**, so `$&` in the name stays literal. The new head is `<title>{escaped name} · AppLens</title>` followed by `<meta name="app-lens-manifest" content="manifest.json" />`.
  5. Writes `manifest.json` and copies `app-lens.js`.
  6. Writes the marker file `.app-lens-site`.
  7. Prints a summary of the site files.
- `escapeHtml` escapes `& < > " '`.
- **`preview <file|folder> [--port]`**:
  - Given a file, it builds to `<tmp>/app-lens-preview-<sha1(path).slice(0,10)>` with `force`.
  - The folder must contain `index.html`. The port must be an integer from 1 to 65535.
  - It serves on **`127.0.0.1` only**.
  - `resolveStaticPath` decodes the path and rejects `\0` and invalid encodings. A path must equal the root or start with `root + sep`.
  - Folders serve `index.html`. Responses send `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; missing files get a plain-text 404.
  - It prints the URLs, including the `?embed=1&theme=dark` iframe-mode URL.

`src/template.ts`: `starterManifest(name)` builds:
- The seed: the name lowercased, split on non-`[a-z0-9]` and joined with `-`, or `app-lens` if that is empty.
- `$schema: './app-lens.schema.json'` and `manifestVersion: 1`.
- An app with a placeholder tagline and description, category `Productivity`, version `1.0` and theme `#4f46e5` / `#0ea5e9` / `auto`.
- Personas `admin` and `member`.
- Entities:
  - `Customer` (8 records: company, fullName, email, city; display `company`)
  - `Order` (12 records: `seq:ORD-####`, `ref:Customer`, `money:20..900`, `date:-30..0`, `enum:new,processing,shipped,delivered`; display `number`)
- Features `orders` and `customers`.
- Scenario `fulfil-order`: create (`new`, `$today`), update (`processing`), update (`shipped`).
- Integration `Email`.

`test/cli.test.ts` (13 tests):
- `starterManifest` is valid for `My App`, `Ünïcode & Co` and `x`.
- `manifestJsonSchema` is an object schema with `app`, `entities` and `scenarios`.
- `pinManifest` adds the meta tag and escapes the title (`<script>alert(1)</script> $& Co`). `escapeHtml` escapes all five characters.
- `resolveStaticPath` maps paths inside the root, and rejects 6 cases (traversal through `..`, `%2e%2e%2F` and `%5C`, a `%00` null byte, and invalid `%E0%A4%A`). Null-byte and invalid-encoding paths must return `null`.

---

# Part C: Verify the rebuild

Run these from the repo root. All must pass before the first PR is opened (HANDOFF section 0.2).

```bash
npm install
npm run typecheck      # every package, 0 errors
npm test               # 304 tests: 118 core, 126 CLI, 30 UI, 12 embed, 9 viewer, 9 studio
npm run build          # viewer -> embed -> cli; Rollup may print zod annotation warnings, which are harmless
npm run app-lens -- --help
npm run app-lens -- validate samples/invoiceflow.app-lens.json
npm run app-lens -- validate samples/taskpilot.app-lens.json
npm run dev            # http://localhost:5173 shows both samples in the picker
npm run dev:embed      # web component demo page
```

Manual checks:
1. Viewer:
   - Switch samples and personas.
   - Open every tab. In Data, search, open a record and follow a ref.
   - Play a walkthrough.
   - Generate the product demo: watch the 6 research stages, then play, seek, use the keyboard and go fullscreen.
2. `?embed=1&theme=dark&tab=features` hides the top bar and opens Features in dark mode.
3. `app-lens build samples/taskpilot.app-lens.json --out tmp-site`, then `app-lens preview tmp-site`. The page title is `TaskPilot · AppLens`. Building again into a non-empty unrelated folder must be refused.
4. The embed demo page shows TaskPilot on Walkthroughs and CafeQueue in dark mode with the custom colours.

Then commit, push and open a PR into `dev` as described in HANDOFF section 0.2.

---

# Part D: Keeping this file current

- Each phase PR adds a new entry to **Part A**: what was done and why, and which files changed.
- If a phase changes behaviour described in **Part B**, update that section in the same PR, so this file can always rebuild the current `main`.
- Keep the test count in **Part C** in step with the real number.

