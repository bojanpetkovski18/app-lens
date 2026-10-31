# AppLens

Let any app show people what it does. Describe your app in one JSON **manifest**, and AppLens turns it into an interactive showcase:

- an overview, a feature catalogue and a "who gets what" matrix
- a data explorer filled with **generated, fictional, deterministic** sample data
- step-by-step walkthroughs and an auto-generated product demo

Use the result as a standalone site, inside an iframe, as an `<app-lens>` web component, or through the `app-lens` CLI.

## Quick start

Requires Node 20.19 or later (22 LTS recommended) and npm 10 or later.

```bash
npm install
npm run dev            # viewer with the sample apps at http://localhost:5173
npm test
npm run build
npm run app-lens -- --help
```

Create and preview your own showcase:

```bash
npm run app-lens -- init app-lens.json --name "My App"
npm run app-lens -- validate app-lens.json
npm run app-lens -- preview app-lens.json
```

## Embed it

```html
<script src="app-lens.js"></script>
<app-lens src="manifest.json" theme="auto" primary="#0f766e" tab="scenarios"></app-lens>
```

## Documentation

- [HANDOFF.md](HANDOFF.md): project status, workflow and full manifest reference
- [REBUILD.md](REBUILD.md): complete build record

## Licence

[MIT](LICENSE)
