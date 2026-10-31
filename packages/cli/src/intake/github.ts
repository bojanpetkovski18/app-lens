import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CliError } from '../commands';

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 500 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const MAX_REF_SEGMENTS = 5;
const BLOCK = 512;

export interface GithubSource {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
}

/** Accepts only https://github.com/<owner>/<repo>[/tree/<ref>[/<path>]]. */
export function parseGithubUrl(value: string): GithubSource | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
  const [owner, rawRepo, tree, ref, ...path] = url.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, '');
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  if (tree === undefined) return { owner, repo };
  if (tree !== 'tree' || !ref || !REF.test(ref) || ref.includes('..')) return null;
  if (path.some((segment) => !PATH_SEGMENT.test(segment) || segment === '.' || segment === '..')) return null;
  return { owner, repo, ref, ...(path.length > 0 ? { path: path.join('/') } : {}) };
}

function field(header: Buffer, offset: number, length: number): string {
  const raw = header.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString('utf8');
}

function paxPath(data: Buffer): string | undefined {
  const text = data.toString('utf8');
  let index = 0;
  while (index < text.length) {
    const space = text.indexOf(' ', index);
    if (space === -1) return undefined;
    const length = Number(text.slice(index, space));
    if (!Number.isInteger(length) || length <= 0) return undefined;
    const record = text.slice(space + 1, index + length - 1);
    if (record.startsWith('path=')) return record.slice(5);
    index += length;
  }
  return undefined;
}

/**
 * Extracts a tar archive into `dest`. Only regular files and folders are written: links are dropped
 * and any entry that would land outside `dest` aborts the extraction.
 */
export function extractTar(archive: Buffer, dest: string, stripComponents = 1): void {
  const root = resolve(dest);
  let offset = 0;
  let entries = 0;
  let unpacked = 0;
  let longName: string | undefined;

  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    if (++entries > MAX_ENTRIES) throw new CliError('The archive has too many entries.');
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new CliError('The archive is corrupt.');
    const type = String.fromCharCode(header[156] ?? 0);
    const start = offset + BLOCK;
    const data = archive.subarray(start, start + size);
    offset = start + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'g') continue;
    if (type === 'x') {
      longName = paxPath(data);
      continue;
    }
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0+$/, '');
      continue;
    }

    const prefix = field(header, 345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    longName = undefined;

    const normalized = name.replace(/\\/g, '/');
    const parts = normalized.split('/').filter((part) => part && part !== '.');
    if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || parts.includes('..')) {
      throw new CliError(`The archive has an unsafe path: ${name}`);
    }
    const relative = parts.slice(stripComponents);
    if (relative.length === 0) continue;
    const target = resolve(root, ...relative);
    if (!target.startsWith(root + sep)) throw new CliError(`The archive has an unsafe path: ${name}`);

    if (type === '5') {
      mkdirSync(target, { recursive: true });
    } else if (type === '0' || type === '\0' || type === '7') {
      unpacked += size;
      if (unpacked > MAX_UNPACKED_BYTES) throw new CliError('The archive is too large once unpacked.');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
    }
    // Symlinks, hard links and devices are skipped on purpose.
  }
}

export type FetchLike = (url: string, init: { headers: Record<string, string>; redirect: 'follow' }) => Promise<Response>;

/** Downloads and unpacks into a temp folder, and always removes it afterwards. */
export async function withGithubSource<T>(source: GithubSource, consume: (folder: string) => T | Promise<T>, fetchImpl: FetchLike = fetch, token = process.env.GITHUB_TOKEN): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'AppLens-intake' };
  if (token) headers.Authorization = `Bearer ${token}`;

  // "/tree/a/b/c" can mean branch "a/b" and folder "c", so the shortest ref that exists wins.
  const segments = [...(source.ref ? [source.ref] : []), ...(source.path?.split('/') ?? [])];
  let response: Response | undefined;
  let path = source.path;
  for (let length = 1; length <= Math.max(1, Math.min(segments.length, MAX_REF_SEGMENTS)); length++) {
    const ref = segments.slice(0, length).map(encodeURIComponent).join('/');
    response = await fetchImpl(`https://api.github.com/repos/${source.owner}/${source.repo}/tarball${ref ? `/${ref}` : ''}`, { headers, redirect: 'follow' });
    path = segments.slice(length).join('/') || undefined;
    if (response.status !== 404) break;
  }
  if (!response || response.status === 404) throw new CliError(`${source.owner}/${source.repo} was not found. For a private repo, set GITHUB_TOKEN.`);
  if (!response.ok) throw new CliError(`GitHub responded with HTTP ${response.status}.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_ARCHIVE_BYTES) throw new CliError('The repository archive is too large.');
  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.length > MAX_ARCHIVE_BYTES) throw new CliError('The repository archive is too large.');

  let archive: Buffer;
  try {
    archive = gunzipSync(compressed, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch {
    throw new CliError('The repository archive could not be unpacked.');
  }

  const folder = mkdtempSync(join(tmpdir(), 'app-lens-github-'));
  try {
    extractTar(archive, folder);
    return await consume(path ? join(folder, path) : folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
