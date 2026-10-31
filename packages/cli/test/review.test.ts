import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CliError } from '../src/commands';
import { attach } from '../src/intake/attach';
import { gitignoreMatcher } from '../src/intake/folder';
import { extractTar, parseGithubUrl, withGithubSource, type FetchLike } from '../src/intake/github';
import { isBlockedAddress, safeFetch } from '../src/intake/net';
import { crawlSite, isAllowedByRobots, parsePage, parseRobots } from '../src/intake/site';
import { studioApi } from '../src/studio';

let dir: string;
const cwd = process.cwd();
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-lens-review-'));
  process.chdir(dir);
});
afterAll(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

function folder(name: string): string {
  const path = join(dir, name);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'package.json'), '{"name":"my-app"}');
  return path;
}

function tarEntry(name: string, body: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write(Buffer.byteLength(body).toString(8).padStart(11, '0'), 124);
  header.write('0', 156);
  const data = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512);
  data.write(body);
  return Buffer.concat([header, data]);
}

describe('attach', () => {
  it('refuses to replace an existing manifest', async () => {
    const project = folder('keep-mine');
    const out = join(dir, 'mine.json');
    writeFileSync(out, 'hand written');
    await expect(attach(project, { out, report: join(dir, 'mine-report.json') })).rejects.toThrow(/--force/);
    expect(readFileSync(out, 'utf8')).toBe('hand written');
  });

  it('replaces it with --force', async () => {
    const project = folder('replace-mine');
    const out = join(dir, 'forced.json');
    writeFileSync(out, 'hand written');
    await attach(project, { out, report: join(dir, 'forced-report.json'), force: true });
    expect(readFileSync(out, 'utf8')).toContain('"manifestVersion"');
  });

  it('allows a third-party draft when a parent folder happens to be called samples', async () => {
    const project = folder('someone-elses');
    const parent = join(dir, 'samples', 'work');
    mkdirSync(parent, { recursive: true });
    process.chdir(parent);
    try {
      const { out } = await attach(project, { thirdParty: true, dryRun: true });
      expect(out).toContain('drafts');
    } finally {
      process.chdir(dir);
    }
  });

  it('still refuses samples/ inside the project for a third-party draft', async () => {
    const project = folder('still-refused');
    await expect(attach(project, { thirdParty: true, out: join('samples', 'x.json'), dryRun: true })).rejects.toThrow(CliError);
  });
});

describe('untrusted patterns', () => {
  const stars = `/${'*a'.repeat(40)}b`;

  it('does not hang on a hostile robots.txt rule', () => {
    const rules = parseRobots(`User-agent: *\nDisallow: ${stars}\n`);
    const started = performance.now();
    expect(isAllowedByRobots(rules, `/${'a'.repeat(1500)}`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('keeps wildcard and end-of-path rules working', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /private\nAllow: /private/open\n');
    expect(isAllowedByRobots(rules, '/files/a.pdf')).toBe(false);
    expect(isAllowedByRobots(rules, '/files/a.pdf?x=1')).toBe(true);
    expect(isAllowedByRobots(rules, '/private/x')).toBe(false);
    expect(isAllowedByRobots(rules, '/private/open/x')).toBe(true);
  });

  it('does not hang on a hostile .gitignore pattern', () => {
    const ignored = gitignoreMatcher(`${'*a'.repeat(40)}b\n`);
    const started = performance.now();
    expect(ignored('a'.repeat(1500))).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('matches every .gitignore form', () => {
    const ignored = gitignoreMatcher('**/generated\nlogs/**\ndocs/*.tmp\n/root.txt\n*.log\nbuild/\na?c.txt\n');
    expect(ignored('generated')).toBe(true);
    expect(ignored('src/deep/generated/file.ts')).toBe(true);
    expect(ignored('logs/a/b.txt')).toBe(true);
    expect(ignored('docs/a.tmp')).toBe(true);
    expect(ignored('docs/sub/a.tmp')).toBe(false);
    expect(ignored('root.txt')).toBe(true);
    expect(ignored('src/root.txt')).toBe(false);
    expect(ignored('src/x.log')).toBe(true);
    expect(ignored('src/build/x.js')).toBe(true);
    expect(ignored('abc.txt')).toBe(true);
    expect(ignored('a/c.txt')).toBe(false);
    expect(ignored('src/index.ts')).toBe(false);
  });

  it('applies a robots group only to its exact agent', () => {
    const rules = parseRobots('User-agent: app\nDisallow: /\n\nUser-agent: *\nDisallow: /private\n');
    expect(isAllowedByRobots(rules, '/open')).toBe(true);
    const own = parseRobots('User-agent: AppLens\nDisallow: /\n\nUser-agent: *\nAllow: /\n');
    expect(isAllowedByRobots(own, '/open')).toBe(false);
  });
});

describe('address checks', () => {
  it('blocks IPv4 hidden inside IPv6', () => {
    for (const address of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::7f00:1', '2002:7f00:1::', '64:ff9b:1::1']) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('crawling', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = undefined;
  });

  async function serve(handler: RequestListener): Promise<number> {
    server = createServer(handler);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return (server.address() as AddressInfo).port;
  }

  const net = { resolve: async () => ['127.0.0.1'], isBlocked: () => false, delayMs: 0 };
  const html = (body: string) => `<html><head><title>T</title></head><body>${body}</body></html>`;

  it('follows the site after a redirect to its canonical host', async () => {
    const port = await serve((request, response) => {
      const host = (request.headers.host ?? '').split(':')[0];
      if (host === 'site.example') {
        response.writeHead(301, { Location: `http://www.site.example:${port}${request.url}` });
        response.end();
      } else if (request.url === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html('<nav><a href="/pricing">Pricing</a></nav>'));
      } else if (request.url === '/pricing') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html('<nav><a href="/">Home</a></nav>'));
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    const { pages } = await crawlSite(new URL(`http://site.example:${port}/`), net);
    expect(pages.map((page) => new URL(page.url).pathname)).toEqual(['/', '/pricing']);
  });

  it('uses the robots.txt of the host it landed on', async () => {
    const port = await serve((request, response) => {
      const host = (request.headers.host ?? '').split(':')[0];
      if (host === 'site.example') {
        response.writeHead(301, { Location: `http://www.site.example:${port}${request.url}` });
        response.end();
      } else if (request.url === '/robots.txt') {
        response.writeHead(200);
        response.end('User-agent: *\nDisallow: /secret\n');
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html('<nav><a href="/secret">Secret</a><a href="/open">Open</a></nav>'));
      }
    });
    const { pages } = await crawlSite(new URL(`http://site.example:${port}/`), net);
    expect(pages.map((page) => new URL(page.url).pathname)).toEqual(['/', '/open']);
  });

  it('leaves out a page that redirects to another site', async () => {
    const port = await serve((request, response) => {
      const host = (request.headers.host ?? '').split(':')[0];
      if (host === 'other.example') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html('<nav><a href="/elsewhere">Elsewhere</a></nav>'));
      } else if (request.url === '/out') {
        response.writeHead(302, { Location: `http://other.example:${port}/` });
        response.end();
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html('<nav><a href="/out">Out</a></nav>'));
      }
    });
    const { pages } = await crawlSite(new URL(`http://site.example:${port}/`), net);
    expect(pages.map((page) => new URL(page.url).host.split(':')[0])).toEqual(['site.example']);
  });

  it('survives a web app manifest link that is not a URL', async () => {
    const port = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html><head><title>T</title><link rel="manifest" href="http://"></head><body></body></html>');
    });
    await expect(crawlSite(new URL(`http://site.example:${port}/`), net)).resolves.toMatchObject({ pages: [expect.anything()] });
  });

  it('gives up on a server that drips bytes forever', async () => {
    const port = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      const timer = setInterval(() => response.write('x'), 50);
      response.on('close', () => clearInterval(timer));
    });
    const started = performance.now();
    await expect(safeFetch(`http://site.example:${port}/`, { ...net, timeoutMs: 300 })).rejects.toThrow(/Timed out/);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('finds links after a header nested in the nav', () => {
    const page = parsePage('<nav><header><b>Menu</b></header><a href="/x">Xylophone</a></nav>', 'https://example.com/');
    expect(page.navLinks.map((link) => link.text)).toEqual(['Xylophone']);
  });
});

