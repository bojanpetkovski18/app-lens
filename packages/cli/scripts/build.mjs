import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(cliRoot, '../..');
const viewerDist = join(repoRoot, 'apps/viewer/dist');
const embedBundle = join(repoRoot, 'packages/embed/dist/app-lens.js');
const dist = join(cliRoot, 'dist');

for (const required of [viewerDist, embedBundle]) {
  if (!existsSync(required)) {
    console.error(`Missing ${required}. Run "npm run build" from the repo root.`);
    process.exit(1);
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'embed'), { recursive: true });

await build({
  entryPoints: [join(cliRoot, 'src/cli.ts')],
  outfile: join(dist, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
});

cpSync(viewerDist, join(dist, 'viewer'), { recursive: true });
cpSync(embedBundle, join(dist, 'embed/app-lens.js'));
console.log('Built packages/cli/dist (cli.js, viewer/, embed/app-lens.js)');
