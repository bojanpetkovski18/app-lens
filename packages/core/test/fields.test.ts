import { describe, expect, it } from 'vitest';
import { createRng, formatSequence, parseFieldSpec } from '../src';

describe('parseFieldSpec', () => {
  it('parses kinds with arguments', () => {
    expect(parseFieldSpec('money:10..500')).toMatchObject({ ok: true, spec: { kind: 'money', range: { min: 10, max: 500 } } });
    expect(parseFieldSpec('ref:Customer')).toMatchObject({ ok: true, spec: { kind: 'ref', target: 'Customer' } });
    expect(parseFieldSpec('enum:a, b ,c')).toMatchObject({ ok: true, spec: { options: ['a', 'b', 'c'] } });
    expect(parseFieldSpec('seq:INV-####')).toMatchObject({ ok: true, spec: { pattern: 'INV-####' } });
    expect(parseFieldSpec('int:5')).toMatchObject({ ok: true, spec: { range: { min: 5, max: 5 } } });
  });

  it('applies default ranges', () => {
    expect(parseFieldSpec('money')).toMatchObject({ ok: true, spec: { range: { min: 10, max: 1000 } } });
    expect(parseFieldSpec('date')).toMatchObject({ ok: true, spec: { range: { min: -365, max: 0 } } });
  });

  it.each(['nope', 'ref', 'enum:', 'int:10..1', 'int:1.5..3', 'money:abc', 'words:1..500', 'email:x'])('rejects %s', (raw) => {
    expect(parseFieldSpec(raw).ok).toBe(false);
  });
});

describe('formatSequence', () => {
  it('pads the first run of #', () => {
    expect(formatSequence('INV-####', 7)).toBe('INV-0007');
    expect(formatSequence('TP-#', 42)).toBe('TP-42');
    expect(formatSequence('N', 3)).toBe('N3');
  });
});

describe('createRng', () => {
  it('is deterministic per seed', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(createRng('other').next()).not.toBe(createRng('seed').next());
  });

  it('forks independent streams', () => {
    const used = createRng('seed');
    used.next();
    used.next();
    expect(used.fork('x').next()).toBe(createRng('seed').fork('x').next());
    expect(createRng('seed').fork('y').next()).not.toBe(createRng('seed').fork('x').next());
  });

  it('keeps integers within bounds', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 500; i++) {
      const value = rng.int(-2, 2);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
    }
  });
});
