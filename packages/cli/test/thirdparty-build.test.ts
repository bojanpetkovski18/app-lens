import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { build, CliError } from '../src/commands';

const dir = mkdtempSync(join(tmpdir(), 'app-lens-thirdparty-'));
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('third-party drafts', () => {
  it('cannot be built', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = join(dir, 'draft.json');
    writeFileSync(file, JSON.stringify({ app: { name: 'Theirs' }, draft: { thirdParty: true, source: 'https://example.com' } }));
    expect(() => build(file, { out: join(dir, 'site') })).toThrow(CliError);
  });

  it('never appear in samples', () => {
    const samples = join(__dirname, '../../../samples');
    for (const file of readdirSync(samples)) {
      expect(JSON.parse(readFileSync(join(samples, file), 'utf8')).draft, file).toBeUndefined();
    }
  });
});
