import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const ROUTE = '/__app-lens/attach';
const MAX_BODY_BYTES = 4096;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const cli = join(dirname(fileURLToPath(import.meta.url)), '../../packages/cli/dist/cli.js');

/** Only the dev server's own page may call this: the checks stop other sites reaching it from a browser. */
export function isTrustedRequest(request: Pick<IncomingMessage, 'method' | 'headers'>): boolean {
  const { host, origin } = request.headers;
  if (request.method !== 'POST' || !LOOPBACK_HOST.test(host ?? '')) return false;
  if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) return false;
  try {
    return !!origin && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > MAX_BODY_BYTES) reject(new Error('Too large.'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isTrustedRequest(request)) return send(response, 403, { error: 'Forbidden.' });
  if (!existsSync(cli)) return send(response, 501, { error: 'Run "npm run build" first, or use "app-lens attach" in a terminal.' });
  let source: unknown;
  try {
    source = (JSON.parse(await readBody(request)) as { source?: unknown }).source;
  } catch {
    return send(response, 400, { error: 'Invalid request.' });
  }
  if (typeof source !== 'string' || !/^(https?:\/\/|[a-z0-9])/i.test(source)) return send(response, 400, { error: 'Enter a GitHub link or a website.' });
  // Local paths stay with the browser's folder picker, so only URLs and hosts are accepted here.
  if (existsSync(source)) return send(response, 400, { error: 'Use the Folder tab for local projects.' });

  // Arguments go straight to the process, with no shell in between.
  execFile(process.execPath, [cli, 'attach', source, '--dry-run', '--json'], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) return send(response, 422, { error: stderr.trim().replace(/^app-lens: /, '') || 'Could not attach that project.' });
    send(response, 200, JSON.parse(stdout));
  });
}

/** Dev-server only: `apply: 'serve'` keeps this out of every production build. */
export function attachEndpoint(): Plugin {
  return {
    name: 'app-lens-attach',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ROUTE, (request, response) => void handle(request, response));
    },
  };
}
