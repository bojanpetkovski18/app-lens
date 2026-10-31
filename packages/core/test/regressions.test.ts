import { describe, expect, it } from 'vitest';
import { generateDataset, parseFieldSpec, parseManifest, runScenario, type Manifest } from '../src';

function parse(input: unknown): Manifest {
  const result = parseManifest(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.manifest;
}

const entity = (fields: Record<string, string>, count = 2) => ({ app: { name: 'A' }, entities: { T: { count, fields } } });

describe('manifests that used to pass validation and then crash', () => {
  it.each(['2025-13-45', '2025-02-31', '2025-00-10', '2025-04-31'])('rejects the impossible base date %s', (baseDate) => {
    expect(parseManifest({ app: { name: 'A' }, mock: { baseDate } }).ok).toBe(false);
  });

  it('accepts a real leap day', () => {
    expect(parseManifest({ app: { name: 'A' }, mock: { baseDate: '2024-02-29' } }).ok).toBe(true);
  });

  it.each(['date:999999999999..999999999999', 'datetime:-999999999999..0', 'date:0..100001'])('rejects the unusable date range %s', (raw) => {
    expect(parseFieldSpec(raw).ok).toBe(false);
  });

  it('generates at the edge of the allowed date range', () => {
    const manifest = parse({ ...entity({ a: 'date:100000..100000', b: 'datetime:-100000..-100000' }), mock: { baseDate: '2025-01-15' } });
    expect(() => generateDataset(manifest)).not.toThrow();
  });

  it('rejects numbers beyond the safe integer range', () => {
    expect(parseFieldSpec('int:0..99999999999999999999').ok).toBe(false);
    expect(parseFieldSpec('money:-99999999999999999999..0').ok).toBe(false);
  });
});

describe('names that exist on Object.prototype', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])('reports ref:%s as unknown instead of throwing', (name) => {
    const result = parseManifest(entity({ a: `ref:${name}` }));
    expect(result).toMatchObject({ ok: false, issues: [{ message: `References unknown entity "${name}".` }] });
  });

  it('reports a feature or scenario entity named after a prototype key', () => {
    const result = parseManifest({
      app: { name: 'A' },
      features: [{ id: 'x', title: 'X', entities: ['constructor'] }],
      scenarios: [{ id: 's', title: 'S', entity: 'toString', steps: [{ action: 'note', narration: 'n' }] }],
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ issues: [{ message: 'Unknown entity "constructor".' }, { message: 'Unknown entity "toString".' }] });
  });

  it('reports a step field or display named after a prototype key', () => {
    const result = parseManifest({
      app: { name: 'A' },
      entities: { T: { display: 'constructor', fields: { a: 'word' } } },
      scenarios: [{ id: 's', title: 'S', entity: 'T', steps: [{ action: 'update', narration: 'n', set: { constructor: 1 } }] }],
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ message: 'Unknown field "constructor".' }, { message: 'Unknown field "constructor" on T.' }],
    });
  });

  it('still supports an entity that really is called constructor', () => {
    const manifest = parse({ app: { name: 'A' }, entities: { constructor: { count: 1, fields: { a: 'word' } }, B: { count: 1, fields: { c: 'ref:constructor' } } } });
    expect(generateDataset(manifest).B?.[0]?.c).toBe('constructor-001');
  });

  it('runScenario rejects an unknown prototype-named entity on unvalidated input', () => {
    const manifest = parse(entity({ a: 'word' }));
    const scenario = { id: 's', title: 'S', entity: 'toString', steps: [{ action: 'note' as const, narration: 'n' }] };
    expect(() => runScenario(manifest, {}, scenario)).toThrow('uses unknown entity');
  });
});

describe('scenario values are checked against the field kind', () => {
  const scenario = (set: Record<string, unknown>) => ({
    app: { name: 'A' },
    entities: { T: { fields: { n: 'int:1..5', m: 'money:1..5', b: 'bool', d: 'date', p: 'percent' } } },
    scenarios: [{ id: 's', title: 'S', entity: 'T', steps: [{ action: 'update', narration: 'n', set }] }],
  });

  it.each([
    [{ n: 'lots' }, '"lots" is not a number.'],
    [{ m: 'free' }, '"free" is not a number.'],
    [{ p: true }, '"true" is not a number.'],
    [{ b: 'yes' }, '"yes" is not true or false.'],
    [{ d: 'soon' }, '"soon" is not a date.'],
  ])('rejects %j', (set, message) => {
    expect(parseManifest(scenario(set))).toMatchObject({ ok: false, issues: [{ message }] });
  });

  it('accepts matching values, tokens and null', () => {
    expect(parseManifest(scenario({ n: 3, m: 1.5, b: false, d: '$today', p: null })).ok).toBe(true);
  });
});

describe('small fixes', () => {
  it('accepts upper-case http schemes but nothing else', () => {
    expect(parseManifest({ app: { name: 'A', website: 'HTTPS://example.com' } }).ok).toBe(true);
    expect(parseManifest({ app: { name: 'A', website: 'JAVASCRIPT:alert(1)' } }).ok).toBe(false);
    expect(parseManifest({ app: { name: 'A', website: 'ftp://example.com' } }).ok).toBe(false);
  });

  it('never generates negative zero', () => {
    const manifest = parse(entity({ a: 'float:-0.001..-0.001' }));
    expect(Object.is(generateDataset(manifest).T?.[0]?.a, 0)).toBe(true);
  });
});
