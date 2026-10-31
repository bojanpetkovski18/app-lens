import type { ManifestInput } from '@app-lens/core';
import { describe, expect, it } from 'vitest';
import { canUseForm, removeEntity, removePersona, renameEntity, renameField, splitLines } from '../src/editor';

const draft = (): ManifestInput => ({
  app: { name: 'A' },
  personas: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }],
  entities: {
    Customer: { display: 'name', fields: { name: 'fullName', email: 'email' } },
    Order: { fields: { customer: 'ref:Customer', parent: 'ref:Order', total: 'money' } },
  },
  features: [{ id: 'f', title: 'F', personas: ['one', 'two'], entities: ['Customer', 'Order'] }],
  scenarios: [
    { id: 's', title: 'S', persona: 'one', entity: 'Customer', steps: [{ action: 'create', narration: 'N', values: { name: 'Ana' } }, { action: 'select', narration: 'N', where: { name: 'Ana' } }, { action: 'update', narration: 'N', set: { email: 'a@b.example' } }] },
    { id: 't', title: 'T', entity: 'Order', steps: [{ action: 'update', narration: 'N', set: { total: 1 } }] },
  ],
});

describe('canUseForm', () => {
  it('accepts what the form can show, even when it is invalid', () => {
    expect(canUseForm(draft())).toBe(true);
    expect(canUseForm({})).toBe(true);
    expect(canUseForm({ app: {}, features: [{ id: 'BAD ID' }] })).toBe(true);
    expect(canUseForm({ entities: { Thing: { fields: {} } } })).toBe(true);
  });

  it('refuses shapes that would crash it', () => {
    const broken: unknown[] = [
      null,
      5,
      'text',
      [],
      { app: 'name' },
      { personas: 'x' },
      { personas: [null] },
      { personas: [{ goals: 'x' }] },
      { features: {} },
      { features: [1] },
      { features: [{ highlights: 1 }] },
      { features: [{ personas: 'x' }] },
      { features: [{ entities: 'x' }] },
      { integrations: 'x' },
      { integrations: [null] },
      { scenarios: 'x' },
      { entities: [] },
      { entities: { Thing: null } },
      { entities: { Thing: {} } },
      { entities: { Thing: { fields: [] } } },
      { entities: { Thing: { fields: { name: 5 } } } },
    ];
    for (const value of broken) expect(canUseForm(value), JSON.stringify(value)).toBe(false);
  });
});

describe('renameEntity', () => {
  it('updates everything that points at the entity', () => {
    const value = draft();
    renameEntity(value, 'Customer', 'Client');
    expect(Object.keys(value.entities ?? {})).toEqual(['Client', 'Order']);
    expect(value.entities?.Order?.fields.customer).toBe('ref:Client');
    expect(value.features?.[0]?.entities).toEqual(['Client', 'Order']);
    expect(value.scenarios?.[0]?.entity).toBe('Client');
  });

  it('keeps self-references and order', () => {
    const value = draft();
    renameEntity(value, 'Order', 'Sale');
    expect(Object.keys(value.entities ?? {})).toEqual(['Customer', 'Sale']);
    expect(value.entities?.Sale?.fields.parent).toBe('ref:Sale');
  });

  it('never replaces another entity', () => {
    const value = draft();
    renameEntity(value, 'Order', 'Customer');
    expect(Object.keys(value.entities ?? {})).toEqual(['Customer', 'Order']);
    expect(value.entities?.Customer?.fields).toHaveProperty('email');
  });
});

describe('renameField', () => {
  it('updates the display field and walkthrough values', () => {
    const value = draft();
    renameField(value, 'Customer', 'name', 'fullName');
    expect(Object.keys(value.entities?.Customer?.fields ?? {})).toEqual(['fullName', 'email']);
    expect(value.entities?.Customer?.display).toBe('fullName');
    expect(value.scenarios?.[0]?.steps).toMatchObject([{ values: { fullName: 'Ana' } }, { where: { fullName: 'Ana' } }, { set: { email: 'a@b.example' } }]);
  });

  it('leaves other entities alone', () => {
    const value = draft();
    renameField(value, 'Customer', 'email', 'total');
    expect(value.scenarios?.[1]?.steps).toMatchObject([{ set: { total: 1 } }]);
    expect(value.scenarios?.[0]?.steps[2]).toMatchObject({ set: { total: 'a@b.example' } });
  });

  it('never replaces another field', () => {
    const value = draft();
    renameField(value, 'Customer', 'email', 'name');
    expect(value.entities?.Customer?.fields).toEqual({ name: 'fullName', email: 'email' });
  });
});

describe('removing', () => {
  it('takes a persona off the features and walkthroughs that used it', () => {
    const value = draft();
    removePersona(value, 0);
    expect(value.personas?.map((persona) => persona.id)).toEqual(['two']);
    expect(value.features?.[0]?.personas).toEqual(['two']);
    expect(value.scenarios?.[0]?.persona).toBeUndefined();
  });

  it('takes an entity off the features that used it', () => {
    const value = draft();
    removeEntity(value, 'Order');
    expect(Object.keys(value.entities ?? {})).toEqual(['Customer']);
    expect(value.features?.[0]?.entities).toEqual(['Customer']);
  });
});

describe('splitLines', () => {
  it('treats an empty box as no items', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('keeps a trailing line so someone can keep typing', () => {
    expect(splitLines('one\n')).toEqual(['one', '']);
  });

  it('drops blank lines in the middle', () => {
    expect(splitLines('one\n\ntwo')).toEqual(['one', 'two']);
  });
});
