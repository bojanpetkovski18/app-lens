# Progress

Last updated: 2026-10-31.

## Status

| Work | Branch | Status |
|---|---|---|
| Phases 1-2: MVP and distribution | `phase-1-2/foundation` | Merged into `dev` |
| Phase 3: code review | `phase-3/code-review` | Merged into `dev` |
| Phase 4: smarts | `phase-4/smarts` | Merged into `dev` |
| Phase 5: project intake | `phase-5/project-intake` | Merged into `dev` |
| Phase 6: Studio | `phase-6/studio` | Merged into `dev` |
| Run CI on `dev` | `#0007-run-ci-on-dev` | Merged, PR #1 |
| Docs, CI, audit, size limit and version 1.0.0 | `#0008` to `#0012` | Merged, PR #2 |
| Code review and bug fixes | `#0013-polishing-and-fixing-bugs-for-the-release` | In review |

## Measured results

| Measure | Value | Method | Machine | Date |
|---|---|---|---|---|
| Unit tests | 380 pass | `npm test` | Windows, Node 24 | 2026-10-31 |
| E2E tests | 197 pass, 3 runs in a row | `npm run e2e` | Windows, Node 24 | 2026-10-31 |
| CI on `dev` at 3a7456b | All jobs pass, including the first full-history gitleaks scan | GitHub Actions run 41203575511 | Linux, Node 22 | 2026-10-31 |
| Viewer build | 451.2 kB | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Studio build | 463.7 kB | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Embed `app-lens.js` | 323.3 kB, 99.8 kB gzip | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| CLI `cli.js` | 2344.0 kB, 441.4 kB gzip | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Parse the largest manifest | 11 ms | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Generate 15,000 records | 1486 ms | `npm run measure` | Windows, Node 24 | 2026-10-31 |

## Before the first release

- [ ] One live AI drafting run by the owner. It needs `ANTHROPIC_API_KEY`
- [x] Scan job in CI, and the first full-history scan passed
- [x] Pinned CI actions and exact dependency versions
- [x] Linting and an editor config
- [x] Polish audit in `docs/AUDIT.md`
- [x] Byte limit on fetched manifests
- [x] Version set to 1.0.0
- [x] Senior code review. See `docs/CODE-REVIEW.md`

## Known issues

The full list is in `HANDOFF.md` section 9.

- AI drafting has only run against a fake client.
- `npm audit` reports 11 moderate dev-only issues from one `minimatch` advisory, and production dependencies report 0. See D016.
- Generating 15,000 records has measured between 1409 ms and 1676 ms across runs. It has not been profiled.

## Next step

The owner merges `#0013` and does one live AI drafting run. Then the release PR goes from `dev` to `main`.
