import type { Rng } from './rng';
import { CITIES, CODENAMES, COMPANY_PREFIXES, COMPANY_SUFFIXES, COUNTRIES, EMAIL_DOMAINS, FIRST_NAMES, JOB_TITLES, LAST_NAMES, TITLE_NOUNS, TITLE_VERBS, WORDS } from './words';

export type Scalar = string | number | boolean | null;

export const FIELD_KINDS = [
  'id', 'seq', 'ref', 'enum', 'const',
  'int', 'float', 'money', 'percent', 'bool', 'date', 'datetime',
  'fullName', 'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'city', 'country',
  'codename', 'title', 'word', 'words', 'sentence', 'paragraph',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FieldRange {
  min: number;
  max: number;
}

export interface FieldSpec {
  raw: string;
  kind: FieldKind;
  range?: FieldRange;
  options?: string[];
  target?: string;
  pattern?: string;
  value?: string;
}

export type ParseFieldResult = { ok: true; spec: FieldSpec } | { ok: false; error: string };

export const DAY_MS = 86_400_000;
const MAX_COUNT = 50;

const DEFAULT_RANGES: Partial<Record<FieldKind, FieldRange>> = {
  int: { min: 0, max: 100 },
  float: { min: 0, max: 1 },
  money: { min: 10, max: 1000 },
  percent: { min: 0, max: 100 },
  date: { min: -365, max: 0 },
  datetime: { min: -30, max: 0 },
  words: { min: 2, max: 4 },
  sentence: { min: 6, max: 12 },
  paragraph: { min: 2, max: 4 },
};

const WHOLE_NUMBER_KINDS: ReadonlySet<FieldKind> = new Set(['int', 'percent', 'date', 'words', 'sentence', 'paragraph']);
const COUNT_KINDS: ReadonlySet<FieldKind> = new Set(['words', 'sentence', 'paragraph']);

const RANGE = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/;
const SINGLE_NUMBER = /^-?\d+(?:\.\d+)?$/;

function parseRange(arg: string): FieldRange | null {
  const match = RANGE.exec(arg);
  if (match) return { min: Number(match[1]), max: Number(match[2]) };
  if (SINGLE_NUMBER.test(arg)) return { min: Number(arg), max: Number(arg) };
  return null;
}

function isKind(value: string): value is FieldKind {
  return (FIELD_KINDS as readonly string[]).includes(value);
}

export function parseFieldSpec(raw: string): ParseFieldResult {
  const colon = raw.indexOf(':');
  const kind = (colon === -1 ? raw : raw.slice(0, colon)).trim();
  const arg = colon === -1 ? '' : raw.slice(colon + 1).trim();

  if (!isKind(kind)) {
    return { ok: false, error: `Unknown field kind "${kind}". Supported kinds: ${FIELD_KINDS.join(', ')}.` };
  }

  switch (kind) {
    case 'ref':
      if (!arg) return { ok: false, error: '"ref" needs a target entity, e.g. "ref:Customer".' };
      return { ok: true, spec: { raw, kind, target: arg } };
    case 'enum': {
      const options = arg.split(',').map((option) => option.trim()).filter(Boolean);
      if (options.length === 0) return { ok: false, error: '"enum" needs at least one option, e.g. "enum:draft,sent,paid".' };
      return { ok: true, spec: { raw, kind, options } };
    }
    case 'seq':
      return { ok: true, spec: { raw, kind, pattern: arg || '#' } };
    case 'const':
      return { ok: true, spec: { raw, kind, value: arg } };
  }

  const defaultRange = DEFAULT_RANGES[kind];
  if (!defaultRange) {
    if (arg) return { ok: false, error: `"${kind}" does not take arguments.` };
    return { ok: true, spec: { raw, kind } };
  }

  if (!arg) return { ok: true, spec: { raw, kind, range: defaultRange } };

  const range = parseRange(arg);
  if (!range) return { ok: false, error: `Invalid range "${arg}" for "${kind}". Use "min..max", e.g. "${kind}:1..10".` };
  if (range.min > range.max) return { ok: false, error: `Range minimum is greater than maximum in "${raw}".` };
  if (WHOLE_NUMBER_KINDS.has(kind) && !(Number.isInteger(range.min) && Number.isInteger(range.max))) {
    return { ok: false, error: `"${kind}" needs a whole-number range, e.g. "${kind}:1..10".` };
  }
  if (COUNT_KINDS.has(kind) && (range.min < 1 || range.max > MAX_COUNT)) {
    return { ok: false, error: `"${kind}" counts must be between 1 and ${MAX_COUNT}.` };
  }
  return { ok: true, spec: { raw, kind, range } };
}

export function formatSequence(pattern: string, n: number): string {
  const match = /#+/.exec(pattern);
  if (!match) return `${pattern}${n}`;
  const digits = String(n).padStart(match[0].length, '0');
  return pattern.slice(0, match.index) + digits + pattern.slice(match.index + match[0].length);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface RecordHints {
  full?: string;
  first?: string;
  last?: string;
  company?: string;
}

export interface GenerateContext {
  rng: Rng;
  baseDate: Date;
  /** 1-based position of the record. */
  sequence: number;
  hints: RecordHints;
  pickRef: (target: string) => string | null;
}

function slug(value: string, separator: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(separator);
}

function uuid(rng: Rng): string {
  const hex = Array.from({ length: 32 }, () => rng.int(0, 15).toString(16));
  hex[12] = '4';
  hex[16] = (8 + rng.int(0, 3)).toString(16);
  const text = hex.join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sentence(rng: Rng, count: number): string {
  const words = Array.from({ length: count }, () => rng.pick(WORDS));
  return `${capitalize(words.join(' '))}.`;
}

function email(ctx: GenerateContext): string {
  const { rng, hints } = ctx;
  const person = hints.full ?? (hints.first || hints.last
    ? `${hints.first ?? ''} ${hints.last ?? ''}`
    : `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`);
  const domain = hints.company ? `${slug(hints.company, '')}.example` : rng.pick(EMAIL_DOMAINS);
  return `${slug(person, '.')}@${domain}`;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function generateValue(spec: FieldSpec, ctx: GenerateContext): Scalar {
  const { rng, baseDate, hints } = ctx;
  const range = spec.range ?? { min: 0, max: 0 };

  switch (spec.kind) {
    case 'id':
      return uuid(rng);
    case 'seq':
      return formatSequence(spec.pattern ?? '#', ctx.sequence);
    case 'ref':
      return ctx.pickRef(spec.target ?? '');
    case 'enum':
      return rng.pick(spec.options ?? []);
    case 'const':
      return spec.value ?? '';
    case 'int':
    case 'percent':
      return rng.int(range.min, range.max);
    case 'float':
    case 'money':
      return rounded(rng.float(range.min, range.max));
    case 'bool':
      return rng.bool();
    case 'date':
      return isoDate(new Date(baseDate.getTime() + rng.int(range.min, range.max) * DAY_MS));
    case 'datetime': {
      const offset = rng.float(range.min, range.max) * DAY_MS;
      const minutes = Math.round((baseDate.getTime() + offset) / 60_000);
      return new Date(minutes * 60_000).toISOString();
    }
    case 'fullName': {
      const value = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      hints.full ??= value;
      return value;
    }
    case 'firstName': {
      const value = rng.pick(FIRST_NAMES);
      hints.first ??= value;
      return value;
    }
    case 'lastName': {
      const value = rng.pick(LAST_NAMES);
      hints.last ??= value;
      return value;
    }
    case 'company': {
      const value = `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_SUFFIXES)}`;
      hints.company ??= value;
      return value;
    }
    case 'email':
      return email(ctx);
    case 'phone':
      return `+1 555-01${String(rng.int(0, 99)).padStart(2, '0')}`;
    case 'jobTitle':
      return rng.pick(JOB_TITLES);
    case 'city':
      return rng.pick(CITIES);
    case 'country':
      return rng.pick(COUNTRIES);
    case 'codename':
      return rng.pick(CODENAMES);
    case 'word':
      return rng.pick(WORDS);
    case 'title':
      return `${rng.pick(TITLE_VERBS)} ${rng.pick(TITLE_NOUNS)}`;
    case 'words':
      return Array.from({ length: rng.int(range.min, range.max) }, () => rng.pick(WORDS)).join(' ');
    case 'sentence':
      return sentence(rng, rng.int(range.min, range.max));
    case 'paragraph':
      return Array.from({ length: rng.int(range.min, range.max) }, () => sentence(rng, rng.int(6, 14))).join(' ');
  }
}
