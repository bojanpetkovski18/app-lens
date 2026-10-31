import { generateValue, parseFieldSpec, type FieldSpec, type RecordHints, type Scalar } from './fields';
import { createRng, type Rng } from './rng';
import type { EntityDefinition, Manifest } from './schema';

export interface MockRecord {
  id: string;
  [field: string]: Scalar;
}
export type Dataset = Record<string, MockRecord[]>;

export interface GenerateOptions {
  seed?: string | number;
  baseDate?: string | Date;
}

export class ReferenceCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Entities reference each other in a cycle: ${cycle.join(' -> ')}. Only self-references are supported.`);
    this.name = 'ReferenceCycleError';
  }
}

/** Manifest names are untrusted, and "constructor" must not find Object.prototype.constructor. */
export function ownValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export type ParsedField = [name: string, spec: FieldSpec];
const parsedFields = new WeakMap<EntityDefinition, ParsedField[]>();

export function getEntityFields(entity: EntityDefinition): ParsedField[] {
  const cached = parsedFields.get(entity);
  if (cached) return cached;
  const fields = Object.entries(entity.fields).map(([name, raw]): ParsedField => {
    const result = parseFieldSpec(raw);
    if (!result.ok) throw new Error(`Field "${name}": ${result.error}`);
    return [name, result.spec];
  });
  parsedFields.set(entity, fields);
  return fields;
}

export function resolveBaseDate(manifest: Manifest, override?: string | Date): Date {
  const source = override ?? manifest.mock.baseDate ?? new Date();
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid base date "${String(source)}".`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Orders entities so referenced ones are generated first. */
export function entityOrder(entities: Manifest['entities']): string[] {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (name: string, path: string[]): void => {
    const current = state.get(name);
    if (current === 'done') return;
    if (current === 'visiting') {
      throw new ReferenceCycleError([...path.slice(path.indexOf(name)), name]);
    }
    state.set(name, 'visiting');
    const entity = entities[name];
    for (const [, spec] of entity ? getEntityFields(entity) : []) {
      if (spec.kind === 'ref' && spec.target && spec.target !== name && ownValue(entities, spec.target)) {
        visit(spec.target, [...path, name]);
      }
    }
    state.set(name, 'done');
    order.push(name);
  };

  for (const name of Object.keys(entities)) visit(name, []);
  return order;
}

export function createRecord(
  manifest: Manifest,
  entityName: string,
  dataset: Dataset,
  rng: Rng,
  sequence: number,
  baseDate: Date,
): MockRecord {
  const entity = ownValue(manifest.entities, entityName);
  if (!entity) throw new Error(`Unknown entity "${entityName}".`);
  const record: MockRecord = { id: `${entityName.toLowerCase()}-${String(sequence).padStart(3, '0')}` };
  const hints: RecordHints = {};
  const pickRef = (target: string): string | null => {
    const pool = ownValue(dataset, target);
    return pool && pool.length > 0 ? rng.pick(pool).id : null;
  };
  for (const [name, spec] of getEntityFields(entity)) {
    record[name] = generateValue(spec, { rng, baseDate, sequence, hints, pickRef });
  }
  return record;
}

export function generateDataset(manifest: Manifest, options: GenerateOptions = {}): Dataset {
  const root = createRng(options.seed ?? manifest.mock.seed);
  const baseDate = resolveBaseDate(manifest, options.baseDate);
  const dataset: Dataset = {};
  for (const name of entityOrder(manifest.entities)) {
    const entity = manifest.entities[name];
    if (!entity) continue;
    const rng = root.fork(name);
    const records: MockRecord[] = [];
    // Registered before generating so self-references can pick earlier records.
    dataset[name] = records;
    for (let sequence = 1; sequence <= entity.count; sequence++) {
      records.push(createRecord(manifest, name, dataset, rng, sequence, baseDate));
    }
  }
  return dataset;
}

const DISPLAY_NAMES = ['name', 'title', 'label'];
const DISPLAY_KINDS = ['seq', 'fullName', 'company', 'title', 'codename', 'jobTitle', 'firstName', 'words', 'email'];

export function displayField(entity: EntityDefinition): string | undefined {
  if (entity.display) return entity.display;
  const fields = getEntityFields(entity);
  return (
    fields.find(([name]) => DISPLAY_NAMES.includes(name))?.[0] ??
    fields.find(([, spec]) => DISPLAY_KINDS.includes(spec.kind))?.[0]
  );
}

export function displayOf(manifest: Manifest, entityName: string, record: MockRecord): string {
  const entity = manifest.entities[entityName];
  const field = entity ? displayField(entity) : undefined;
  const value = field ? record[field] : undefined;
  return value === undefined || value === null || value === '' ? record.id : String(value);
}
