import { describe, expect, it } from 'vitest';
import {
  buildDemo,
  diffManifests,
  draftManifest,
  emptySignals,
  entityDiagram,
  generateDataset,
  importOpenApi,
  importPrisma,
  importReadme,
  kindForName,
  lintManifest,
  mergeSignals,
  parseManifest,
  recordsToCsv,
  renderMarkdown,
  renderPdf,
  runScenario,
  toEntityName,
  toFieldName,
  toId,
  type Manifest,
} from '../src';

function parse(input: unknown): Manifest {
  const result = parseManifest(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.manifest;
}

const openapi = {
  openapi: '3.0.3',
  info: { title: 'Pet Store', version: '1.2.0', description: 'Sell pets online.' },
  tags: [{ name: 'orders', description: 'Everything about orders' }],
  paths: {
    '/orders': {
      get: { tags: ['orders'], summary: 'List orders', responses: { 200: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } } } } } } },
      post: { tags: ['orders'], summary: 'Place an order', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
    },
    '/pets/{id}': { get: { summary: 'Get a pet', responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } },
  },
  components: {
    schemas: {
      Base: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, createdAt: { type: 'string', format: 'date-time' } } },
      Pet: {
        allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' }, status: { type: 'string', enum: ['available', 'pending', 'sold'] } } }],
      },
      Order: {
        type: 'object',
        properties: {
          pet: { $ref: '#/components/schemas/Pet' },
          ownerEmail: { type: 'string', format: 'email' },
          quantity: { type: 'integer' },
          shipped: { type: 'boolean' },
          secret: { type: 'string', format: 'password' },
          status: { type: 'string', enum: ['new', 'paid', 'shipped'] },
        },
      },
    },
  },
};

describe('importOpenApi', () => {
  it('maps schemas, formats and $ref', () => {
    const signals = importOpenApi(openapi);
    const order = signals.entities.find((entity) => entity.name === 'Order');
    expect(order?.fields).toMatchObject({ pet: 'ref:Pet', ownerEmail: 'email', quantity: 'int:0..1000', shipped: 'bool', status: 'enum:new,paid,shipped' });
    expect(order?.fields.secret).toBeUndefined();
    expect(signals.entities.find((entity) => entity.name === 'Pet')?.fields).toMatchObject({ createdAt: 'datetime', name: 'fullName', price: 'money' });
  });

  it('maps tags and operations to features with evidence', () => {
    const signals = importOpenApi(openapi);
    const feature = signals.features.find((item) => item.title === 'Orders');
    expect(feature).toMatchObject({ description: 'Everything about orders', highlights: ['List orders', 'Place an order'], entities: ['Order'] });
    expect(feature?.evidence.map((item) => item.detail)).toContain('POST /orders');
  });

  it('never follows remote references', () => {
    const signals = importOpenApi({ openapi: '3.0.0', components: { schemas: { A: { type: 'object', properties: { b: { $ref: 'https://evil.example/x.json#/B' } } } } } });
    expect(signals.entities).toEqual([]);
  });

  it('rejects other documents and survives self-referencing allOf', () => {
    expect(() => importOpenApi({ hello: 'world' })).toThrow('OpenAPI');
    const loop = { openapi: '3.0.0', components: { schemas: { A: { allOf: [{ $ref: '#/components/schemas/A' }], properties: { x: { type: 'string' } } } } } };
    expect(importOpenApi(loop).entities).toHaveLength(1);
  });

  it('reads Swagger 2 definitions', () => {
    const signals = importOpenApi({ swagger: '2.0', definitions: { User: { properties: { email: { type: 'string' } } } } });
    expect(signals.entities[0]?.fields.email).toBe('email');
  });
});

const prisma = `
generator client { provider = "prisma-client-js" }
// A comment with model Fake { x Int }
enum Role { ADMIN
  MEMBER }
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  role      Role     @default(MEMBER)
  posts     Post[]
  createdAt DateTime @default(now())
}
model Post {
  id        Int     @id
  title     String
  price     Decimal
  published Boolean
  author    User    @relation(fields: [authorId], references: [id])
  authorId  Int
  @@index([authorId])
}
`;

