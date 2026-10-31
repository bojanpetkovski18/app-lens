# Polish audit

Run on 2026-10-31 against the production builds, on Windows with Node 24.20.0 and Chromium from Playwright. The audit is a permanent test, `e2e/audit.spec.ts`, so CI repeats it.

## Coverage

| Check | How |
|---|---|
| Widths of 320, 375, 768 and 1280 px | Each screen at each width. 200 % zoom on a 1280 px window lays out like 640 px, which sits inside this range |
| Light and dark themes | Viewer, built site and web component. Studio's chrome is always light |
| WCAG 2.1 A and AA | axe-core on each screen |
| No sideways scrolling | Compares the document's scroll width with its client width |
| Console and security policy | Fails on page errors, console errors and policy violations |
| Keyboard | All three dialogs: focus moves in, Tab stays in, Escape closes, focus returns |
| Reduced motion | Used on the demo, and the CSS turns animation off |

## Screens

- **Viewer:** overview, feature cards, feature matrix, data, record details, empty search, walkthroughs, walkthrough in progress, generated demo, embedded mode, invalid manifest, failed fetch, attach dialog
- **Delivery:** built site, web component
- **Studio:** form, every section open, JSON, validation problems, broken JSON, saved file, attach dialog, AI dialog with an error, draft review

The screenshots at 375 px of Studio, the AI dialog and the dark feature matrix were also read by eye.

## Findings

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | Every page load logged a security-policy violation, because zod tests for `eval` at startup. The existing test missed it, as the message doesn't contain the text it searched for | High | `z.config({ jitless: true })` in core |
| 2 | Built sites allowed `style-src 'unsafe-inline'`, only for one inline `body` rule | Medium | Moved the rule to a stylesheet and removed the allowance |
| 3 | The AI dialog didn't take focus, trap Tab or close on Escape | High | Shared `useDialog` hook |
| 4 | The attach dialog let Tab reach the page behind it and lost focus on closing | High | Shared `useDialog` hook |
| 5 | Keyboard users couldn't scroll wide tables at phone widths | High | The table wrappers are now labelled, focusable regions |
| 6 | A long saved path made Studio scroll sideways at 320 px | Low | `overflow-wrap: anywhere` |

## Checked and not a defect

The demo's category label measured 3.49:1 contrast while fading in, and it has no violation once the fade ends. The audit now measures that screen with reduced motion.

## Not covered

- Real screen readers. axe checks names and roles, not the spoken experience.
- Browsers other than Chromium.
- Performance scores from a tool such as Lighthouse. Bundle size and timing are in `PROGRESS.md`.
- The window while the AI request runs, which needs the live API.
