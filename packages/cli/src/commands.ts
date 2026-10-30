import { manifestJsonSchema, parseManifest, type Manifest } from '@app-lens/core';
import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { starterManifest } from './template';

export class CliError extends Error {}

const SITE_MARKER = '.app-lens-site';
const DEFAULT_OUT = 'app-lens-site';
const DEFAULT_PORT = 4317;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Inline styles are needed for runtime theming. Scripts only ever come from the site itself.
const CONTENT_SECURITY_POLICY = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'";

interface Options {
  out?: string;
  force?: boolean;
  name?: string;
  port?: string;
  watch?: boolean;
}

export function parseCliArgs(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        force: { type: 'boolean', short: 'f' },
        name: { type: 'string' },
        port: { type: 'string', short: 'p' },
        watch: { type: 'boolean', short: 'w' },
        report: { type: 'string' },
        'min-score': { type: 'string' },
        'max-files': { type: 'string' },
        'max-pages': { type: 'string' },
        'dry-run': { type: 'boolean' },
        own: { type: 'boolean' },
        'third-party': { type: 'boolean' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new CliError(`${(error as Error).message} Run "app-lens --help".`);
  }
}

function assetRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function readManifestFile(file: string): unknown {
  if (!existsSync(file)) throw new CliError(`File not found: ${file}`);
  if (statSync(file).isDirectory()) throw new CliError(`${file} is a folder. Pass a manifest file.`);
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`${file} is not valid JSON: ${(error as Error).message}`);
  }
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function init(file = 'app-lens.json', options: Options = {}): void {
  if (existsSync(file) && !options.force) throw new CliError(`${file} already exists. Use --force to overwrite it.`);
  const manifest = starterManifest(options.name ?? 'My App');
  const result = parseManifest(manifest);
  if (!result.ok) throw new Error(`Starter manifest is invalid: ${JSON.stringify(result.issues)}`);
  mkdirSync(dirname(file), { recursive: true });
  writeJson(file, manifest);
  writeJson(join(dirname(file), 'app-lens.schema.json'), manifestJsonSchema());
  console.log(`Created ${file} and app-lens.schema.json.\n\nNext steps:\n  app-lens validate ${file}\n  app-lens preview ${file}`);
}

export function validate(file: string): boolean {
  const result = parseManifest(readManifestFile(file));
  if (!result.ok) {
    console.error(`ERROR ${file} has ${result.issues.length} problem(s):`);
    for (const issue of result.issues) console.error(`  - ${issue.path}: ${issue.message}`);
    return false;
  }
  const { features, personas, entities, scenarios } = result.manifest;
  console.log(
    `OK ${file} is valid: ${features.length} features, ${personas.length} personas, ` +
      `${Object.keys(entities).length} data types, ${scenarios.length} walkthroughs.`,
  );
  return true;
}

export function schema(options: Options = {}): void {
  if (options.out) {
    writeJson(options.out, manifestJsonSchema());
    console.log(`Wrote ${options.out}`);
  } else {
    console.log(JSON.stringify(manifestJsonSchema(), null, 2));
  }
}

export function escapeHtml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (char) => entities[char] as string);
}

