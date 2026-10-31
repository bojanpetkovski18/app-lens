import { describe, expect, it } from 'vitest';
import {
  buildDemo,
  diffManifests,
  draftManifest,
  emptySignals,
  generateDataset,
  importOpenApi,
  importPrisma,
  importReadme,
  kindForName,
  lintManifest,
  parseManifest,
  renderMarkdown,
  renderPdf,
  signalsFromFiles,
  signalsFromPages,
  toFieldName,
  type Manifest,
  type ManifestInput,
  type ProjectSignals,
} from '../src';

function parse(input: ManifestInput): Manifest {
  const result = parseManifest(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.manifest;
}

const evidence = [{ source: 'test' }];
const signals = (extra: Partial<ProjectSignals>): ProjectSignals => ({ ...emptySignals(), ...extra });
const entity = (name: string, fields: Record<string, string>) => ({ name, fields, evidence, confidence: 'high' as const });

describe('intake survives what real projects contain', () => {
  it('does not hang on a schema that lists itself many times in allOf', () => {
    const started = performance.now();
    importOpenApi({ openapi: '3.0.0', components: { schemas: { Loop: { allOf: Array.from({ length: 200 }, () => ({ $ref: '#/components/schemas/Loop' })) } } } });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('keeps inherited properties from allOf', () => {
    const result = importOpenApi({
      openapi: '3.0.0',
      components: { schemas: { Base: { properties: { name: { type: 'string' } } }, Child: { allOf: [{ $ref: '#/components/schemas/Base' }, { $ref: '#/components/schemas/Base' }], properties: { age: { type: 'integer' } } } } },
    });
    expect(Object.keys(result.entities.find((item) => item.name === 'Child')?.fields ?? {}).sort()).toEqual(['age', 'name']);
  });

  it('shortens an enum too long for one field instead of failing the draft', () => {
    const options = Array.from({ length: 120 }, (_, index) => `country_option_${index}`).join(',');
    const { manifest } = draftManifest(signals({ entities: [entity('Address', { country: `enum:${options}` })] }));
    const spec = manifest.entities?.Address?.fields.country ?? '';
    expect(spec.length).toBeLessThanOrEqual(300);
    expect(spec).toMatch(/^enum:country_option_0,/);
  });

  it('accepts a long entity name with a status field', () => {
    const name = 'AuthenticationProviderConfigurationResponseModelVersionTwo';
    const { manifest } = draftManifest(signals({ entities: [entity(name, { status: 'enum:draft,live' })] }));
    expect(manifest.scenarios?.[0]?.title.length).toBeLessThanOrEqual(80);
  });

  it('keeps scenario ids unique when long names share a start', () => {
    const base = 'A'.repeat(55);
    const { manifest } = draftManifest(signals({ entities: [entity(`${base}One`, { status: 'enum:a,b' }), entity(`${base}Two`, { status: 'enum:a,b' })] }));
    expect(new Set(manifest.scenarios?.map((scenario) => scenario.id)).size).toBe(2);
  });

  it('drops a website that is not a real URL', () => {
    const { manifest } = draftManifest(signals({ appName: 'A', website: 'https://' }));
    expect(manifest.app.website).toBeUndefined();
  });

  it('clips a very long source in the attribution and draft marker', () => {
    const url = `https://example.com/${'a'.repeat(700)}`;
    const { manifest } = draftManifest(signals({ appName: 'A' }), { attribution: { text: `Based on ${url}`, url }, thirdParty: { source: url } });
    expect(manifest.attribution?.text.length).toBeLessThanOrEqual(500);
    expect(manifest.draft?.source.length).toBeLessThanOrEqual(500);
  });

  it('ignores an input type that matches a built-in object key', () => {
    const form = { path: 'src/Thing.tsx', text: '<input name="first" type="constructor" /><input name="second" type="constructor" />' };
    expect(() => draftManifest(signalsFromFiles([form]))).not.toThrow();
    const page = { url: 'https://example.com/', navLinks: [], forms: [{ fields: [{ name: 'one', type: 'constructor' }, { name: 'two', type: 'constructor' }] }] };
    expect(() => draftManifest(signalsFromPages([page]))).not.toThrow();
  });

  it('keeps ids valid with over a hundred duplicates', () => {
    const title = 'x'.repeat(60);
    const features = Array.from({ length: 100 }, () => ({ title, evidence, confidence: 'low' as const }));
    expect(draftManifest(signals({ features })).manifest.features).toHaveLength(100);
  });

  it('keeps fields named like built-in object keys', () => {
    const { manifest } = draftManifest(signals({ entities: [entity('Thing', { constructor: 'word', toString: 'word' })] }));
    expect(Object.keys(manifest.entities?.Thing?.fields ?? {}).sort()).toEqual(['constructor', 'toString']);
  });

  it('reads an OpenAPI version written as a number', () => {
    expect(importOpenApi({ openapi: '3.0.0', info: { title: 'A', version: 2 } }).version).toBe('2');
  });

  it('reads Prisma fields after a default that contains a brace', () => {
    const result = importPrisma('model Item {\n  id Int @id\n  meta Json @default("{}")\n  title String\n}\n');
    expect(result.entities[0]?.fields).toHaveProperty('title');
  });

  it('leaves underscores and comparisons in README text alone', () => {
    const result = importReadme('# App\n\nUse my_cool_tool when a < b and c > d.\n');
    expect(result.description).toBe('Use my_cool_tool when a < b and c > d.');
  });

  it('still strips README emphasis and tags', () => {
    expect(importReadme('# App\n\nSome **bold**, _italic_ and <b>tagged</b> text.\n').description).toBe('Some bold, italic and tagged text.');
  });

  it('guesses field kinds from whole words', () => {
    expect(kindForName('update', 'words')).toBe('words');
    expect(kindForName('candidate', 'words')).toBe('words');
    expect(kindForName('startDate', 'words')).toBe('date');
    expect(kindForName('jobTitle', 'words')).toBe('jobTitle');
    expect(kindForName('title', 'words')).toBe('title');
    expect(kindForName('votes', 'int')).toBe('int');
    expect(kindForName('notes', 'words')).toBe('sentence');
    expect(kindForName('biometric', 'words')).toBe('words');
    expect(kindForName('bio', 'words')).toBe('sentence');
    expect(kindForName('automobile', 'words')).toBe('words');
    expect(kindForName('mobile', 'words')).toBe('phone');
    expect(kindForName('costume', 'words')).toBe('words');
    expect(kindForName('unitCost', 'words')).toBe('money');
    expect(kindForName('totalCount', 'int')).toBe('int');
  });

  it('types form fields by their most specific name', () => {
    const form = { path: 'src/Signup.tsx', text: '<input name="companyName" /><input name="fileName" /><input name="name" />' };
    const [found] = signalsFromFiles([form]).entities;
    expect(found?.fields).toEqual({ companyName: 'company', fileName: 'words', name: 'fullName' });
    expect(toFieldName('companyName')).toBe('companyName');
  });

  it('names routes from pages, not from route groups or shared code', () => {
    const paths = ['app/(marketing)/page.tsx', 'app/(shop)/orders/page.tsx', 'app/components/Button.tsx', 'src/app/lib/format.ts', 'src/pages/authors.tsx'];
    const titles = signalsFromFiles(paths.map((path) => ({ path, text: '' }))).features.map((feature) => feature.title);
    expect(titles.sort()).toEqual(['Authors', 'Orders']);
  });

  it('takes personas from a role enum and not from its comments', () => {
    const text = 'enum Role {\n  // can see everything here\n  ADMIN\n  USER // regular\n}\n';
    const labels = signalsFromFiles([{ path: 'prisma/schema.prisma', text }]).personas.map((persona) => persona.label);
    expect(labels).toEqual(['Admin', 'User']);
  });
});

describe('exports', () => {
  const manifest = parse({
    app: { name: 'A', description: 'First line\n# Not a heading', website: `https://example.com/${'a'.repeat(300)}` },
    features: [{ id: 'one', title: 'One', description: 'Line one\n- not a bullet' }],
  });

  it('keeps Markdown from a manifest in its own block', () => {
    const markdown = renderMarkdown(manifest);
    expect(markdown).not.toMatch(/^# Not a heading/m);
    expect(markdown).not.toMatch(/^- not a bullet/m);
  });

  it('breaks a word too long for the PDF page', () => {
    const body = String.fromCharCode(...renderPdf(manifest));
    const lines = [...body.matchAll(/\((.*?)\) Tj/g)].map((match) => match[1] ?? '');
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(110);
    expect(lines.filter((line) => line.includes('aaaa')).length).toBeGreaterThan(1);
  });
});

describe('demo wording', () => {
  const manifest = parse({
    app: { name: 'A' },
    personas: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }],
    entities: { Item: { count: 1, fields: { name: 'word' } } },
    features: [{ id: 'f', title: 'F', personas: ['one'] }],
    scenarios: [{ id: 'mine', title: 'Mine', persona: 'one', entity: 'Item', steps: [{ action: 'note', narration: 'Hello' }] }, { id: 'yours', title: 'Yours', persona: 'two', entity: 'Item', steps: [{ action: 'note', narration: 'Hello' }] }],
  });

  it('uses singular words for one item', () => {
    const outro = buildDemo(manifest, generateDataset(manifest), { persona: 'one' }).scenes.at(-1);
    expect(outro?.caption).toBe('1 feature, 1 type of data and 1 guided workflow. Explore the rest at your own pace.');
  });

  it('counts only the workflows the chosen persona sees', () => {
    const outro = buildDemo(manifest, generateDataset(manifest), { persona: 'one' }).scenes.at(-1);
    expect(outro?.kind === 'outro' ? outro.stats.find((stat) => stat.label === 'Workflows')?.value : null).toBe(1);
  });
});

describe('validation and comparison', () => {
  it('rejects text that only looks like a date to a lenient parser', () => {
    const result = parseManifest({
      app: { name: 'A' },
      entities: { Item: { fields: { due: 'date' } } },
      scenarios: [{ id: 's', title: 'S', entity: 'Item', steps: [{ action: 'create', narration: 'N', values: { due: 'banana 1' } }] }],
    });
    expect(result.ok).toBe(false);
  });

  it('still accepts ISO dates and tokens', () => {
    const result = parseManifest({
      app: { name: 'A' },
      entities: { Item: { fields: { due: 'date', at: 'datetime' } } },
      scenarios: [{ id: 's', title: 'S', entity: 'Item', steps: [{ action: 'create', narration: 'N', values: { due: '2026-01-31', at: '2026-01-31T10:00:00Z' } }, { action: 'create', narration: 'N', values: { due: '$today', at: '$now' } }] }],
    });
    expect(result.ok).toBe(true);
  });

  it('reports changes outside the listed sections', () => {
    const before = parse({ app: { name: 'A' } });
    const after = parse({ app: { name: 'A' }, attribution: { text: 'Credit' }, mock: { seed: 'other' } });
    expect(diffManifests(before, after).map((change) => change.name).sort()).toEqual(['attribution', 'sample data']);
  });

  it('lints a large manifest without generating data it does not need', () => {
    const fields = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`field${index}`, 'paragraph']));
    const entities = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`Entity${index}`, { count: 500, fields }]));
    const manifest = parse({ app: { name: 'A' }, entities });
    const started = performance.now();
    lintManifest(manifest);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
