// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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
