// Prints the numbers compared before and after a review: bundle sizes and generation time.
// Run after "npm run build".
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function sizeOf(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) return readdirSync(path).reduce((total, name) => total + sizeOf(join(path, name)), 0);
  return stat.size;
}

function report(label, path) {
  if (!existsSync(path)) return;
  const size = sizeOf(path);
  const gzip = statSync(path).isFile() ? ` (${(gzipSync(readFileSync(path)).length / 1024).toFixed(1)} kB gzip)` : '';
  console.log(`${label.padEnd(26)} ${(size / 1024).toFixed(1)} kB${gzip}`);
}

report('apps/viewer/dist', join(root, 'apps/viewer/dist'));
report('apps/studio/dist', join(root, 'apps/studio/dist'));
report('embed app-lens.js', join(root, 'packages/embed/dist/app-lens.js'));
report('cli cli.js', join(root, 'packages/cli/dist/cli.js'));

const dir = mkdtempSync(join(tmpdir(), 'app-lens-measure-'));
const bundle = join(dir, 'core.mjs');
await build({ entryPoints: [join(root, 'packages/core/src/index.ts')], outfile: bundle, bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
const { generateDataset, parseManifest } = await import(pathToFileURL(bundle).href);
rmSync(dir, { recursive: true, force: true });

// 30 entities of 500 records with 40 fields each (39 plus a ref) is the largest manifest the schema allows.
const fields = Object.fromEntries(Array.from({ length: 39 }, (_, i) => [`f${i}`, i % 2 ? 'paragraph:2..4' : 'fullName']));
const entities = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`E${i}`, { count: 500, fields: { ...fields, ...(i ? { parent: `ref:E${i - 1}` } : {}) } }]));
const input = { app: { name: 'Large' }, entities, mock: { seed: 'measure', baseDate: '2025-01-15' } };

const timed = (fn) => {
  const start = performance.now();
  const value = fn();
  return [value, performance.now() - start];
};
const [parsed, parseMs] = timed(() => parseManifest(input));
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues.slice(0, 3)));
const [dataset, generateMs] = timed(() => generateDataset(parsed.manifest));
const records = Object.values(dataset).reduce((total, list) => total + list.length, 0);
console.log(`${'parse max manifest'.padEnd(26)} ${parseMs.toFixed(0)} ms`);
console.log(`${`generate ${records} records`.padEnd(26)} ${generateMs.toFixed(0)} ms`);
