# Code review notes: release 1.0.0

Senior review of the whole code base on 2026-10-31, on `dev` at 3a7456b. Every source file was read. A candidate counts as a finding only if it was reproduced. The regression tests are in `packages/core/test/review.test.ts`, `packages/cli/test/review.test.ts`, `packages/ui/test/review.test.tsx`, `apps/studio/test/form.test.ts` and `e2e/`, and they failed against the old code. The exceptions are M15 and M16: their fixes are new helper functions, so those tests could not run against the old code, and those two findings come from reading it.

Severity:

- **High:** data loss, a crash the person can't recover from, or a hang caused by someone else's content.
- **Medium:** a main feature fails or gives a wrong result on realistic input.
- **Low:** a narrow edge case, a wrong detail or a small polish problem.

## High

| # | Where | Problem | Fix |
|---|---|---|---|
| H1 | `cli/intake/attach.ts` | `app-lens attach ./project` silently overwrote an existing `app-lens.json`, so a hand-written manifest was lost. `init` and `ingest` both refuse this | Refuses unless `--force` is passed, for the manifest and the report |
| H2 | `apps/studio` | JSON that parses but has the wrong shape, such as an entity with no `fields`, crashed the Form tab to a blank page. Autosave then brought the same text back, so every reload crashed until browser storage was cleared | `canUseForm` checks the shape first. Form is disabled and the JSON tab stays usable |
| H3 | `core/importers.ts` | An OpenAPI schema listing itself in `allOf` many times did not finish within the 20 seconds allowed. It's reachable through `attach` on any third-party repository | Each schema is visited once |
| H4 | `cli/intake/site.ts` | A hostile `robots.txt` rule built a regular expression that never finished, which froze the CLI and Studio's local server | New linear matcher in `cli/intake/wildcard.ts`, plus limits on rule length and count |
| H5 | `cli/intake/folder.ts` | The same hang from a hostile `.gitignore` in an attached repository | Same matcher |

## Medium

| # | Where | Problem | Fix |
|---|---|---|---|
| M1 | `core/intake.ts` | One enum over 300 characters, such as a country list, failed the whole draft | Keeps the options that fit and adds a note |
| M2 | `core/intake.ts` | A long entity name with a status field gave a title over 80 characters and failed the draft. Generated API schemas often have names this long | Title is clipped |
| M3 | `core/intake.ts` | Two long names with the same start gave duplicate walkthrough ids and failed the draft | Ids are made unique |
| M4 | `core/intake.ts` | A `homepage` that isn't a real URL failed the draft | Invalid websites are dropped |
| M5 | `core/intake.ts` | A very long source URL failed the draft through its attribution text | Attribution and source are clipped |
| M6 | `core/projectfiles.ts` | `<input type="constructor">` found `Object.prototype.constructor` and crashed `attach`, for files and for websites | Own-property lookup |
| M7 | `cli/intake/site.ts` | A site redirecting to its canonical host, as most do from `example.com` to `www.example.com`, was crawled for one page only | The landing host becomes the site |
| M8 | `cli/intake/site.ts` | After that redirect, the first host's `robots.txt` was applied instead of the right one | Reads `robots.txt` again for the landing host |
| M9 | `cli/intake/site.ts` | A page redirecting to another site was added to the draft without any robots check | Left out, with a note |
| M10 | `cli/intake/site.ts` | A `<link rel="manifest">` that isn't a URL aborted the whole crawl | Treated as unreadable, with a note |
| M11 | `cli/intake/net.ts` | The timeout only noticed silence, so a server sending a byte at a time held the crawl open indefinitely | A total time limit of three times the idle timeout |
| M12 | `cli/intake/net.ts` | IPv4 addresses inside `::/96`, 6to4 and the NAT64 local range passed the SSRF check | Ranges added to the block list |
| M13 | `apps/studio` | With no `app` object in the manifest, each keystroke in the form threw an error, so nothing could be typed | `update` creates it |
| M14 | `apps/studio` | Clearing goals or highlights left `[""]`, an invalid manifest with no way to fix it from the form | Empty text gives an empty list |
| M15 | `apps/studio` | Renaming an entity or field to an existing name deleted the other one. Typing a name letter by letter could trigger this | An existing name is refused |
| M16 | `apps/studio` | Renaming an entity broke its links, features and walkthroughs, and renaming a field broke its display setting and walkthrough values. Removing a persona or entity left dangling references | The helpers in `editor.ts` update them |
| M17 | `apps/studio` | The review step said "No differences" when the current text wasn't valid, and for changes to attribution or sample data settings | Says it replaces the text, and `diffManifests` reports those settings |
| M18 | `apps/studio` | Nothing showed unsaved changes, and "Saved" stayed on screen after later edits. Closing the tab lost them without warning | Save button shows the state, the message clears, and leaving the page warns |
| M19 | `cli/studio.ts` | A file with a byte order mark, which Windows tools often write, opened as broken JSON. The rest of the CLI accepts it | Removed when loading |
| M20 | `ui/AttachDialog.tsx` | On GitHub Pages the link tabs showed a raw JSON parse error, because a static host answers 405 with HTML | Explains that it needs a server, and non-JSON errors show their status |
| M21 | `ui/DataExplorer.tsx` | Search missed the linked names shown in the table, because it searched the hidden ids | Linked names are searched too |
| M22 | `core/lint.ts` | Lint generated all sample data on every Studio keystroke, even with no walkthroughs. The largest manifest took over 3 seconds per keystroke | Only generates when walkthroughs exist |