describe('importPrisma', () => {
  it('maps models, enums and relations', () => {
    const signals = importPrisma(prisma);
    expect(signals.entities.map((entity) => entity.name)).toEqual(['User', 'Post']);
    expect(signals.entities[0]?.fields).toEqual({ email: 'email', name: 'fullName', role: 'enum:ADMIN,MEMBER', createdAt: 'datetime' });
    expect(signals.entities[1]?.fields).toEqual({ title: 'title', price: 'money', published: 'bool', author: 'ref:User' });
  });

  it('notes an empty schema', () => {
    expect(importPrisma('datasource db { provider = "x" }').notes).toEqual(['schema.prisma: no models found.']);
  });
});

const readme = `# Cool App

[![Build](https://x/b.svg)](https://x)

Cool App makes **things** easier.

## Features

- **Fast search**: Find anything instantly.
- Offline mode - Works without a network.
- Plain bullet

## Installation

- npm install

## Integrations

- Slack
- GitHub

## License

MIT
`;

describe('importReadme', () => {
  it('takes the name, description, bullets and integrations', () => {
    const signals = importReadme(readme);
    expect(signals.appName).toBe('Cool App');
    expect(signals.description).toBe('Cool App makes things easier.');
    expect(signals.features.map((feature) => feature.title)).toEqual(['Fast search', 'Offline mode', 'Plain bullet']);
    expect(signals.features[1]?.description).toBe('Works without a network.');
    expect(signals.integrations).toEqual(['Slack', 'GitHub']);
  });

  it('uses feature sub-headings with their bullets', () => {
    const signals = importReadme('# A\n\n## Features\n\n### Boards\n\nDrag cards.\n\n- Columns\n- Filters\n');
    expect(signals.features).toMatchObject([{ title: 'Boards', description: 'Drag cards.', highlights: ['Columns', 'Filters'] }]);
  });

  it('falls back to section headings and skips boilerplate', () => {
    const signals = importReadme('# A\n\n## Reporting\n\n## Installation\n\n## License\n');
    expect(signals.features.map((feature) => feature.title)).toEqual(['Reporting']);
    expect(signals.features[0]?.confidence).toBe('low');
  });

  it('ignores code fences', () => {
    expect(importReadme('# A\n\n## Features\n\n```\n- not a feature\n```\n').features).toEqual([]);
  });
});

