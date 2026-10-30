import { manifestJsonSchema, parseManifest } from '@app-lens/core';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeHtml, pinManifest, resolveStaticPath } from '../src/commands';
import { starterManifest } from '../src/template';

describe('starterManifest', () => {
  it.each(['My App', 'Ünïcode & Co', 'x'])('is valid for %s', (name) => {
    expect(parseManifest(starterManifest(name)).ok).toBe(true);
  });
});

describe('manifestJsonSchema', () => {
  it('is an object schema with the main sections', () => {
    const schema = manifestJsonSchema() as { type: string; properties: Record<string, unknown> };
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['app', 'entities', 'scenarios']));
  });
});

describe('pinManifest', () => {
  it('adds the meta tag and escapes the title', () => {
    const html = pinManifest('<head><title>AppLens</title></head>', '<script>alert(1)</script> $& Co');
    expect(html).toContain('<meta name="app-lens-manifest" content="manifest.json" />');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; $&amp; Co · AppLens');
    expect(html).not.toContain('<script>');
  });
});

describe('escapeHtml', () => {
  it('escapes all five characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('resolveStaticPath', () => {
  const root = resolve('/site');

  it('maps paths inside the root', () => {
    expect(resolveStaticPath(root, '/')).toBe(root);
    expect(resolveStaticPath(root, '/a/b.js?x=1')).toBe(`${root}${sep}a${sep}b.js`);
  });

  it.each([
    ['/../secret'],
    ['/a/../../secret'],
    ['/%2e%2e/secret'],
    ['/%2e%2e%2Fsecret'],
    ['/..%5Csecret'],
  ])('rejects traversal through %s', (path) => {
    expect(resolveStaticPath(root, path)).toBeNull();
  });

  it('rejects null bytes and invalid encodings', () => {
    expect(resolveStaticPath(root, '/a%00.js')).toBeNull();
    expect(resolveStaticPath(root, '/%E0%A4%A')).toBeNull();
  });
});
