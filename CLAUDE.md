# AppLens: rules for coding agents

AppLens turns one JSON manifest into an interactive showcase of an app. Read `PROGRESS.md`, `DECISIONS.md` and `docs/ARCHITECTURE.md` before changing anything. `HANDOFF.md` has the full manifest reference, and `REBUILD.md` has the build record.

The human owner decides, reviews and merges. Explain important decisions briefly; do not explain basics.

## Git

- `main` is for releases, `dev` is the default working branch, and each piece of work gets its own branch from a freshly pulled `dev`: `#00nn-three-to-seven-words`.
- Push branches only. Never push to `dev` or `main` unless told to. Never force-push a shared branch.
- The owner opens and merges PRs. `gh` is not installed, so after each push give the PR description in the chat as raw Markdown in a fenced code block, then the compare link. Encode `#` in the link as `%23`.
- Set the Git identity per repository. Commit in small steps, with `feat:`, `fix:`, `perf:`, `test:`, `docs:`, `chore:` or `ci:` subjects.
- Releases go from `dev` to `main` through a PR with a merge commit, not a squash.

## Commands

Verified on 2026-10-31 on Windows with Node 24.20.0. CI runs them on Linux with Node 22.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=high
npx playwright install chromium
npm run e2e        # needs a finished build
npm run measure    # bundle sizes and timing
```

Run all of them before pushing, and let a failure stop the push. CI does not run on a branch push alone, so the result is unknown until a PR exists.

## Code rules

- Strict TypeScript. `packages/core/src` stays pure, with no DOM or Node APIs.
- Generated data is fictional and deterministic.
- Every CSS class starts with `al-` and is scoped under `.al-root`.
- Manifests, attributes and URL parameters are untrusted input, and are validated at the boundary.
- For a bug, write the regression test first and show it failing.
- Never delete, skip or weaken a test to get green.
- Measure a number before writing it down, and record it in `PROGRESS.md`.
- Pin exact versions, and pin CI actions to a commit SHA.
- Add new dependencies only when they are at least two weeks old, and check the publish date.

## Hard limits

- No employer or third-party code, data, names or config.
- Manifests about apps the owner doesn't own never go into `samples/` or a build.
- No secrets in the repository. Never ask for a secret in chat, and never print one.
- The repository is public, so assume everything committed is published.
- Ask before changing the manifest format, and before large or risky fixes.
- Ask before calling the live Claude API, because it spends the owner's credit.

## Keep up to date in each PR

`PROGRESS.md`, `DECISIONS.md`, this file's commands, `HANDOFF.md` sections 2 and 9, and Part A of `REBUILD.md`.