describe('draftManifest', () => {
  it('produces a valid manifest from every importer', () => {
    for (const signals of [importOpenApi(openapi), importPrisma(prisma), importReadme(readme)]) {
      const { manifest } = draftManifest(signals, { fallbackName: 'Fallback' });
      expect(parseManifest(manifest).ok).toBe(true);
    }
  });

  it('reports evidence for every item', () => {
    const { report } = draftManifest(importOpenApi(openapi));
    expect(report.items.length).toBeGreaterThan(3);
    for (const item of report.items) expect(item.evidence.length).toBeGreaterThan(0);
  });

  it('generates a lifecycle walkthrough from a status enum', () => {
    const { manifest } = draftManifest(importOpenApi(openapi));
    const parsed = parse(manifest);
    const scenario = parsed.scenarios.find((item) => item.entity === 'Order');
    expect(scenario?.steps.map((step) => step.action)).toEqual(['create', 'update', 'update']);
    expect(runScenario(parsed, generateDataset(parsed), scenario!).at(-1)?.subject?.status).toBe('shipped');
  });

  it('breaks reference cycles and reports them', () => {
    const signals = emptySignals();
    const evidence = [{ source: 'x' }];
    signals.entities.push(
      { name: 'A', fields: { b: 'ref:B' }, evidence, confidence: 'high' },
      { name: 'B', fields: { c: 'ref:C' }, evidence, confidence: 'high' },
      { name: 'C', fields: { a: 'ref:A' }, evidence, confidence: 'high' },
    );
    const { manifest, report } = draftManifest(signals);
    expect(parseManifest(manifest).ok).toBe(true);
    expect(report.notes.join()).toContain('referenced each other');
  });

  it('cleans awkward names and handles collisions', () => {
    const signals = emptySignals();
    const evidence = [{ source: 'x' }];
    signals.entities.push(
      { name: 'order-item', fields: { id: 'word', 'Unit Price': 'money', '123': 'word', bad: 'nope:1', link: 'ref:Missing' }, evidence, confidence: 'high' },
      { name: 'OrderItem', fields: {}, evidence, confidence: 'high' },
      { name: '!!!', fields: { a: 'word' }, evidence, confidence: 'low' },
    );
    signals.features.push({ title: 'Same', evidence, confidence: 'low' }, { title: 'same', evidence, confidence: 'low' });
    const { manifest, report } = draftManifest(signals);
    const parsed = parse(manifest);
    expect(Object.keys(parsed.entities)).toEqual(['OrderItem', 'OrderItem2']);
    expect(parsed.entities.OrderItem?.fields).toMatchObject({ orderItemId: 'word', unitPrice: 'money', bad: 'word', link: 'codename' });
    expect(parsed.entities.OrderItem2?.fields).toEqual({ name: 'title' });
    expect(parsed.features.map((feature) => feature.id)).toEqual(['same', 'same2']);
    expect(report.notes.join()).toContain('"!!!"');
  });

  it('clips long text and limits counts', () => {
    const signals = emptySignals();
    signals.appName = 'x'.repeat(500);
    signals.entities = Array.from({ length: 40 }, (_, i) => ({ name: `Entity${i}`, fields: Object.fromEntries(Array.from({ length: 60 }, (__, j) => [`f${j}`, 'word'])), evidence: [{ source: 'x' }], confidence: 'high' as const }));
    signals.features = Array.from({ length: 150 }, (_, i) => ({ title: `Feature ${i}`, evidence: [{ source: 'x' }], confidence: 'low' as const }));
    const parsed = parse(draftManifest(signals).manifest);
    expect(Object.keys(parsed.entities)).toHaveLength(30);
    expect(parsed.features).toHaveLength(100);
    expect(parsed.app.name.length).toBeLessThanOrEqual(80);
  });

  it('marks third-party drafts', () => {
    const parsed = parse(draftManifest(importReadme(readme), { thirdParty: { source: 'https://example.com' }, attribution: { text: 'Not affiliated.' } }).manifest);
    expect(parsed.draft).toEqual({ thirdParty: true, source: 'https://example.com' });
    expect(parsed.attribution?.text).toBe('Not affiliated.');
  });

  it('merges signals, with earlier sources winning', () => {
    const merged = mergeSignals({ ...emptySignals(), appName: 'First' }, importPrisma(prisma), { ...importPrisma(prisma), appName: 'Second' });
    expect(merged.appName).toBe('First');
    expect(merged.entities).toHaveLength(2);
    expect(merged.entities[0]?.evidence).toHaveLength(2);
  });

  it('keeps name heuristics from matching inside longer words', () => {
    expect(kindForName('feedback', 'words')).toBe('words');
    expect(kindForName('endpoint', 'words')).toBe('words');
    expect(kindForName('generate', 'words')).toBe('words');
    expect(kindForName('shippingFee', 'words')).toBe('money');
    expect(kindForName('endDate', 'words')).toBe('date');
  });

  it('builds safe names', () => {
    expect(toEntityName('order item')).toBe('OrderItem');
    expect(toEntityName('123 go')).toBe('Go');
    expect(toFieldName('Unit Price')).toBe('unitPrice');
    expect(toFieldName('__proto__')).toBe('proto');
    expect(toId('Hello, World!')).toBe('hello-world');
  });
});

const showcase = () => parse({
  app: { name: 'Lint Me', tagline: 'T', description: 'D', theme: { primary: '#0f766e' } },
  personas: [{ id: 'a', label: 'Used' }, { id: 'b', label: 'Unused' }],
  entities: { Thing: { count: 2, fields: { status: 'enum:open', other: 'ref:Lone' } }, Lone: { count: 1, fields: { a: 'word' } }, Orphan: { count: 1, fields: { a: 'word' } } },
  features: [{ id: 'f', title: 'Café “quoted” — dash', description: 'Desc', personas: ['a'], entities: ['Thing'], highlights: ['H'] }],
  scenarios: [{ id: 's', title: 'Tour', entity: 'Thing', steps: [
    { action: 'select', narration: 'Nothing here', where: { other: 'nobody' } },
    { action: 'update', narration: 'Too late', set: { status: 'open' } },
  ] }],
  mock: { baseDate: '2025-01-15' },
});