/** Uses a function replacer so "$&" in a name stays literal. */
export function pinManifest(html: string, appName: string): string {
  const head = [
    `<title>${escapeHtml(appName)} · AppLens</title>`,
    `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
    '<meta name="app-lens-manifest" content="manifest.json" />',
  ].join('\n    ');
  return html.replace(/<title>[\s\S]*?<\/title>/, () => head);
}

function prepareOutDir(out: string, force: boolean | undefined): void {
  if (!existsSync(out)) {
    mkdirSync(out, { recursive: true });
    return;
  }
  if (!statSync(out).isDirectory()) throw new CliError(`${out} exists and is not a folder.`);
  const files = readdirSync(out);
  if (files.length > 0 && !files.includes(SITE_MARKER) && !force) {
    throw new CliError(`${out} is not empty and was not created by AppLens. Use --force to write into it anyway.`);
  }
}

function buildSite(file: string, out: string, force: boolean | undefined): Manifest {
  const manifest = readManifestFile(file);
  const result = parseManifest(manifest);
  if (!result.ok) {
    const details = result.issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n');
    throw new CliError(`${file} has ${result.issues.length} problem(s):\n${details}`);
  }
  if (result.manifest.draft?.thirdParty) {
    throw new CliError(`${file} is a draft of a third-party project (${result.manifest.draft.source}), so it cannot be built.`);
  }
  prepareOutDir(out, force);
  const assets = assetRoot();
  cpSync(join(assets, 'viewer'), out, { recursive: true });
  const index = join(out, 'index.html');
  writeFileSync(index, pinManifest(readFileSync(index, 'utf8'), result.manifest.app.name));
  writeJson(join(out, 'manifest.json'), manifest);
  cpSync(join(assets, 'embed/app-lens.js'), join(out, 'app-lens.js'));
  writeFileSync(join(out, SITE_MARKER), 'Generated by AppLens.\n');
  return result.manifest;
}

export function build(file: string, options: Options = {}): void {
  const out = options.out ?? DEFAULT_OUT;
  const manifest = buildSite(file, out, options.force);
  console.log(`Built the ${manifest.app.name} showcase in ${out}:`);
  console.log('  index.html     standalone site (add ?embed=1 for iframes)');
  console.log('  manifest.json  your manifest');
  console.log('  app-lens.js    <app-lens> web component');
}

export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = resolve(root);
  const candidate = resolve(base, `.${decoded.replace(/\\/g, '/')}`);
  return candidate === base || candidate.startsWith(base + sep) ? candidate : null;
}

/** A page on another site can point its own DNS name at 127.0.0.1, so the Host header is checked. */
export function isAllowedHost(host: string | undefined): boolean {
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host ?? '');
}

const LIVE_PATH = '/__app-lens/live';
const LIVE_SCRIPT_PATH = '/__app-lens/live.js';
const LIVE_SCRIPT = `new EventSource('${LIVE_PATH}').onmessage = () => location.reload();`;

export interface LiveReload {
  reload: () => void;
}

/** Serves a folder. With `live`, pages reload when the returned handle's `reload` is called. */
export function serveStatic(root: string, port: number, live?: (handle: LiveReload) => void): Promise<Server> {
  const clients = new Set<ServerResponse>();
  live?.({ reload: () => clients.forEach((client) => client.write('data: reload\n\n')) });

  const server = createServer((request, response) => {
    if (!isAllowedHost(request.headers.host)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }
    const path = (request.url ?? '/').split('?')[0];
    if (live && path === LIVE_PATH) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      response.write(': connected\n\n');
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }
    if (live && path === LIVE_SCRIPT_PATH) {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(LIVE_SCRIPT);
      return;
    }
    let file = resolveStaticPath(root, request.url ?? '/');
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file || !existsSync(file)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (live && file.endsWith('index.html')) {
      response.end(readFileSync(file, 'utf8').replace('</head>', () => `<script src="${LIVE_SCRIPT_PATH}"></script></head>`));
      return;
    }
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response);
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'EADDRINUSE' ? new CliError(`Port ${port} is already in use. Pick another with --port.`) : error);
    });
    server.listen(port, '127.0.0.1', () => resolvePromise(server));
  });
}

const WATCH_DEBOUNCE_MS = 120;

/** Editors often replace a file instead of writing it, so the folder is watched, not the file. */
function watchManifest(file: string, root: string, onBuilt: () => void): void {
  const name = basename(file);
  let timer: NodeJS.Timeout | undefined;
  watch(dirname(resolve(file)), (_event, changed) => {
    if (changed !== name) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        buildSite(file, root, true);
        console.log(`Rebuilt ${name}`);
        onBuilt();
      } catch (error) {
        // A half-typed manifest is normal while editing, so the server keeps running.
        console.error(`app-lens: ${(error as Error).message}`);
      }
    }, WATCH_DEBOUNCE_MS);
  });
}

export async function preview(target: string, options: Options = {}): Promise<void> {
  const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CliError(`Invalid port "${options.port}".`);
  if (!existsSync(target)) throw new CliError(`Not found: ${target}`);

  let root = target;
  if (!statSync(target).isDirectory()) {
    const key = createHash('sha1').update(resolve(target)).digest('hex').slice(0, 10);
    root = join(tmpdir(), `app-lens-preview-${key}`);
    buildSite(target, root, true);
  }
  if (!existsSync(join(root, 'index.html'))) throw new CliError(`${root} has no index.html.`);

  const isFile = root !== target;
  if (options.watch && !isFile) throw new CliError('--watch needs a manifest file, not a folder.');
  let live: LiveReload | undefined;
  await serveStatic(root, port, options.watch ? (handle) => { live = handle; } : undefined);
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Previewing ${basename(resolve(target))}:\n  ${url}\n  ${url}?embed=1&theme=dark   (iframe mode)\n\nPress Ctrl+C to stop.`);
  if (options.watch) watchManifest(target, root, () => live?.reload());
}