describe('GitHub sources', () => {
  it('accepts the www form of a link', () => {
    expect(parseGithubUrl('https://www.github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('skips an entry that cannot be written instead of failing', () => {
    const out = mkdtempSync(join(dir, 'tar-'));
    const archive = Buffer.concat([tarEntry('repo/file', 'text'), tarEntry('repo/file/child.md', 'text'), tarEntry('repo/good.md', 'text'), Buffer.alloc(1024)]);
    expect(() => extractTar(archive, out)).not.toThrow();
    expect(existsSync(join(out, 'good.md'))).toBe(true);
  });

  it('explains a link to a file', async () => {
    const archive = gzipSync(Buffer.concat([tarEntry('repo/README.md', '# Hi'), Buffer.alloc(1024)]));
    const fetchImpl: FetchLike = async () => new Response(archive);
    const { fromFolder } = { fromFolder: (path: string) => path };
    await expect(withGithubSource({ owner: 'o', repo: 'r', ref: 'main', path: 'README.md' }, fromFolder, fetchImpl)).rejects.toThrow(CliError);
  });
});

describe('Studio server', () => {
  let server: Server;
  let base: string;
  const file = () => join(dir, 'bom.json');

  beforeAll(async () => {
    writeFileSync(file(), '﻿{"app":{"name":"With BOM"}}\n');
    const api = studioApi({ file: file() });
    server = createServer((request, response) => {
      if (!api(request, response)) response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const put = (body: string) => fetch(`${base}/__app-lens/manifest`, { method: 'PUT', headers: { Origin: base, 'Content-Type': 'application/json' }, body });

  it('removes a byte order mark when loading a file', async () => {
    const { text } = (await (await fetch(`${base}/__app-lens/manifest`)).json()) as { text: string };
    expect(JSON.parse(text).app.name).toBe('With BOM');
  });

  it('answers a body that is valid JSON but not an object', async () => {
    expect((await put('null')).status).toBe(422);
  });

  it('answers 404 for an unknown route', async () => {
    expect((await fetch(`${base}/__app-lens/nope`)).status).toBe(404);
  });

  it('saves and leaves no temporary file behind', async () => {
    expect((await put(JSON.stringify({ text: '{"app":{"name":"Saved"}}' }))).status).toBe(200);
    expect(JSON.parse(readFileSync(file(), 'utf8')).app.name).toBe('Saved');
    expect(existsSync(`${file()}.tmp`)).toBe(false);
  });
});
