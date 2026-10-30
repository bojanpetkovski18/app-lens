import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateDataset, parseManifest, runScenario, type Manifest, type ManifestInput } from '../src';

const fixture = (): ManifestInput => ({
  app: { name: 'Demo' },
  personas: [{ id: 'admin', label: 'Admin' }],
  entities: {
    Customer: { count: 5, fields: { name: 'company', email: 'email' } },
    Invoice: {
      count: 10,
      fields: { number: 'seq:INV-####', customer: 'ref:Customer', amount: 'money:100..200', status: 'enum:draft,sent,paid' },
    },
  },
  features: [{ id: 'billing', title: 'Billing', personas: ['admin'], entities: ['Invoice'] }],
  scenarios: [
    {
      id: 'lifecycle',
      title: 'Lifecycle',
      entity: 'Invoice',
      steps: [
        { action: 'create', narration: 'New', values: { status: 'draft' } },
        { action: 'update', narration: 'Send', set: { status: 'sent' } },
        { action: 'delete', narration: 'Remove' },
      ],
    },
  ],
  mock: { seed: 'test', baseDate: '2025-01-15' },
});

function parse(input: unknown): Manifest {
  const result = parseManifest(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.manifest;
}

function issuesOf(input: unknown): string[] {
  const result = parseManifest(input);
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

describe('parseManifest', () => {
  it('accepts a valid manifest and applies defaults', () => {
    const manifest = parse(fixture());
    expect(manifest.app.currency).toBe('USD');
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.integrations).toEqual([]);
  });

  it('accepts every bundled sample and runs its scenarios', () => {
    const dir = join(__dirname, '../../../samples');
    const files = readdirSync(dir).filter((file) => file.endsWith('.app-lens.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const manifest = parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
      const dataset = generateDataset(manifest);
      for (const scenario of manifest.scenarios) {
        runScenario(manifest, dataset, scenario).forEach((frame) => {
          if (frame.step.action === 'select') expect(frame.subject, `${file}/${scenario.id}`).not.toBeNull();
        });
      }
    }
  });

  it('rejects unsafe URLs', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x']) {
      expect(parseManifest({ app: { name: 'A', website: url } }).ok).toBe(false);
      expect(parseManifest({ app: { name: 'A' }, attribution: { text: 'x', url } }).ok).toBe(false);
    }
  });

  it('rejects unknown keys', () => {
    expect(parseManifest({ app: { name: 'A' }, nope: true }).ok).toBe(false);
    expect(parseManifest({ app: { name: 'A', nope: true } }).ok).toBe(false);
  });

  it('reports unknown references', () => {
    const input = fixture();
    input.features![0]!.personas = ['ghost'];
    input.features![0]!.entities = ['Ghost'];
    input.scenarios![0]!.persona = 'ghost';
    const issues = issuesOf(input);
    expect(issues).toContain('features[0].personas[0]: Unknown persona "ghost".');
    expect(issues).toContain('features[0].entities[0]: Unknown entity "Ghost".');
    expect(issues).toContain('scenarios[0].persona: Unknown persona "ghost".');
    input.scenarios![0]!.entity = 'Ghost';
    expect(issuesOf(input)).toContain('scenarios[0].entity: Unknown entity "Ghost".');
  });

  it('reports field problems', () => {
    const issues = issuesOf({
      app: { name: 'A' },
      entities: { Thing: { display: 'missing', fields: { id: 'word', parent: 'ref:Ghost', bad: 'nope:1' } } },
    });
    expect(issues).toContain('entities.Thing.display: Unknown field "missing".');
    expect(issues).toContain('entities.Thing.fields.id: "id" is generated automatically. Use a different field name.');
    expect(issues).toContain('entities.Thing.fields.parent: References unknown entity "Ghost".');
    expect(issues.some((issue) => issue.startsWith('entities.Thing.fields.bad: Unknown field kind'))).toBe(true);
  });

  it('reports reference cycles but allows self-references', () => {
    const cycle = { app: { name: 'A' }, entities: { A: { fields: { b: 'ref:B' } }, B: { fields: { a: 'ref:A' } } } };
    expect(issuesOf(cycle).join()).toContain('A -> B -> A');
    expect(parseManifest({ app: { name: 'A' }, entities: { Node: { fields: { parent: 'ref:Node' } } } }).ok).toBe(true);
  });

  it('reports unknown step fields and enum typos', () => {
    const input = fixture();
    input.scenarios![0]!.steps = [
      { action: 'create', narration: 'x', values: { nope: 1 } },
      { action: 'update', narration: 'x', set: { status: 'payed' } },
    ];
    const issues = issuesOf(input);
    expect(issues).toContain('scenarios[0].steps[0].values.nope: Unknown field "nope" on Invoice.');
    expect(issues).toContain('scenarios[0].steps[1].set.status: "payed" is not one of: draft, sent, paid.');
  });

  it('reports duplicate ids', () => {
    const input = fixture();
    input.personas!.push({ id: 'admin', label: 'Again' });
    expect(issuesOf(input)).toContain('personas[1].id: Duplicate id "admin".');
  });
});

