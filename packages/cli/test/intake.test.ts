import { parseManifest } from '@app-lens/core';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CliError } from '../src/commands';
import { attach, detectSource } from '../src/intake/attach';
import { gitignoreMatcher, scanFolder } from '../src/intake/folder';
import { extractTar, parseGithubUrl, withGithubSource, type FetchLike } from '../src/intake/github';
import { isBlockedAddress, safeFetch } from '../src/intake/net';
import { isAllowedByRobots, normalizeSiteUrl, parsePage, parseRobots, sitemapUrls } from '../src/intake/site';

let dir: string;
const cwd = process.cwd();
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-lens-intake-'));
  process.chdir(dir);
});
afterAll(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

describe('folder source', () => {
  const root = () => join(dir, 'fixture');
  beforeAll(() => {
    write(root(), {
      'package.json': '{"name":"fixture-app","description":"A fixture"}',
      'README.md': '# Fixture\n\n## Features\n\n- Reports: See numbers.\n',
      '.env': 'SECRET=hunter2',
      '.env.local': 'SECRET=hunter2',
      'server.key': 'PRIVATE',
      '.gitignore': 'ignored/\n*.gen.ts\n',
      'ignored/data.json': '{}',
      'src/app.gen.ts': 'x',
      'src/ok.ts': 'x',
      'node_modules/pkg/package.json': '{}',
      'huge.json': 'x'.repeat(600 * 1024),
    });
  });

  it('skips secrets, ignored files and dependencies', () => {
    const paths = scanFolder(root()).files.map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining(['package.json', 'README.md', 'src/ok.ts']));
    for (const skipped of ['.env', '.env.local', 'server.key', 'ignored/data.json', 'src/app.gen.ts', 'node_modules/pkg/package.json', 'huge.json']) expect(paths).not.toContain(skipped);
  });

  it('never returns secret content', () => {
    expect(JSON.stringify(scanFolder(root()).files)).not.toContain('hunter2');
  });

  it('caps the file count', () => {
    const { files, notes } = scanFolder(root(), { maxFiles: 2, maxFileBytes: 1000, maxTotalBytes: 1000 });
    expect(files).toHaveLength(2);
    expect(notes.join()).toContain('limit of 2 files');
  });

  it('does not follow symlinks out of the root', () => {
    const outside = join(dir, 'outside');
    write(outside, { 'secret.json': '{"leak":true}' });
    const link = join(dir, 'linked');
    write(link, { 'package.json': '{}' });
    try {
      symlinkSync(outside, join(link, 'escape'), 'junction');
    } catch {
      return;
    }
    expect(scanFolder(link).files.map((file) => file.path)).toEqual(['package.json']);
  });

  it('attaches and writes a valid draft and report', async () => {
    const out = join(dir, 'own/app-lens.json');
    const result = await attach(root(), { out });
    expect(result.thirdParty).toBe(false);
    expect(parseManifest(JSON.parse(readFileSync(out, 'utf8'))).ok).toBe(true);
    const report = JSON.parse(readFileSync(join(dir, 'own/app-lens.intake.json'), 'utf8'));
    expect(report.items.length).toBeGreaterThan(0);
    for (const item of report.items) expect(item.evidence.length).toBeGreaterThan(0);
  });

  it('writes nothing on a dry run', async () => {
    const out = join(dir, 'dry/app-lens.json');
    await attach(root(), { out, dryRun: true });
    expect(existsSync(out)).toBe(false);
  });
});

describe('gitignoreMatcher', () => {
  it('handles folders, wildcards, anchors and comments', () => {
    const ignored = gitignoreMatcher('# comment\nbuild/\n*.log\n/root.txt\ndocs/*.tmp\n!keep\n');
    expect(ignored('build/a.js')).toBe(true);
    expect(ignored('x/build/a.js')).toBe(true);
    expect(ignored('a/b.log')).toBe(true);
    expect(ignored('root.txt')).toBe(true);
    expect(ignored('sub/root.txt')).toBe(false);
    expect(ignored('docs/a.tmp')).toBe(true);
    expect(ignored('src/a.ts')).toBe(false);
  });
});

function tarEntry(name: string, content: string, type = '0', linkname = ''): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${Buffer.byteLength(content).toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.write('        ', 148);
  header.write(type, 156);
  header.write(linkname, 157, 100);
  header.write('ustar\0' + '00', 257);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  const body = Buffer.alloc(Math.ceil(Buffer.byteLength(content) / 512) * 512);
  body.write(content);
  return Buffer.concat([header, body]);
}
const tar = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(1024)]);

