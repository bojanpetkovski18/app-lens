import { parseManifest } from '@app-lens/core';
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiDraft, type DraftClient } from './ai';
import { CliError, isAllowedHost, serveStatic } from './commands';
import { attach } from './intake/attach';

const DEFAULT_PORT = 4318;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Writes need a matching Origin, which other sites cannot fake. Same-origin GETs carry no Origin,
 * and other sites cannot read a GET response without CORS, so a missing Origin is fine there.
 */
export function isTrustedApiRequest(request: Pick<IncomingMessage, 'headers' | 'method'>): boolean {
  const { host, origin } = request.headers;
  if (!isAllowedHost(host)) return false;
  if (!origin) return request.method === 'GET';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new CliError('The request is too large.'));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

export interface StudioApiOptions {
  /** The manifest being edited, if Studio was opened on a file. */
  file?: string;
  client?: DraftClient;
}

/** Writes beside the file and renames, so a crash or a full disk cannot leave a half-written manifest. */
function saveAtomically(file: string, text: string): void {
  const target = existsSync(file) ? realpathSync(file) : file;
  const temporary = `${target}.tmp`;
  try {
    writeFileSync(temporary, text, existsSync(target) ? { mode: statSync(target).mode } : undefined);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

const ROUTES = new Set(['GET /__app-lens/manifest', 'PUT /__app-lens/manifest', 'POST /__app-lens/attach', 'POST /__app-lens/draft']);

async function route(path: string, request: IncomingMessage, response: ServerResponse, options: StudioApiOptions): Promise<void> {
  const { file } = options;
  if (!ROUTES.has(`${request.method} ${path}`)) {
    send(response, 404, { error: 'Not found.' });
    return;
  }
  if (request.method === 'GET') {
    send(response, 200, { file: file ?? null, text: file && existsSync(file) ? readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : null });
    return;
  }
  if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) {
    send(response, 415, { error: 'Send JSON.' });
    return;
  }
  const parsed: unknown = JSON.parse(await readBody(request));
  if (typeof parsed !== 'object' || parsed === null) throw new CliError('Send a JSON object.');
  const body = parsed as { text?: unknown; source?: unknown; kind?: unknown };

  if (path === '/__app-lens/manifest') {
    if (!file) throw new CliError('Studio was opened without a file. Use Download instead.');
    if (typeof body.text !== 'string') throw new CliError('Nothing to save.');
    const result = parseManifest(JSON.parse(body.text));
    if (!result.ok) throw new CliError('Fix the validation problems before saving.');
    saveAtomically(file, body.text.endsWith('\n') ? body.text : `${body.text}\n`);
    send(response, 200, { saved: file });
  } else if (path === '/__app-lens/attach') {
    if (typeof body.source !== 'string' || existsSync(body.source)) throw new CliError('Enter a GitHub link or a website. Use the Folder tab for local projects.');
    const { manifest, report, thirdParty } = await attach(body.source, { dryRun: true });
    send(response, 200, { manifest, report, thirdParty });
  } else {
    if (typeof body.source !== 'string' || !body.source.trim()) throw new CliError('Paste a README or an OpenAPI spec first.');
    const kind = body.kind === 'openapi' ? 'OpenAPI spec' : 'README';
    send(response, 200, await aiDraft(body.source, kind, options.client));
  }
}

/** Returns true when the request belonged to the API. */
export function studioApi(options: StudioApiOptions) {
  return (request: IncomingMessage, response: ServerResponse): boolean => {
    const path = (request.url ?? '/').split('?')[0] as string;
    if (!path.startsWith('/__app-lens/')) return false;
    if (!isTrustedApiRequest(request)) {
      send(response, 403, { error: 'Forbidden.' });
      return true;
    }
    route(path, request, response, options).catch((error: unknown) => {
      const known = error instanceof CliError || error instanceof SyntaxError;
      send(response, known ? 422 : 500, { error: known ? (error as Error).message : 'Something went wrong.' });
      if (!known) console.error(error);
    });
    return true;
  };
}

export async function studio(file: string | undefined, options: { port?: string } = {}): Promise<Server> {
  const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CliError(`Invalid port "${options.port}".`);
  const assets = join(dirname(fileURLToPath(import.meta.url)), 'studio');
  if (!existsSync(assets)) throw new CliError('Studio is missing from this build.');
  const target = file ? resolve(file) : undefined;
  const server = await serveStatic(assets, port, undefined, studioApi({ file: target }));
  console.log(`AppLens Studio: http://127.0.0.1:${port}/${target ? `\nEditing ${target}` : ''}\n\nPress Ctrl+C to stop.`);
  return server;
}
