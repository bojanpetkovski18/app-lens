// Builds a real site, adds a page that loads the web component before its markup, and serves both.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'packages/cli/dist/cli.js');
const out = join(root, 'dist/e2e-site');

execFileSync(process.execPath, [cli, 'build', join(root, 'samples/taskpilot.app-lens.json'), '--out', out, '--force'], { stdio: 'inherit' });

writeFileSync(join(out, 'embed.html'), `<!doctype html>
<html lang="en"><head><title>Embed</title><script src="app-lens.js"></script></head>
<body>
<app-lens id="inline" tab="features">
<script type="application/json">{ "app": { "name": "InlineApp" }, "features": [{ "id": "one", "title": "Inline feature" }] }</script>
</app-lens>
<app-lens id="remote" src="manifest.json"></app-lens>
</body></html>
`);

const opened = join(root, 'dist/e2e-opened.json');
cpSync(join(root, 'samples/taskpilot.app-lens.json'), opened);
spawn(process.execPath, [cli, 'studio', opened, '--port', '4413'], { stdio: 'inherit' });
spawn(process.execPath, [cli, 'preview', out, '--port', '4411'], { stdio: 'inherit' });
