import type { Feature, Scenario } from '@app-lens/core';

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
    .map((word) => word.charAt(0).toUpperCase())
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

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

export function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : { timeZone: 'UTC' }),
  }).format(date);
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