describe('lintManifest', () => {
  it('finds unused personas, orphans and dead walkthrough steps', () => {
    const { findings, score } = lintManifest(showcase());
    const messages = findings.map((finding) => finding.message).join('\n');
    expect(messages).toContain('Persona "Unused" is not linked');
    expect(messages).toContain('Orphan is not used');
    expect(messages).toContain('selects nothing');
    expect(messages).toContain('no record to update');
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('scores a complete manifest highly', () => {
    const manifest = parse({
      app: { name: 'A', tagline: 'T', description: 'D' },
      personas: [{ id: 'a', label: 'A' }],
      entities: { T: { fields: { name: 'title' } } },
      features: [{ id: 'f', title: 'F', description: 'D', personas: ['a'], entities: ['T'], highlights: ['H'] }],
      scenarios: [{ id: 's', title: 'S', entity: 'T', steps: [{ action: 'create', narration: 'n' }] }],
      mock: { baseDate: '2025-01-15' },
    });
    expect(lintManifest(manifest)).toEqual({ score: 100, findings: [] });
  });
});

describe('diffManifests', () => {
  it('lists added, removed and changed items', () => {
    const before = showcase();
    const after = parse({ ...structuredClone(before), app: { ...before.app, tagline: 'New' }, personas: [before.personas[0], { id: 'c', label: 'New' }], draft: undefined });
    expect(diffManifests(before, after)).toEqual(expect.arrayContaining([
      { section: 'app', type: 'changed', name: 'Lint Me' },
      { section: 'personas', type: 'added', name: 'c' },
      { section: 'personas', type: 'removed', name: 'b' },
    ]));
    expect(diffManifests(before, before)).toEqual([]);
  });
});

describe('export', () => {
  it('renders Markdown with a data model diagram and escapes text', () => {
    const manifest = parse({ app: { name: 'A <b> *x*', tagline: 'Tag' }, entities: { Order: { fields: { c: 'ref:Customer' } }, Customer: { fields: { a: 'word' } } } });
    const markdown = renderMarkdown(manifest);
    expect(markdown).toContain('# A \\<b\\> \\*x\\*');
    expect(markdown).toContain('*Tag*');
    expect(markdown).toContain('Customer ||--o{ Order : c');
    expect(entityDiagram(parse({ app: { name: 'A' } }))).toBeNull();
  });

  it('writes a well-formed PDF', () => {
    const pdf = new TextDecoder('latin1').decode(renderPdf(showcase()));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('(Lint Me)');
    expect(pdf).toContain('Cafe "quoted" - dash');
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    for (const [, offset] of pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n/gm)) {
      expect(pdf.slice(Number(offset)).match(/^\d+ 0 obj/)).not.toBeNull();
    }
  });

  it('escapes PDF syntax and paginates long content', () => {
    const manifest = parse({
      app: { name: 'Parens (and) back\\slash' },
      features: Array.from({ length: 100 }, (_, i) => ({ id: `f${i}`, title: `Feature ${i}`, description: 'A rather long description that takes up room. '.repeat(4) })),
    });
    const pdf = new TextDecoder('latin1').decode(renderPdf(manifest));
    expect(pdf).toContain('Parens \\(and\\) back\\\\slash');
    expect(Number(/\/Count (\d+)/.exec(pdf)?.[1])).toBeGreaterThan(3);
  });
});

describe('recordsToCsv', () => {
  it('quotes and neutralises formulas', () => {
    const csv = recordsToCsv([{ id: 'a', note: 'x, "y"', formula: '=HYPERLINK("http://evil")', negative: -5, empty: null }]);
    expect(csv).toBe(`id,note,formula,negative,empty\r\na,"x, ""y""","'=HYPERLINK(""http://evil"")",-5,\r\n`);
  });
});

describe('importers feed the demo', () => {
  it('builds a demo from an ingested spec', () => {
    const parsed = parse(draftManifest(importOpenApi(openapi)).manifest);
    expect(buildDemo(parsed, generateDataset(parsed)).scenes.length).toBeGreaterThan(3);
  });
});
