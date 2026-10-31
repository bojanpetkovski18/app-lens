# Decisions

Numbered, and never renumbered. D001 to D012 were written up on 2026-10-31 from the build record in `REBUILD.md`, so their dates are the date of the work.

## D001: npm workspaces monorepo (Phases 1-2)

- **Date:** 2026-10-30
- **Decision:** One repository with `packages/core`, `ui`, `embed`, `cli` and `apps/viewer`, `studio`.
- **Why:** The viewer, embed, CLI and Studio all share the same manifest logic and UI.
- **Alternatives:** Separate repositories, or a monorepo tool such as Turborepo.
- **Trade-offs:** Builds run in a fixed order from one root script, with no build caching.

## D002: Keep core pure

- **Date:** 2026-10-30
- **Decision:** `packages/core` has no DOM or Node APIs.
- **Why:** The same code has to run in browsers, the web component and the CLI.
- **Alternatives:** Platform-specific helpers inside core.
- **Trade-offs:** File, network and rendering work lives in `cli` and `ui`, so importers take text rather than paths.

## D003: Generated data is seeded and deterministic

- **Date:** 2026-10-30
- **Decision:** All sample data comes from a seeded PRNG, with forked streams per entity.
- **Why:** Screenshots, tests and demos must not change between runs, and no real data can leak in.
- **Alternatives:** A data library such as Faker.
- **Trade-offs:** Data variety is limited to AppLens's own word lists.

## D004: Harden built sites with a meta CSP

- **Date:** 2026-10-30
- **Decision:** `app-lens build` writes a Content-Security-Policy meta tag into each site.
- **Why:** Built sites go on hosts where AppLens can't set headers.
- **Alternatives:** Document the headers and leave them to the host.
- **Trade-offs:** A meta tag can't set `frame-ancestors`, and embedding has to stay possible anyway. Since 2026-10-31 the policy has no `unsafe-inline`.

## D005: Add an optional `draft` key to the manifest (Phase 4)

- **Date:** 2026-10-30
- **Decision:** Add `draft: { thirdParty, source }`. `build` refuses manifests marked as third-party.
- **Why:** Manifests about apps the owner doesn't own must never reach a build.
- **Alternatives:** Rely on the folder they are written to.
- **Trade-offs:** It's a format change made without asking first, and it was flagged for review. It is additive, so existing manifests are unaffected.

## D006: Write the tar reader by hand

- **Date:** 2026-10-30
- **Decision:** GitHub archives are read by a small in-house tar extractor with size and entry limits.
- **Why:** It only needs regular files, and it reduces dependency risk on untrusted input.
- **Alternatives:** The `tar` package.
- **Trade-offs:** More code to own and test.

## D007: Guard website intake against SSRF at connection time

- **Date:** 2026-10-30
- **Decision:** Check addresses with a `BlockList` and pin the DNS lookup used for the connection, on every redirect.
- **Why:** Checking the hostname first and connecting later can be defeated by DNS rebinding.
- **Alternatives:** A hostname check before the request.
- **Trade-offs:** More code, and private addresses can't be attached.

## D008: Check AI output with `parseManifest`, not structured outputs

- **Date:** 2026-10-30
- **Decision:** Validate the reply with the same parser as any manifest, and send problems back up to twice.
- **Why:** Structured outputs can't express the manifest's open-ended records.
- **Alternatives:** A reduced JSON schema, which would lose fields.
- **Trade-offs:** A bad draft can cost up to three requests.

## D009: Leave server-side refusal fallbacks on

- **Date:** 2026-10-30
- **Decision:** `fallbacks: 'default'` is set in `packages/cli/src/ai.ts`.
- **Why:** A refused request can still give the user a draft.
- **Alternatives:** Fail on refusal.
- **Trade-offs:** A retried request runs on another model. It's one line to remove.

## D010: Bundle the CLI into one file

- **Date:** 2026-10-30
- **Decision:** esbuild bundles the CLI and its dependencies into `cli.js`.
- **Why:** It keeps the CLI self-contained.
- **Alternatives:** Keep dependencies external, or import the Claude SDK dynamically.
- **Trade-offs:** `cli.js` grew from 766 kB to 2.4 MB, mostly from the SDK.

## D011: Studio's local server has no login

- **Date:** 2026-10-30
- **Decision:** It binds to 127.0.0.1. Writes need a loopback `Host`, a matching `Origin` and JSON, and reads need a loopback `Host`.
- **Why:** It's a single-user local tool, and these checks stop other websites reaching it.
- **Alternatives:** A session token in the URL.
- **Trade-offs:** Other programs on the same machine can reach it.

## D012: Stacked phase branches

- **Date:** 2026-10-30
- **Decision:** Each phase branched from the one before, following the handoff.
- **Why:** Every phase built on the last.
- **Alternatives:** Merging each phase before starting the next, which would have needed the owner each time.
- **Trade-offs:** Squash-merging would have repeated earlier diffs, so merge commits were used.

## D013: Adopt the `dev` workflow from the other projects

- **Date:** 2026-10-31
- **Decision:** `dev` is the default branch, `main` receives releases, and the owner opens PRs. New work uses `#00nn-...` branches.
- **Why:** The owner asked for `dev`, and it matches their other projects and the project playbook.
- **Alternatives:** The stacked PRs into `main` planned in the handoff.
- **Trade-offs:** The phase branches were merged into `dev` directly, without PR review.

