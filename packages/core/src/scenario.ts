import { isoDate, type Scalar } from './fields';
import { createRecord, ownValue, resolveBaseDate, type Dataset, type MockRecord } from './generator';
import { createRng } from './rng';
import type { Manifest, Scenario, ScenarioStep } from './schema';

export interface ScenarioFrame {
  index: number;
  step: ScenarioStep;
  records: MockRecord[];
  subject: MockRecord | null;
  changed: string[];
  removed: MockRecord | null;
}

export interface RunScenarioOptions {
  seed?: string | number;
  baseDate?: string | Date;
}

function resolveToken(value: Scalar, baseDate: Date): Scalar {
  if (value === '$today') return isoDate(baseDate);
  if (value === '$now') return baseDate.toISOString();
  return value;
}

function resolveValues(values: Record<string, Scalar> | undefined, baseDate: Date): Record<string, Scalar> {
  return Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [key, resolveToken(value, baseDate)]));
}

export function runScenario(
  manifest: Manifest,
  dataset: Dataset,
  scenario: Scenario,
  options: RunScenarioOptions = {},
): ScenarioFrame[] {
  if (!ownValue(manifest.entities, scenario.entity)) {
    throw new Error(`Scenario "${scenario.id}" uses unknown entity "${scenario.entity}".`);
  }
  const rng = createRng(options.seed ?? manifest.mock.seed).fork(`scenario:${scenario.id}`);
  const baseDate = resolveBaseDate(manifest, options.baseDate);

  let records = [...(ownValue(dataset, scenario.entity) ?? [])];
  const working: Dataset = { ...dataset, [scenario.entity]: records };
  let nextSequence = records.length + 1;
  let subject: MockRecord | null = null;

  return scenario.steps.map((step, index) => {
    let changed: string[] = [];
    let removed: MockRecord | null = null;

    switch (step.action) {
      case 'create': {
        const generated = createRecord(manifest, scenario.entity, working, rng, nextSequence++, baseDate);
        const record: MockRecord = { ...generated, ...resolveValues(step.values, baseDate), id: generated.id };
        records = [record, ...records];
        working[scenario.entity] = records;
        subject = record;
        changed = Object.keys(record);
        break;
      }
      case 'select': {
        const where = resolveValues(step.where, baseDate);
        subject = records.find((record) => Object.entries(where).every(([key, value]) => record[key] === value)) ?? null;
        break;
      }
      case 'update': {
        if (!subject) break;
        const set = resolveValues(step.set, baseDate);
        const previous: MockRecord = subject;
        changed = Object.keys(set).filter((key) => previous[key] !== set[key]);
        const updated: MockRecord = { ...previous, ...set, id: previous.id };
        records = records.map((record) => (record.id === previous.id ? updated : record));
        working[scenario.entity] = records;
        subject = updated;
        break;
      }
      case 'delete': {
        if (!subject) break;
        const target: MockRecord = subject;
        removed = target;
        records = records.filter((record) => record.id !== target.id);
        working[scenario.entity] = records;
        subject = null;
        break;
      }
      case 'note':
        break;
    }

    return { index, step, records, subject, changed, removed };
  });
}