describe('parseGithubUrl', () => {
  it('accepts repo, branch and subfolder links', () => {
    expect(parseGithubUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseGithubUrl('https://github.com/owner/repo/tree/main/apps/web')).toEqual({ owner: 'owner', repo: 'repo', ref: 'main', path: 'apps/web' });
  });

  it.each([
    'http://github.com/owner/repo',
    'https://github.com.evil.example/owner/repo',
    'https://evil.example/github.com/owner/repo',
    'https://user:pw@github.com/owner/repo',
    'https://github.com/owner',
    'https://github.com/owner/repo/blob/main/x',
    'https://github.com/owner/repo/tree/main/../../secret',
    'https://github.com/owner/repo/tree/ma%20in',
    'https://github.com/-owner!/repo',
    'https://github.com/owner/repo?x=1',
    'https://github.com:8443/owner/repo',
  ])('rejects %s', (url) => {
    expect(parseGithubUrl(url)).toBeNull();
  });
});

describe('extractTar', () => {
  const target = () => mkdtempSync(join(dir, 'tar-'));

  it('strips the top folder and writes files', () => {
    const dest = target();
    extractTar(tar(tarEntry('repo-abc/', '', '5'), tarEntry('repo-abc/README.md', '# Hi')), dest);
    expect(readFileSync(join(dest, 'README.md'), 'utf8')).toBe('# Hi');
  });

  it.each(['repo/../../evil.txt', '../evil.txt', '/etc/evil.txt', 'repo/..\\..\\evil.txt', 'C:/evil.txt'])('rejects the traversal entry %s', (name) => {
    const dest = target();
    expect(() => extractTar(tar(tarEntry(name, 'x')), dest)).toThrow(/unsafe path/);
    expect(existsSync(join(dest, '..', 'evil.txt'))).toBe(false);
  });

  it('never creates symlinks or hard links', () => {
    const dest = target();
    extractTar(tar(tarEntry('repo/link', '', '2', '/etc/passwd'), tarEntry('repo/hard', '', '1', '/etc/passwd'), tarEntry('repo/a.txt', 'ok')), dest);
    expect(readdirSync(dest)).toEqual(['a.txt']);
  });

  it('rejects traversal hidden in a long name', () => {
    expect(() => extractTar(tar(tarEntry('././@LongLink', '../../evil.txt', 'L'), tarEntry('short', 'x')), target())).toThrow(/unsafe path/);
    const pax = '32 path=repo/../../../evil.txt\n';
    expect(() => extractTar(tar(tarEntry('x', pax, 'x'), tarEntry('short', 'x')), target())).toThrow(/unsafe path/);
  });
});

describe('GitHub source', () => {
  const repoTar = gzipSync(tar(
    tarEntry('o-r-abc/package.json', '{"name":"remote-app","description":"From GitHub"}'),
    tarEntry('o-r-abc/.env', 'TOKEN=abc'),
    tarEntry('o-r-abc/apps/web/README.md', '# Web\n'),
  ));
  const mock = (status = 200, body: Uint8Array = repoTar): { fetch: FetchLike; calls: { url: string; headers: Record<string, string> }[] } => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    return { calls, fetch: async (url, init) => { calls.push({ url, headers: init.headers }); return new Response(body.slice(), { status }); } };
  };

  it('downloads the tarball, cleans up and marks the draft as third-party', async () => {
    const { fetch, calls } = mock();
    const result = await attach('https://github.com/o/r', { fetchImpl: fetch });
    expect(calls[0]?.url).toBe('https://api.github.com/repos/o/r/tarball');
    expect(result.thirdParty).toBe(true);
    expect(result.out.replace(/\\/g, '/')).toBe('drafts/remote-app.app-lens.json');
    const manifest = JSON.parse(readFileSync(result.out, 'utf8'));
    expect(manifest.draft).toEqual({ thirdParty: true, source: 'https://github.com/o/r' });
    expect(manifest.attribution.text).toContain('Not affiliated');
  });

  it('removes the temp folder even when reading fails', async () => {
    const { fetch } = mock();
    let seen = '';
    await expect(withGithubSource({ owner: 'o', repo: 'r' }, (folder) => { seen = folder; throw new Error('boom'); }, fetch, undefined)).rejects.toThrow('boom');
    expect(existsSync(seen)).toBe(false);
  });

  it('uses GITHUB_TOKEN without exposing it', async () => {
    const { fetch, calls } = mock();
    const result = await withGithubSource({ owner: 'o', repo: 'r', ref: 'dev' }, () => 'ok', fetch, 'tok123');
    expect(result).toBe('ok');
    expect(calls[0]?.url).toContain('/tarball/dev');
    expect(calls[0]?.headers.Authorization).toBe('Bearer tok123');
  });

  it('finds branch names that contain a slash', async () => {
    const tried: string[] = [];
    const fetch: FetchLike = async (url) => {
      tried.push(url);
      return url.endsWith('/tarball/feature/login') ? new Response(gzipSync(tar(tarEntry('r/web/a.json', '{}')))) : new Response('', { status: 404 });
    };
    const found = await withGithubSource({ owner: 'o', repo: 'r', ref: 'feature', path: 'login/web' }, (folder) => readdirSync(folder), fetch, undefined);
    expect(found).toEqual(['a.json']);
    expect(tried).toHaveLength(2);
  });

  it('reports a missing repo and a corrupt archive', async () => {
    await expect(withGithubSource({ owner: 'o', repo: 'r' }, () => 1, mock(404).fetch, undefined)).rejects.toThrow('not found');
    await expect(withGithubSource({ owner: 'o', repo: 'r' }, () => 1, mock(200, Buffer.from('nope')).fetch, undefined)).rejects.toThrow('could not be unpacked');
  });
});

