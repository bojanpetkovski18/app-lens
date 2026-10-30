import type { Feature, MockRecord, Scenario } from '@app-lens/core';

export function isForPersona(feature: Feature, persona: string | null): boolean {
  return !persona || feature.personas.length === 0 || feature.personas.includes(persona);
}

export function isScenarioForPersona(scenario: Scenario, persona: string | null): boolean {
  return !persona || !scenario.persona || scenario.persona === persona;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => (Array.from(word)[0] ?? '').toUpperCase())
    .join('');
}

export function slug(value: string, separator = '-'): string {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(separator);
}

/** camelCase or snake_case to "Sentence case". */
export function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function hue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

// Creating an Intl formatter is slow, and a table can need thousands of them.
const moneyFormats = new Map<string, Intl.NumberFormat | null>();

export function formatMoney(value: number, currency: string): string {
  let format = moneyFormats.get(currency);
  if (format === undefined) {
    try {
      format = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    } catch {
      format = null;
    }
    moneyFormats.set(currency, format);
  }
  return format ? format.format(value) : value.toFixed(2);
}

let dateFormat: Intl.DateTimeFormat | undefined;
let dateTimeFormat: Intl.DateTimeFormat | undefined;

export function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (withTime) {
    dateTimeFormat ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return dateTimeFormat.format(date);
  }
  dateFormat ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
  return dateFormat.format(date);
}

const recordIndexes = new WeakMap<readonly MockRecord[], Map<string, MockRecord>>();

/** Id lookup for a record list, built once per list. */
export function recordIndex(records: readonly MockRecord[]): Map<string, MockRecord> {
  let index = recordIndexes.get(records);
  if (!index) {
    index = new Map(records.map((record) => [record.id, record]));
    recordIndexes.set(records, index);
  }
  return index;
}

/** matchMedia is missing in some embedding environments and in tests. */
export function mediaMatches(query: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(query).matches;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
