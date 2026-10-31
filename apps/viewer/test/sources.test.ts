// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManifest } from '@app-lens/ui';
import { resolveManifestUrl, sourceFromUrl } from '../src/sources';

describe('resolveManifestUrl', () => {
  it('lets the pinned manifest win over the URL parameter', () => {
    expect(resolveManifestUrl('https://evil.example/fake.json', 'manifest.json')).toBe('manifest.json');
  });

  it('uses the URL parameter when nothing is pinned', () => {
    expect(resolveManifestUrl('https://example.com/m.json', null)).toBe('https://example.com/m.json');
    expect(resolveManifestUrl(null, null)).toBeNull();
  });
});

describe('sourceFromUrl', () => {
  it('allows http(s) only', () => {
    expect(sourceFromUrl('javascript:alert(1)')).toBeNull();
    expect(sourceFromUrl('data:application/json,{}')).toBeNull();
    expect(sourceFromUrl('https://example.com/m.json')?.key).toBe('url:https://example.com/m.json');
  });
});

describe('fetchManifest', () => {
  afterEach(() => vi.unstubAllGlobals());

  const LARGE = 6 * 1024 * 1024;

  it('refuses a manifest that declares too many bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-length': String(LARGE) } })));
    await expect(fetchManifest('https://example.com/m.json')).rejects.toThrow(/too large/);
  });

  it('stops reading a stream that runs past the limit', async () => {
    let cancelled = false;
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
    await expect(fetchManifest('https://example.com/m.json')).rejects.toThrow(/too large/);
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(LARGE * 2);
  });

  it('still reads a normal manifest split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"app":{"name":"Čaj ☕"}}');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 18));
        controller.enqueue(bytes.slice(18));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
    await expect(fetchManifest('https://example.com/m.json')).resolves.toEqual({ app: { name: 'Čaj ☕' } });
  });
});
