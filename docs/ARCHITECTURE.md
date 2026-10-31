# Architecture

AppLens as built. A manifest goes in, and a showcase comes out.

```text
 folder / GitHub / website     OpenAPI / Prisma / README        hand-written JSON
             |                           |                             |
       cli/intake                  core/importers                      |
             +-------- ProjectSignals ---+                             |
                            |                                          |
                      core/draftManifest                               |
                            +----------------- manifest ---------------+
                                                  |
                                       core/parseManifest
                                                  |
                  +-----------+-----------+-------+-----+-----------+
                  |           |           |             |           |
               viewer      embed       Studio      static site    PDF, Markdown
                  +-----------+-----------+-------------+
                                    |
                               @app-lens/ui
```

## Packages

| Package | Role | Depends on |
|---|---|---|
| `packages/core` | Schema, validation, mock data, scenarios, demo script, importers, lint, diff, export. No DOM or Node APIs | zod |
| `packages/ui` | React components, theme, analytics, video recording, attach dialog | core, React, yaml |
| `packages/embed` | The `<app-lens>` custom element | ui |
| `packages/cli` | The `app-lens` command, its servers, intake and AI drafting | core, Claude SDK, yaml, htmlparser2 |
| `apps/viewer` | Standalone and iframe viewer with the bundled samples | ui |
| `apps/studio` | Manifest editor | ui |

The CLI's build copies the viewer, Studio and embed builds into `packages/cli/dist`, so `build` and `studio` work from the CLI alone.

## Manifest handling

`parseManifest` runs two stages: zod checks the shape, then cross-reference checks cover refs, personas and scenario steps. If the first stage fails, the second isn't reported until those errors are fixed.

Every entry point treats a manifest as untrusted. The schema caps the sizes that get rendered, and the largest manifest generates 15,000 records.

## Generated data

`core/rng` hashes a seed with FNV-1a and feeds mulberry32, with a forked stream for each entity so that adding one doesn't change another. Field specs such as `money:10..500` are parsed in `core/fields`. `core/generator` produces records in dependency order and handles reference cycles.

`core/scenario` applies walkthrough steps to the generated data. `core/demo` turns the same manifest into the script for the product demo.

## Rendering

`AppLensView` is the shared entry point. It takes a parsed manifest, and `stateKey` keeps the tab while the manifest changes, which Studio's preview relies on.

- CSS classes start with `al-` and are scoped under `.al-root`.
- The embed shares one stylesheet between instances. It waits for inline JSON and aborts in-flight fetches.
- `onEvent`, the `app-lens:event` DOM event and iframe `postMessage` all carry the same analytics events.
- The demo plays as a rendered animation. "Download video" draws a separate canvas and records it to WebM with `MediaRecorder`, in real time.

## Intake

`attach` collects `ProjectSignals`, then `draftManifest` turns them into a manifest and a report of where each item came from.

| Source | How it's read | Protections |
|---|---|---|
| Folder | Files chosen by `shouldReadPath` | Skips secrets and dependency folders. Never runs project code |
| GitHub | Tar archive with the in-house reader | Limits of 100 MB archive, 500 MB unpacked and 50,000 entries. Rejects unsafe paths |
| Website | Static HTML, structure only | SSRF guard, `robots.txt`, page limit, no cookies, no JavaScript |

The SSRF guard in `cli/intake/net.ts` checks addresses against a `BlockList` and pins the lookup for each connection, including redirects.

Drafts of projects the owner doesn't claim get a `draft.thirdParty` marker. They go to the gitignored `drafts/` folder, and `build` refuses them.

## Studio

`apps/studio/src/editor.ts` is a reducer holding the manifest as text, with undo and redo capped at 100 entries. The form edits a copy of the parsed value and writes it back as text, so the JSON and form tabs can't drift apart. The preview keeps the last valid manifest while an edit is broken. Drafts from attach and AI go through a review step before they change anything.

`app-lens studio [file]` serves the build on `127.0.0.1:4318` with these routes:

| Route | Purpose |
|---|---|
| `GET /__app-lens/manifest` | Load the file named on the command line |
| `PUT /__app-lens/manifest` | Save, valid manifests only |
| `POST /__app-lens/attach` | Run intake |
| `POST /__app-lens/draft` | Run AI drafting |

Reads need a loopback `Host`. Writes also need a matching `Origin` and JSON. Bodies are limited to 2 MB. Without the server, as on GitHub Pages, Studio works from browser storage.

## AI drafting

`cli/ai.ts` calls Claude through the official SDK with streaming, and only when the user asks. Source text is delimited and marked as untrusted, and it is limited to 400,000 characters. Text that's too long is refused rather than cut.

Each reply goes through `parseManifest`. Problems are sent back up to twice, with the full previous response replayed. Refusals and `max_tokens` stops become clear errors.

## Delivery

`app-lens build` writes a static site with a Content-Security-Policy meta tag. `preview` serves files with `X-Content-Type-Options: nosniff`, and `--watch` adds live reload over server-sent events.

GitHub Actions runs `ci.yml` on PRs and on pushes to `dev` and `main`. `pages.yml` publishes the fictional samples and Studio on pushes to `main`.