describe('generateDataset', () => {
  it('is deterministic for a seed', () => {
    const manifest = parse(fixture());
    expect(generateDataset(manifest)).toEqual(generateDataset(manifest));
    expect(generateDataset(manifest, { seed: 'other' })).not.toEqual(generateDataset(manifest));
  });

  it('generates valid, linked records', () => {
    const dataset = generateDataset(parse(fixture()));
    const customers = new Set(dataset.Customer!.map((c) => c.id));
    expect(dataset.Invoice![0]!.number).toBe('INV-0001');
    for (const invoice of dataset.Invoice!) {
      expect(customers.has(invoice.customer as string)).toBe(true);
      expect(invoice.amount as number).toBeGreaterThanOrEqual(100);
      expect(invoice.amount as number).toBeLessThanOrEqual(200);
      expect(['draft', 'sent', 'paid']).toContain(invoice.status);
    }
  });

  it('only uses reserved example email domains', () => {
    const manifest = parse({ app: { name: 'A' }, entities: { P: { count: 100, fields: { name: 'fullName', email: 'email' } }, C: { count: 100, fields: { name: 'company', email: 'email' } } } });
    const dataset = generateDataset(manifest);
    for (const record of [...dataset.P!, ...dataset.C!]) {
      expect(record.email).toMatch(/@([a-z0-9]+\.example|example\.(com|org|net))$/);
    }
  });

  it('supports self-references', () => {
    const manifest = parse({ app: { name: 'A' }, entities: { Node: { count: 5, fields: { parent: 'ref:Node' } } } });
    const nodes = generateDataset(manifest).Node!;
    expect(nodes[0]!.parent).toBeNull();
    expect(nodes[1]!.parent).toBe(nodes[0]!.id);
  });
});

describe('runScenario', () => {
  it('creates, updates and deletes without mutating the dataset', () => {
    const manifest = parse(fixture());
    const dataset = generateDataset(manifest);
    const snapshot = structuredClone(dataset);
    const frames = runScenario(manifest, dataset, manifest.scenarios[0]!);
    expect(frames[0]!.records).toHaveLength(11);
    expect(frames[0]!.subject?.status).toBe('draft');
    expect(frames[1]!.changed).toEqual(['status']);
    expect(frames[2]!.records).toHaveLength(10);
    expect(frames[2]!.removed?.status).toBe('sent');
    expect(frames[2]!.subject).toBeNull();
    expect(dataset).toEqual(snapshot);
  });

  it('selects by field values and resolves tokens', () => {
    const manifest = parse({
      app: { name: 'A' },
      entities: { T: { count: 3, fields: { status: 'const:open', on: 'date:0..0' } } },
      scenarios: [{ id: 's', title: 'S', entity: 'T', steps: [
        { action: 'select', narration: 'x', where: { on: '$today' } },
        { action: 'update', narration: 'x', set: { status: 'closed' } },
      ] }],
      mock: { baseDate: '2025-01-15' },
    });
    const frames = runScenario(manifest, generateDataset(manifest), manifest.scenarios[0]!);
    expect(frames[0]!.subject?.id).toBe('t-001');
    expect(frames[1]!.subject?.status).toBe('closed');
  });
});