## Low

| # | Where | Problem | Fix |
|---|---|---|---|
| L1 | `core/importers.ts` | An unquoted `version: 2` was lost | Read as text |
| L2 | `core/importers.ts` | A `}` in a Prisma default ended the model early, losing later fields. `//` in a URL default was read as a comment | Strings are skipped |
| L3 | `core/importers.ts` | README text lost underscores (`my_cool_tool`) and anything between `<` and `>` | Only real emphasis and tags are removed |
| L4 | `core/intake.ts` | Field kinds matched inside words: `update` became a date, `votes` notes, `automobile` a phone, `jobTitle` a task title, `totalCount` money | Matches whole words |
| L5 | `core/intake.ts` | Over 99 duplicate names gave a 61 character id and failed the draft | Suffix length is allowed for |
| L6 | `core/intake.ts` | Fields named `constructor` or `toString` were dropped | Own-property check |
| L7 | `core/projectfiles.ts` | `companyName` was typed as a person's name and `fileName` as a full name | Uses the shared word matching |
| L8 | `core/projectfiles.ts` | Route groups became features called "(marketing)", `app/components` became a feature, and `authors` was skipped as if it were `auth` | Rules corrected |
| L9 | `core/projectfiles.ts` | Words in comments inside a role enum became personas | Comments removed first |
| L10 | `core/export.ts` | A line break or leading `#` in manifest text started a new Markdown block | Text stays inline |
| L11 | `core/export.ts` | A long URL ran off the PDF page | Long words are broken |
| L12 | `core/demo.ts` | The demo said "1 features" and "1 types of data" | Singular forms |
| L13 | `core/demo.ts` | The workflow count ignored the chosen persona | Uses the filtered count |
| L14 | `core/validate.ts` | Text like "banana 1" passed as a date | Needs an ISO date |
| L15 | `cli/intake/folder.ts` | `**/name` didn't match at the root | `**/` handled properly |
| L16 | `cli/intake/site.ts` | A robots group for any agent contained in "applens", such as `app`, was applied to AppLens | Exact match |
| L17 | `cli/intake/site.ts` | A `header` inside a `nav` lost the links after it | Depth counted properly |
| L18 | `cli/intake/attach.ts` | Third-party drafts were refused if any parent folder was called `samples` | Only checks below the working folder |
| L19 | `cli/intake/github.ts` | `www.github.com` links were refused | Accepted |
| L20 | `cli/intake/github.ts` | One file that couldn't be written, such as a name Windows refuses, failed the whole attach | That file is skipped |
| L21 | `cli/intake/github.ts` | A `tree` link to a file crashed with a raw system error | Clear message |
| L22 | `cli/studio.ts` | A JSON body of `null` gave a 500, and unknown routes gave 415 | 422 and 404 |
| L23 | `ui` | One-pager downloads were hidden without a description or website | Always shown |
| L24 | `ui` | "1 sample records" | Singular form |
| L25 | `ui` | A persona listed twice on a feature caused a React key error | Listed once |
| L26 | `ui` | A walkthrough shortened in the live preview showed "Step 3 of 1" | Position is clamped |
| L27 | `ui` | The fullscreen button showed where the browser forbids it | Hidden |
| L28 | `ui` | Changing persona kept the demo position, which could exceed the new demo's length and report it as completed | Starts at zero |
| L29 | `ui/AttachDialog.tsx` | A browser folder attach had no total size limit | 32 MB, as in the CLI |
| L30 | `apps/studio` | Studio showed a raw parse error for a non-JSON server error | Shows the status |
| L31 | `apps/viewer` | Selecting an attached project wrote a link that failed after a reload | Attached projects stay out of the URL |

## Fixed without a failing test

These are small, and a test can't show them reliably, so they are recorded separately.

- `cli/studio.ts`: Save now writes a temporary file and renames it, so a crash can't truncate the manifest. A test covers the save, but can't force the crash.
- `cli/cli.ts`: file system errors print a one-line message instead of a stack trace.
- `cli/smarts.ts`: `ingest --ai --report` now says the report is skipped.
- `ui/video.ts`: a recording error stops the frame timer, and walkthroughs over seven steps scroll in the video.
- `ui/DemoTheater.tsx`: a refused fullscreen request no longer becomes an unhandled rejection.
- `apps/studio`: Open resets its file input, so the same file can be opened twice. The browser test tool can't reproduce the missing event.
- `cli/commands.ts`: removed a comment that was no longer true.

## Checked and not a bug

- A three-digit theme colour displays correctly in Chromium's colour picker.
- With no API key, the Claude SDK error reaches the "Set ANTHROPIC_API_KEY" message.
- Live reload's client list works on current Node, which an existing test covers.
- From reading the code: the `yaml` alias limit stops expansion bombs, `__proto__` can't enter through manifest names because they must start with a letter, and `safeFetch` counts bytes after decompression.

## Left as it is

| Item | Why |
|---|---|
| `?manifest=` on the unpinned Pages viewer shows any public manifest | It's the feature, and built sites are pinned. It can show text but not run scripts |
| `app-lens export` overwrites its output | The output is generated, so nothing is lost |
| Scenario `where` with a number never matches an enum option stored as text | The lint step warns that it selects nothing |
| The `?source=` parameter with an unknown value shows an error | That's the right answer for a bad link |

`HANDOFF.md` section 9 keeps the known limitations, such as thin drafts from JavaScript-only sites and Latin-only PDF text.