## D014: Hold the Claude SDK at 0.135.0

- **Date:** 2026-10-31
- **Decision:** Use `@anthropic-ai/sdk` 0.135.0 instead of 1.3.0.
- **Why:** Every 1.x release was under two weeks old, which breaks the dependency rule. `ai.ts` type-checks and its tests pass on 0.135.0.
- **Alternatives:** Keep 1.3.0 as an exception.
- **Trade-offs:** It stays on the last 0.x line until 1.x has aged, and the fake client can't show that the live API accepts every parameter.

## D015: Keep Vite at 6.4.5 under the security exception

- **Date:** 2026-10-31
- **Decision:** Keep `vite` 6.4.5, published 2026-10-21, as an exact version.
- **Why:** 6.4.4 has GHSA-8g5g-mxqh-grgj, so `npm audit` flags it. The playbook allows a security patch under two weeks old with the owner's approval.
- **Alternatives:** 6.4.4, which reintroduces the advisory.
- **Trade-offs:** It's younger than the rule until 2026-11-04. The owner reviews this in the PR.

## D016: Accept the dev-only minimatch advisory for now

- **Date:** 2026-10-31
- **Decision:** Leave `minimatch` 10.2.6, which ESLint requires, despite GHSA-g3hv-75wg-m249.
- **Why:** The denial of service needs attacker-controlled glob patterns, and ESLint here only reads patterns from this repository's config. `npm audit --omit=dev` reports 0. The fix is a new major version from 2026-10-27, outside what ESLint declares.
- **Alternatives:** Override to `minimatch` 11, or remove ESLint.
- **Trade-offs:** `npm audit` reports 11 moderate issues, all from this one advisory, until ESLint moves. CI fails on `high`, so it still passes. Recheck after 2026-11-10.

## D017: ESLint without Prettier

- **Date:** 2026-10-31
- **Decision:** Add ESLint with the recommended and React Hooks rules, plus `.editorconfig`. Don't add a formatter.
- **Why:** Prettier would rewrite most of the code base with no change in behaviour, and the long-line house style is deliberate.
- **Alternatives:** Prettier with a wide print width.
- **Trade-offs:** Formatting relies on review. The editorconfig check skips indent size, because continuation lines are aligned by hand.

## D018: Run zod without its JIT

- **Date:** 2026-10-31
- **Decision:** Set `z.config({ jitless: true })` in core.
- **Why:** zod's startup test for `eval` logs a violation on any page with a strict policy, including sites that embed AppLens.
- **Alternatives:** Allow `unsafe-eval`, which defeats the policy.
- **Trade-offs:** Validation can't use compiled parsers. The largest manifest measured 12 ms, within run-to-run variation of the 10 ms before.

## D019: Keep the audit as a test

- **Date:** 2026-10-31
- **Decision:** `e2e/audit.spec.ts` runs every screen at each width and theme on every PR.
- **Why:** A one-off audit goes stale with the next change, and playbook mistakes came from overlays that were never opened.
- **Alternatives:** A manual checklist.
- **Trade-offs:** It adds 161 tests, and 46 seconds locally for the full e2e suite.

## D020: Limit fetched manifests to 5 MB

- **Date:** 2026-10-31
- **Decision:** Viewer and web component share `fetchManifest`, which checks `Content-Length` and also counts bytes while reading.
- **Why:** `?manifest=` and `src` accept any URL, and an endless response would otherwise fill the tab's memory. The sample manifests are far smaller than the limit.
- **Alternatives:** Trust `Content-Length`, which can be missing or false.
- **Trade-offs:** A legitimate manifest over 5 MB is refused, with a clear message.

## D021: Match untrusted patterns with a hand-written matcher

- **Date:** 2026-10-31
- **Decision:** `robots.txt` rules and `.gitignore` patterns go through `matchesWildcard`, not a generated regular expression.
- **Why:** Both come from other people's content, and a crafted pattern made a regular expression run for longer than the test's 20 second limit. That froze the CLI and Studio's server.
- **Alternatives:** Limit the number of wildcards, which doesn't help much, since eight can still take years. A safe-regex library would be a new dependency.
- **Trade-offs:** About 50 more lines to own. The cost is at most pattern length times text length.

## D022: `attach` no longer overwrites without `--force`

- **Date:** 2026-10-31
- **Decision:** `attach` refuses to replace its manifest or report unless `--force` is passed, like `init` and `ingest`.
- **Why:** The default output is `app-lens.json`, the same name as a hand-written manifest, so a plain run could destroy one.
- **Alternatives:** Write to a different default name, which would change what the README describes.
- **Trade-offs:** Running `attach` twice now needs `--force`.

## D023: A site is whatever host it redirects to

- **Date:** 2026-10-31
- **Decision:** If the first page redirects to another host, the crawl continues there and reads that host's `robots.txt`. A later page that redirects off the site is left out.
- **Why:** Most sites redirect to a canonical host, and the crawl used to stop after one page.
- **Alternatives:** Treat a redirect as a failure, which would refuse most sites.
- **Trade-offs:** A first page that redirects to an unrelated site gets drafted from that site. Its address is in the report.
