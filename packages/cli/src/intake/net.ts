import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { createGunzip } from 'node:zlib';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  // ::/96 and 2002::/16 carry an IPv4 address, which could be a private one.
  ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(network, prefix, 'ipv6');

/** True for loopback, private, link-local, metadata and other non-public addresses. */
export function isBlockedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  const ip = mapped ?? address.replace(/^\[|\]$/g, '');
  const family = isIP(ip);
  if (family === 0) return true;
  return blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

export class FetchBlockedError extends Error {}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  /** Tests inject these to reach a local server. */
  resolve?: (host: string) => Promise<string[]>;
  isBlocked?: (address: string) => boolean;
}

export interface SafeResponse {
  status: number;
  url: string;
  contentType: string;
  text: string;
}

const DEFAULTS = { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000, maxRedirects: 4, userAgent: 'AppLens-intake/1.0 (+https://github.com/bojanpetkovski18/app-lens)' };

async function resolveHost(host: string, options: SafeFetchOptions): Promise<string> {
  const plain = host.replace(/^\[|\]$/g, '');
  const addresses = isIP(plain) ? [plain] : options.resolve ? await options.resolve(plain) : (await dnsLookup(plain, { all: true })).map((item) => item.address);
  const check = options.isBlocked ?? isBlockedAddress;
  if (addresses.length === 0) throw new FetchBlockedError(`${host} did not resolve.`);
  // Every address must be public, or a record pair could slip a private one past the check.
  if (addresses.some(check)) throw new FetchBlockedError(`${host} resolves to a blocked address.`);
  return addresses[0] as string;
}

function readBody(response: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = /gzip/i.test(String(response.headers['content-encoding'] ?? '')) ? response.pipe(createGunzip()) : response;
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        resolve(Buffer.concat(chunks).toString('utf8'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
    response.on('error', reject);
  });
}

/** The socket timeout only notices silence, so a server sending one byte at a time needs a total limit too. */
const TOTAL_TIMEOUT_FACTOR = 3;

function once(url: URL, address: string, options: Required<Pick<SafeFetchOptions, 'timeoutMs' | 'maxBytes' | 'userAgent'>>): Promise<{ response: IncomingMessage; text: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const deadline = setTimeout(() => {
      rejectPromise(new Error(`Timed out fetching ${url.href}.`));
      request.destroy();
    }, options.timeoutMs * TOTAL_TIMEOUT_FACTOR);
    const resolve = (value: { response: IncomingMessage; text: string }) => {
      clearTimeout(deadline);
      resolvePromise(value);
    };
    const reject = (reason: unknown) => {
      clearTimeout(deadline);
      rejectPromise(reason);
    };
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'GET',
        // Connects to the address that was checked, so a second DNS answer cannot change the target.
        lookup: (_host, lookupOptions, callback) => {
          if (lookupOptions.all) callback(null, [{ address, family: isIP(address) }]);
          else callback(null, address, isIP(address));
        },
        headers: { 'User-Agent': options.userAgent, Accept: 'text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.8', 'Accept-Encoding': 'gzip' },
        timeout: options.timeoutMs,
      },
      (response) => {
        const isRedirect = (response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400;
        if (isRedirect) {
          response.resume();
          resolve({ response, text: '' });
        } else {
          readBody(response, options.maxBytes).then((text) => resolve({ response, text }), reject);
        }
      },
    );
    request.on('timeout', () => request.destroy(new Error(`Timed out fetching ${url.href}.`)));
    request.on('error', reject);
    request.end();
  });
}

/** Fetches a public http(s) URL. Each redirect target is checked again before it is contacted. */
export async function safeFetch(target: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const settings = { ...DEFAULTS, ...options };
  let url = new URL(target);
  for (let hop = 0; hop <= settings.maxRedirects; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchBlockedError(`Only http(s) URLs are allowed: ${url.href}`);
    if (url.username || url.password) throw new FetchBlockedError('URLs with credentials are not allowed.');
    const address = await resolveHost(url.hostname, options);
    const { response, text } = await once(url, address, settings);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (status >= 300 && status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return { status, url: url.href, contentType: String(response.headers['content-type'] ?? ''), text };
  }
  throw new FetchBlockedError(`Too many redirects from ${target}.`);
}
