import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CliError, init, isAllowedHost, parseCliArgs, pinManifest, serveStatic, validate } from '../src/commands';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'app-lens-cli-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
afterEach(() => { vi.restoreAllMocks(); });

describe('errors are reported, not thrown as stack traces', () => {
  it('rejects unknown flags as a CliError', () => {
    expect(() => parseCliArgs(['build', 'x', '--nope'])).toThrow(CliError);
  });

  it('reports a folder passed as a manifest', () => {
    expect(() => validate(dir)).toThrow(CliError);
  });

  it('reports a port that is already in use', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as AddressInfo;
    mkdirSync(join(dir, 'site'), { recursive: true });
    writeFileSync(join(dir, 'site/index.html'), 'hi');
    await expect(serveStatic(join(dir, 'site'), port)).rejects.toThrow(/already in use/);
    blocker.close();
  });
});

describe('init', () => {
  it('creates missing parent folders', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = join(dir, 'nested/deeper/app-lens.json');
    init(file, { name: 'Nested' });
    expect(JSON.parse(readFileSync(file, 'utf8')).app.name).toBe('Nested');
  });
});

describe('pinManifest', () => {
  it('adds a content security policy that allows the bundled assets only', () => {
    const html = pinManifest('<head><title>AppLens</title></head>', 'Demo');
    expect(html).toContain(`http-equiv="Content-Security-Policy"`);
    expect(html).toContain(`default-src 'self'`);
    expect(html).toContain(`connect-src 'self'`);
    expect(html).not.toMatch(/script-src[^;]*unsafe/);
  });
});

describe('isAllowedHost', () => {
  it.each(['127.0.0.1:4317', 'localhost:4317', '[::1]:4317'])('allows %s', (host) => {
    expect(isAllowedHost(host)).toBe(true);
  });
  it.each(['evil.example', 'evil.example:4317', '127.0.0.1.evil.example', ''])('blocks %s (DNS rebinding)', (host) => {
    expect(isAllowedHost(host)).toBe(false);
  });
});

describe('static server', () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    const root = join(dir, 'served');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'index.html'), '<h1>hi</h1>');
    server = await serveStatic(root, 0);
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => { server.close(); });

  const get = (path: string, host = `127.0.0.1:${port}`) =>
    new Promise<{ status: number; headers: Record<string, unknown> }>((resolve, reject) => {
      request({ host: '127.0.0.1', port, path, headers: { host } }, (response) => {
        response.resume();
        resolve({ status: response.statusCode ?? 0, headers: response.headers });
      }).on('error', reject).end();
    });

  it('serves files with safe headers', async () => {
    const response = await get('/');
    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns 404 for missing files and rejects foreign hosts', async () => {
    expect((await get('/missing.js')).status).toBe(404);
    expect((await get('/', 'evil.example')).status).toBe(403);
  });
});
