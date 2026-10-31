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
- **Trade-offs:** A meta tag can't set `frame-ancestors`, and embedding has to stay possible anyway.

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
