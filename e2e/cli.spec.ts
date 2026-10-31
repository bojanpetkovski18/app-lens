import { expect, test } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the bundled binary. Unit tests import the sources, so they cannot catch bundling problems.
const cli = (...args: string[]) => execFileSync(process.execPath, ['packages/cli/dist/cli.js', ...args], { encoding: 'utf8' });

test.describe('built CLI', () => {
  let dir: string;
  test.beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'app-lens-e2e-')); });
  test.afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  test('starts and prints help', () => {
    expect(cli('--help')).toContain('app-lens ingest');
  });

  test('ingests YAML with the bundled parser', () => {
    const spec = join(dir, 'spec.yaml');
    writeFileSync(spec, 'openapi: 3.0.0\ninfo:\n  title: Bundled\ncomponents:\n  schemas:\n    Item:\n      properties:\n        name: { type: string }\n');
    const out = join(dir, 'draft.json');
    cli('ingest', 'openapi', spec, '--out', out);
    expect(JSON.parse(readFileSync(out, 'utf8')).app.name).toBe('Bundled');
    expect(cli('validate', out)).toContain('is valid');
  });

  test('exports a PDF', () => {
    const out = join(dir, 'one.pdf');
    cli('export', 'pdf', 'samples/invoiceflow.app-lens.json', '--out', out);
    expect(readFileSync(out).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('exits non-zero on a low score', () => {
    const result = spawnSync(process.execPath, ['packages/cli/dist/cli.js', 'lint', 'samples/invoiceflow.app-lens.json', '--min-score', '101']);
    expect(result.status).toBe(1);
  });
});