describe('SSRF guard', () => {
  it.each(['127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '[::1]', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', 'not-an-ip'])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '151.101.1.140', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('refuses literal private addresses and private DNS answers', async () => {
    await expect(safeFetch('http://127.0.0.1/')).rejects.toThrow('blocked');
    await expect(safeFetch('http://[::1]/')).rejects.toThrow('blocked');
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('blocked');
    await expect(safeFetch('http://sneaky.example/', { resolve: async () => ['10.0.0.5'] })).rejects.toThrow('blocked');
    await expect(safeFetch('http://mixed.example/', { resolve: async () => ['8.8.8.8', '127.0.0.1'] })).rejects.toThrow('blocked');
  });

  it('refuses other schemes and URLs with credentials', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow('Only http(s)');
    await expect(safeFetch('http://a:b@example.com/')).rejects.toThrow('credentials');
  });
});

describe('website source', () => {
  let server: Server;
  let base: string;
  const hits: string[] = [];
  const net = () => ({ resolve: async () => ['127.0.0.1'], isBlocked: () => false, maxBytes: 200_000 });
  const pages: Record<string, string> = {
    '/': `<html><head><title>Forum | Home</title><meta name="description" content="Talk about things"><meta name="theme-color" content="#ff4500"><link rel="manifest" href="/app.webmanifest"></head><body>
      <nav><a href="/communities">Communities</a><a href="/private/admin">Admin</a><a href="https://other.example/x">Elsewhere</a><a href="/login">Log in</a></nav>
      <h1>Top post by jane.doe@mail.example</h1><article>My real name is Jane Doe</article>
      <form><input type="email" name="email"><input name="city"></form></body></html>`,
    '/communities': '<html><head><title>Communities</title></head><body><nav><a href="/">Home</a></nav></body></html>',
    '/private/admin': '<html><body>secret page</body></html>',
    '/robots.txt': 'User-agent: *\nDisallow: /private/\n',
    '/sitemap.xml': '<urlset><url><loc>/nowhere</loc></url></urlset>',
    '/app.webmanifest': '{"name":"Forum App","theme_color":"#112233"}',
    '/redirect': '',
    '/big': 'x'.repeat(500_000),
  };

  beforeAll(async () => {
    server = createServer((request, response) => {
      const path = (request.url ?? '/').split('?')[0] as string;
      hits.push(path);
      if (path === '/redirect') {
        response.writeHead(302, { Location: 'http://169.254.169.254/latest/' });
        response.end();
        return;
      }
      const body = pages[path];
      response.writeHead(body === undefined ? 404 : 200, { 'Content-Type': path.endsWith('.txt') ? 'text/plain' : path.endsWith('manifest') ? 'application/json' : 'text/html' });
      response.end(body ?? '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://site.example:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });

  it('crawls structure, respects robots.txt and stays on the origin', async () => {
    const result = await attach(`${base}/`, { dryRun: true, net: { ...net(), delayMs: 0 } as never });
    expect(result.manifest.app?.name).toBe('Forum App');
    expect(result.manifest.app?.theme?.primary).toBe('#112233');
    expect(result.manifest.features?.map((feature) => feature.title)).toEqual(['Communities']);
    expect(hits).not.toContain('/private/admin');
    expect(hits).not.toContain('/x');
    expect(parseManifest(result.manifest).ok).toBe(true);
  });

  it('never copies page content into the draft', async () => {
    const { manifest, report } = await attach(`${base}/`, { dryRun: true, net: { ...net(), delayMs: 0 } as never });
    const text = JSON.stringify({ manifest, report });
    for (const leak of ['jane.doe', 'Jane Doe', 'secret page']) expect(text).not.toContain(leak);
  });

  it('re-checks every redirect', async () => {
    const options = { resolve: net().resolve, isBlocked: (address: string) => address !== '127.0.0.1' };
    await expect(safeFetch(`${base}/redirect`, options)).rejects.toThrow('blocked');
  });

  it('caps the response size', async () => {
    const response = await safeFetch(`${base}/big`, { ...net(), maxBytes: 1000 });
    expect(response.text.length).toBeLessThan(70_000);
  });

  it('reports a blocked site as a CLI error', async () => {
    await expect(attach('http://localhost.example/', { dryRun: true, net: { resolve: async () => ['127.0.0.1'] } })).rejects.toThrow(CliError);
  });
});

describe('robots and parsing', () => {
  it('uses the most specific group and rule', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/open\n\nUser-agent: applens\nDisallow: /only\nSitemap: https://x.example/s.xml\n');
    expect(isAllowedByRobots(rules, '/a/closed')).toBe(true);
    expect(isAllowedByRobots(rules, '/only/x')).toBe(false);
    expect(rules.sitemaps).toEqual(['https://x.example/s.xml']);
    const star = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/open\nDisallow: /*.pdf$\n');
    expect(isAllowedByRobots(star, '/a/closed')).toBe(false);
    expect(isAllowedByRobots(star, '/a/open/1')).toBe(true);
    expect(isAllowedByRobots(star, '/f.pdf')).toBe(false);
    expect(isAllowedByRobots(parseRobots('User-agent: *\nDisallow: /\n'), '/')).toBe(false);
    expect(isAllowedByRobots(parseRobots(''), '/')).toBe(true);
  });

  it('normalises bare hosts', () => {
    expect(normalizeSiteUrl('www.reddit.com')?.href).toBe('https://www.reddit.com/');
    expect(normalizeSiteUrl('http://example.com/a')?.href).toBe('http://example.com/a');
    expect(normalizeSiteUrl('ftp://example.com')).toBeNull();
    expect(normalizeSiteUrl('javascript://example.com')).toBeNull();
  });

  it('reads sitemaps and ignores hidden form fields', () => {
    expect(sitemapUrls('<url><loc> https://a.example/1 </loc></url>')).toEqual(['https://a.example/1']);
    const page = parsePage('<form><input type="hidden" name="csrf"><input name="a"><button type="submit" name="b"></button></form>', 'https://a.example/');
    expect(page.forms[0]?.fields).toEqual([{ name: 'a', type: 'input' }]);
  });
});

describe('third-party rules', () => {
  it('detects each source type', () => {
    expect(detectSource(dir)).toMatchObject({ type: 'folder' });
    expect(detectSource('https://github.com/o/r')).toMatchObject({ type: 'github' });
    expect(detectSource('www.reddit.com')).toMatchObject({ type: 'site' });
    expect(() => detectSource('https://github.com/just-owner')).toThrow(CliError);
    expect(() => detectSource('./missing-folder')).toThrow(CliError);
  });

  it('refuses to write third-party output into samples or outside drafts', async () => {
    const fetch: FetchLike = async () => new Response(gzipSync(tar(tarEntry('r/package.json', '{"name":"x"}'))));
    await expect(attach('https://github.com/o/r', { fetchImpl: fetch, out: join('samples', 'x.app-lens.json') })).rejects.toThrow('samples');
    await expect(attach('https://github.com/o/r', { fetchImpl: fetch, out: 'public/x.json' })).rejects.toThrow('drafts');
  });

  it('treats a folder as third-party on request', async () => {
    write(join(dir, 'other'), { 'package.json': '{"name":"their-app"}' });
    const result = await attach(join(dir, 'other'), { thirdParty: true, dryRun: true });
    expect(result.manifest.draft?.thirdParty).toBe(true);
  });

  it('lets an owner opt out', async () => {
    const fetch: FetchLike = async () => new Response(gzipSync(tar(tarEntry('r/package.json', '{"name":"mine"}'))));
    const result = await attach('https://github.com/o/r', { fetchImpl: fetch, own: true, dryRun: true });
    expect(result.thirdParty).toBe(false);
    expect(result.manifest.draft).toBeUndefined();
  });
});
