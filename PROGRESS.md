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
| Docs and AI-assistance note | `#0008-docs-and-ai-assistance-note` | In review |
| CI pinning, secret scan and lint | `#0009-ci-pinning-secret-scan-and-lint` | In review |
| Polish audit and fixes | `#0010-polish-audit-and-fixes` | In review |

## Measured results

| Measure | Value | Method | Machine | Date |
|---|---|---|---|---|
| Unit tests | 304 pass | `npm test` | Windows, Node 24 | 2026-10-31 |
| E2E tests | 190 pass, 3 runs in a row | `npm run e2e` | Windows, Node 24 | 2026-10-31 |
| CI on `dev` at 8de69e7 | All steps pass | GitHub Actions run 41199772564 | Linux, Node 22 | 2026-10-31 |
| Viewer build | 449.0 kB | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Studio build | 459.7 kB | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Embed `app-lens.js` | 322.0 kB, 99.2 kB gzip | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| CLI `cli.js` | 2337.1 kB, 439.3 kB gzip | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Parse the largest manifest | 12 ms | `npm run measure` | Windows, Node 24 | 2026-10-31 |
| Generate 15,000 records | 1676 ms | `npm run measure` | Windows, Node 24 | 2026-10-31 |

## Before the first release

- [ ] One live AI drafting run by the owner. It needs `ANTHROPIC_API_KEY`
- [x] Scan job in CI. Its first full-history result arrives with the PR
- [x] Pinned CI actions and exact dependency versions
- [x] Linting and an editor config
- [x] Polish audit in `docs/AUDIT.md`
- [ ] Byte limit on fetched manifests
- [ ] Version set for the release

## Known issues

The full list is in `HANDOFF.md` section 9.

- AI drafting has only run against a fake client.
- `npm audit` reports 11 moderate dev-only issues from one `minimatch` advisory, and production dependencies report 0. See D016.
- Generating 15,000 records measured 1409 ms after Phase 3 and 1676 ms now. It has not been investigated, and it may be noise.

## Next step

Finish the list above in numbered branches, then open the release PR from `dev` to `main`.
