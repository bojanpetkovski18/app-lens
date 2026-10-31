import { parseManifest } from '@app-lens/core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CliError, parseCliArgs, serveStatic, type LiveReload } from '../src/commands';
import { diff, exportManifest, ingest, lint, parseSpec } from '../src/smarts';

let dir: string;
const logs: string[] = [];
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'app-lens-smarts-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
afterEach(() => {
  logs.length = 0;
  vi.restoreAllMocks();
});
const quiet = () => vi.spyOn(console, 'log').mockImplementation((message: string) => { logs.push(message); });
const path = (name: string) => join(dir, name);

const YAML_SPEC = `openapi: 3.0.0
info:
  title: Yaml Store
components:
  schemas:
    Item:
      type: object
      properties:
        name: { type: string }
        price: { type: number }
`;

describe('ingest', () => {
  it('drafts a valid manifest and report from YAML', () => {
    quiet();
    writeFileSync(path('spec.yaml'), YAML_SPEC);
    ingest('openapi', path('spec.yaml'), { out: path('draft.json'), report: path('report.json') });
    const manifest = JSON.parse(readFileSync(path('draft.json'), 'utf8'));
    expect(parseManifest(manifest).ok).toBe(true);
    expect(manifest.app.name).toBe('Yaml Store');
    expect(JSON.parse(readFileSync(path('report.json'), 'utf8')).items[0]).toMatchObject({ kind: 'entity', name: 'Item' });
  });

  it('refuses to overwrite and rejects unknown types', () => {
    writeFileSync(path('taken.json'), '{}');
    writeFileSync(path('spec2.yaml'), YAML_SPEC);
    expect(() => ingest('openapi', path('spec2.yaml'), { out: path('taken.json') })).toThrow(CliError);
    expect(() => ingest('graphql', path('spec2.yaml'), { out: path('other.json') })).toThrow('Unknown ingest type');
  });

  it('reports broken specs as CLI errors', () => {
    writeFileSync(path('bad.yaml'), 'a: [unclosed');
    expect(() => ingest('openapi', path('bad.yaml'), { out: path('x.json') })).toThrow(CliError);
    writeFileSync(path('other.json'), '{"not":"openapi"}');
    expect(() => ingest('openapi', path('other.json'), { out: path('y.json') })).toThrow(CliError);
  });

  it('caps YAML alias expansion', () => {
    const bomb = ['a: &a [x,x,x,x,x,x,x,x,x]', ...Array.from({ length: 12 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${Array(9).fill(`*${String.fromCharCode(97 + i)}`).join(',')}]`)].join('\n');
    expect(() => parseSpec(bomb, 'bomb.yaml')).toThrow(CliError);
  });
});

describe('export, lint and diff', () => {
  const manifest = { app: { name: 'Export Me', tagline: 'Tag' }, features: [{ id: 'f', title: 'Feature', description: 'Does things' }], mock: { baseDate: '2025-01-15' } };
  beforeAll(() => {
    writeFileSync(path('m.json'), JSON.stringify(manifest));
    writeFileSync(path('m2.json'), JSON.stringify({ ...manifest, features: [] }));
    writeFileSync(path('invalid.json'), '{"app":{}}');
  });

  it('writes Markdown and PDF', () => {
    quiet();
    exportManifest('md', path('m.json'), { out: path('out/one.md') });
    exportManifest('pdf', path('m.json'), { out: path('out/one.pdf') });
    expect(readFileSync(path('out/one.md'), 'utf8')).toContain('# Export Me');
    expect(readFileSync(path('out/one.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rejects unknown formats and invalid manifests', () => {
    expect(() => exportManifest('docx', path('m.json'))).toThrow('Unknown export format');
    expect(() => exportManifest('md', path('invalid.json'))).toThrow(CliError);
  });

  it('lint enforces --min-score', () => {
    quiet();
    expect(lint(path('m.json'))).toBe(true);
    expect(lint(path('m.json'), { 'min-score': '101' })).toBe(false);
    expect(lint(path('m.json'), { 'min-score': '1' })).toBe(true);
    expect(() => lint(path('m.json'), { 'min-score': 'high' })).toThrow(CliError);
    expect(logs[0]).toContain('/100');
  });

  it('diff lists changes', () => {
    quiet();
    diff(path('m.json'), path('m2.json'));
    expect(logs).toEqual(['- features: f']);
    logs.length = 0;
    diff(path('m.json'), path('m.json'));
    expect(logs).toEqual(['No differences.']);
    expect(() => diff(path('m.json'), undefined)).toThrow(CliError);
  });
});

describe('live reload', () => {
  let server: Server;
  let live: LiveReload | undefined;
  let port: number;
  beforeAll(async () => {
    writeFileSync(path('index.html'), '<html><head></head><body>hi</body></html>');
    server = await serveStatic(dir, 0, (handle) => { live = handle; });
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => { server.closeAllConnections(); server.close(); });

  const read = (url: string) => new Promise<string>((resolve, reject) => {
    request({ host: '127.0.0.1', port, path: url }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    }).on('error', reject).end();
  });

  it('adds the reload script to pages and serves it from the site origin', async () => {
    expect(await read('/')).toContain('<script src="/__app-lens/live.js"></script></head>');
    expect(await read('/__app-lens/live.js')).toContain('new EventSource');
  });

  it('notifies connected pages', async () => {
    const message = new Promise<string>((resolve) => {
      request({ host: '127.0.0.1', port, path: '/__app-lens/live' }, (response) => {
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => { if (chunk.includes('reload')) resolve(chunk); });
        live?.reload();
      }).end();
    });
    await expect(message).resolves.toContain('data: reload');
  });
});

describe('parseCliArgs', () => {
  it('accepts the new flags', () => {
    expect(parseCliArgs(['preview', 'x', '--watch']).values.watch).toBe(true);
    expect(parseCliArgs(['lint', 'x', '--min-score', '80']).values['min-score']).toBe('80');
  });
});
