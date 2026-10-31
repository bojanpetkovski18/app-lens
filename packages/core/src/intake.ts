import { parseFieldSpec } from './fields';
import { entityOrder, ReferenceCycleError } from './generator';
import type { EntityDefinition, ManifestInput } from './schema';
import { parseManifest } from './validate';

export type Confidence = 'high' | 'medium' | 'low';

/** A file path or page URL that a draft item was derived from. */
export interface Evidence {
  source: string;
  detail?: string;
}

export interface EntitySignal {
  name: string;
  description?: string;
  /** Field name to field spec. */
  fields: Record<string, string>;
  evidence: Evidence[];
  confidence: Confidence;
}

export interface FeatureSignal {
  title: string;
  description?: string;
  category?: string;
  entities?: string[];
  highlights?: string[];
  evidence: Evidence[];
  confidence: Confidence;
}

export interface PersonaSignal {
  label: string;
  description?: string;
  evidence: Evidence[];
  confidence: Confidence;
}

/** Everything intake can learn about a project. Collecting these is I/O, mapping them is not. */
export interface ProjectSignals {
  appName?: string;
  tagline?: string;
  description?: string;
  category?: string;
  version?: string;
  website?: string;
  theme?: { primary?: string; accent?: string };
  entities: EntitySignal[];
  features: FeatureSignal[];
  personas: PersonaSignal[];
  integrations: string[];
  notes: string[];
}

export function emptySignals(): ProjectSignals {
  return { entities: [], features: [], personas: [], integrations: [], notes: [] };
}

/** Later signals fill gaps and add items, earlier signals win on conflicts. */
export function mergeSignals(...parts: ProjectSignals[]): ProjectSignals {
  const merged = emptySignals();
  for (const part of parts) {
    merged.appName ??= part.appName;
    merged.tagline ??= part.tagline;
    merged.description ??= part.description;
    merged.category ??= part.category;
    merged.version ??= part.version;
    merged.website ??= part.website;
    merged.theme = { ...part.theme, ...merged.theme };
    for (const entity of part.entities) {
      const existing = merged.entities.find((item) => item.name.toLowerCase() === entity.name.toLowerCase());
      if (existing) {
        existing.fields = { ...entity.fields, ...existing.fields };
        existing.evidence.push(...entity.evidence);
      } else {
        merged.entities.push({ ...entity, fields: { ...entity.fields }, evidence: [...entity.evidence] });
      }
    }
    for (const feature of part.features) {
      const existing = merged.features.find((item) => item.title.toLowerCase() === feature.title.toLowerCase());
      if (existing) existing.evidence.push(...feature.evidence);
      else merged.features.push({ ...feature, evidence: [...feature.evidence] });
    }
    merged.personas.push(...part.personas.filter((p) => !merged.personas.some((item) => item.label === p.label)));
    merged.integrations.push(...part.integrations.filter((name) => !merged.integrations.includes(name)));
    merged.notes.push(...part.notes);
  }
  return merged;
}

const words = (value: string): string[] =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "order item" becomes "OrderItem". Result is a valid entity name, or empty. */
export function toEntityName(value: string): string {
  const name = words(value).map((word) => capitalize(word)).join('').replace(/^\d+/, '');
  return name.slice(0, 60);
}

/** "Order Item" becomes "orderItem". Result is a valid field name, or empty. */
export function toFieldName(value: string): string {
  const name = words(value).map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word.toLowerCase()))).join('').replace(/^\d+/, '');
  return name.slice(0, 60);
}

export function toId(value: string): string {
  const id = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-').slice(0, 60).replace(/-+$/, '');
  return id;
}

// Matched against snake_case, so a whole word is needed: "update" is not a date, "votes" are not notes.
const NAME_KINDS: [RegExp, string][] = [
  [/^(full_)?name$|^display_name$|^contact$/, 'fullName'],
  [/^first_name$/, 'firstName'],
  [/^last_name$|^surname$/, 'lastName'],
  [/(^|_)e_?mail(_|$)/, 'email'],
  [/(^|_)(phone|mobile|telephone)(_|$)/, 'phone'],
  [/(^|_)(company|organi[sz]ation|org)(_|$)/, 'company'],
  [/^job_title$/, 'jobTitle'],
  [/^title$|^position$/, 'title'],
  [/^city$/, 'city'],
  [/^country$/, 'country'],
  [/(^|_)(description|summary|bio|notes?|comments?|content|body)$/, 'sentence'],
  [/(^|_)(price|amount|total|cost|salary|balance|fees?)$/, 'money'],
  [/(^|_)(percent|percentage|progress|rate)$/, 'percent'],
  [/^(created|updated|deleted|published)(_at)?$|_at$/, 'datetime'],
  [/(^|_)date$|^due$|^(start|end)(_(on|day))?$/, 'date'],
];

/** Picks a generator from a field's name, falling back to the given kind. */
export function kindForName(name: string, fallback: string): string {
  const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return NAME_KINDS.find(([pattern]) => pattern.test(snake))?.[1] ?? fallback;
}

const ENTITY_LIMIT = 30;
const FIELD_LIMIT = 40;
const FEATURE_LIMIT = 100;
const PERSONA_LIMIT = 12;
const SCENARIO_LIMIT = 5;
const LIST_LIMIT = 10;
const DEFAULT_COUNT = 12;
const STATUS_FIELD = /^(status|state|stage|phase)$/i;
/** Same limits as the schema, so a draft is cut to fit instead of failing validation. */
const MAX_NAME = 60;
const MAX_SPEC = 300;
const MAX_TITLE = 80;
const MAX_SOURCE = 500;

function clip(value: string | undefined, max: number): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export interface ReportItem {
  kind: 'app' | 'entity' | 'feature' | 'persona' | 'scenario';
  name: string;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface IntakeReport {
  items: ReportItem[];
  notes: string[];
}

export interface DraftOptions {
  /** Used when no signal names the app. */
  fallbackName?: string;
  /** Shown as `attribution`, required for projects the user does not own. */
  attribution?: { text: string; url?: string };
  thirdParty?: { source: string };
}

export interface DraftResult {
  manifest: ManifestInput;
  report: IntakeReport;
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let suffix = 2; taken.has(name); suffix++) name = `${base.slice(0, MAX_NAME - String(suffix).length)}${suffix}`;
  taken.add(name);
  return name;
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** Long enums are common, for example a list of countries. Only the first options fit in a spec. */
function fitSpec(spec: string, path: string, notes: string[]): string {
  if (spec.length <= MAX_SPEC) return spec;
  if (!spec.startsWith('enum:')) return 'word';
  const options = spec.slice(5).split(',');
  const kept: string[] = [];
  for (const option of options) {
    if (`enum:${[...kept, option].join(',')}`.length > MAX_SPEC) break;
    kept.push(option);
  }
  if (kept.length === 0) return 'word';
  notes.push(`${path}: kept the first ${kept.length} of ${options.length} options.`);
  return `enum:${kept.join(',')}`;
}

function cleanEntities(signals: ProjectSignals, notes: string[]) {
  const taken = new Set<string>();
  const renamed = new Map<string, string>();
  const entities = signals.entities.flatMap((signal) => {
    const base = toEntityName(signal.name);
    if (!base) {
      notes.push(`Skipped entity "${signal.name}": no usable name.`);
      return [];
    }
    if (taken.size >= ENTITY_LIMIT) {
      notes.push(`Skipped entity "${signal.name}": the limit is ${ENTITY_LIMIT}.`);
      return [];
    }
    const name = uniqueName(base, taken);
    renamed.set(signal.name, name);
    return [{ signal, name }];
  });

  const result: Record<string, { description?: string; count: number; fields: Record<string, string> }> = {};
  for (const { signal, name } of entities) {
    const fields: Record<string, string> = {};
    for (const [rawField, rawSpec] of Object.entries(signal.fields)) {
      let field = toFieldName(rawField);
      if (field === 'id') field = `${toFieldName(signal.name)}Id`.slice(0, 60);
      if (!field || Object.hasOwn(fields, field) || Object.keys(fields).length >= FIELD_LIMIT) continue;
      const spec = rawSpec.startsWith('ref:') ? resolveRef(rawSpec, renamed) : rawSpec;
      if (!spec) {
        notes.push(`${name}.${field}: replaced a link to an entity that was not found.`);
        fields[field] = 'codename';
      } else {
        fields[field] = parseFieldSpec(spec).ok ? fitSpec(spec, `${name}.${field}`, notes) : 'word';
      }
    }
    if (Object.keys(fields).length === 0) fields.name = 'title';
    result[name] = { description: clip(signal.description, 500), count: DEFAULT_COUNT, fields };
  }
  breakCycles(result, notes);
  return { entities: result, renamed };
}

function resolveRef(spec: string, renamed: Map<string, string>): string | null {
  const target = renamed.get(spec.slice(4));
  return target ? `ref:${target}` : null;
}

/** Only self-references are supported, so the link that closes a cycle becomes plain text. */
function breakCycles(entities: Record<string, { fields: Record<string, string> }>, notes: string[]): void {
  for (;;) {
    try {
      // Fresh objects, because parsed fields are cached per entity object and these are being edited.
      const snapshot = Object.entries(entities).map(([name, entity]) => [name, { ...entity }]);
      entityOrder(Object.fromEntries(snapshot) as Record<string, EntityDefinition>);
      return;
    } catch (error) {
      if (!(error instanceof ReferenceCycleError)) throw error;
      const [from, to] = error.cycle.slice(-2) as [string, string];
      const fields = entities[from]?.fields ?? {};
      const field = Object.keys(fields).find((name) => fields[name] === `ref:${to}`);
      if (!field) throw error;
      fields[field] = 'codename';
      notes.push(`${from}.${field}: removed a link to ${to} because the two entities referenced each other.`);
    }
  }
}

function statusFlow(entities: Record<string, { fields: Record<string, string> }>) {
  return Object.entries(entities).flatMap(([name, entity]) => {
    const [field, spec] = Object.entries(entity.fields).find(([key, value]) => STATUS_FIELD.test(key) && value.startsWith('enum:')) ?? [];
    const parsed = spec ? parseFieldSpec(spec) : null;
    const options = parsed?.ok ? parsed.spec.options ?? [] : [];
    return field && options.length >= 2 ? [{ name, field, options: options.slice(0, 6) }] : [];
  });
}

function draftScenarios(entities: Record<string, { fields: Record<string, string> }>) {
  const ids = new Set<string>();
  return statusFlow(entities).slice(0, SCENARIO_LIMIT).map(({ name, field, options }) => ({
    id: uniqueName(toId(`${name} lifecycle`), ids),
    title: clip(`Follow a ${words(name).join(' ').toLowerCase()} from start to finish`, MAX_TITLE) as string,
    entity: name,
    steps: [
      { action: 'create' as const, narration: `A new ${words(name).join(' ').toLowerCase()} starts as ${options[0]}.`, values: { [field]: options[0] as string } },
      ...options.slice(1).map((option) => ({ action: 'update' as const, narration: `It moves to ${option}.`, set: { [field]: option } })),
    ],
  }));
}

/** Pure mapping from signals to a validated draft. Throws if the result would not validate. */
export function draftManifest(signals: ProjectSignals, options: DraftOptions = {}): DraftResult {
  const notes = [...signals.notes];
  const name = clip(signals.appName, 80) ?? clip(options.fallbackName, 80) ?? 'Untitled app';
  const { entities, renamed } = cleanEntities(signals, notes);
  const items: ReportItem[] = [];

  const personaIds = new Set<string>();
  const personas = signals.personas.slice(0, PERSONA_LIMIT).flatMap((signal) => {
    const base = toId(signal.label);
    const label = clip(signal.label, 60);
    if (!base || !label) return [];
    const id = uniqueName(base, personaIds);
    items.push({ kind: 'persona', name: label, confidence: signal.confidence, evidence: signal.evidence });
    return [{ id, label, description: clip(signal.description, 500) }];
  });

  const featureIds = new Set<string>();
  const features = signals.features.slice(0, FEATURE_LIMIT).flatMap((signal) => {
    const title = clip(signal.title, 80);
    const base = toId(signal.title);
    if (!title || !base) return [];
    const id = uniqueName(base, featureIds);
    items.push({ kind: 'feature', name: title, confidence: signal.confidence, evidence: signal.evidence });
    return [{
      id,
      title,
      description: clip(signal.description, 1000),
      category: clip(signal.category, 60),
      entities: (signal.entities ?? []).flatMap((entity) => renamed.get(entity) ?? []),
      highlights: (signal.highlights ?? []).flatMap((highlight) => clip(highlight, 200) ?? []).slice(0, LIST_LIMIT),
    }];
  });
  if (signals.features.length > FEATURE_LIMIT) notes.push(`Kept the first ${FEATURE_LIMIT} of ${signals.features.length} features.`);

  for (const signal of signals.entities) {
    const entityName = renamed.get(signal.name);
    if (entityName) items.push({ kind: 'entity', name: entityName, confidence: signal.confidence, evidence: signal.evidence });
  }

  const scenarios = draftScenarios(entities);
  for (const scenario of scenarios) {
    items.push({ kind: 'scenario', name: scenario.title, confidence: 'low', evidence: [{ source: 'generated', detail: `from the ${scenario.entity} status field` }] });
  }

  const theme = {
    primary: signals.theme?.primary,
    accent: signals.theme?.accent,
  };
  const website = signals.website && isHttpUrl(signals.website) ? signals.website : undefined;
  const attribution = options.attribution && {
    text: clip(options.attribution.text, MAX_SOURCE) as string,
    ...(options.attribution.url && isHttpUrl(options.attribution.url) ? { url: options.attribution.url } : {}),
  };

  const manifest: ManifestInput = {
    manifestVersion: 1,
    app: {
      name,
      tagline: clip(signals.tagline, 160),
      description: clip(signals.description, 2000),
      category: clip(signals.category, 60),
      version: clip(signals.version, 30),
      website,
      ...(theme.primary || theme.accent ? { theme: { ...(theme.primary ? { primary: theme.primary } : {}), ...(theme.accent ? { accent: theme.accent } : {}) } } : {}),
    },
    ...(attribution ? { attribution } : {}),
    personas,
    entities,
    features,
    scenarios,
    integrations: signals.integrations.slice(0, 50).flatMap((integration) => {
      const clipped = clip(integration, 60);
      return clipped ? [{ name: clipped }] : [];
    }),
    mock: { seed: toId(name) || 'app-lens' },
    ...(options.thirdParty ? { draft: { thirdParty: true, source: clip(options.thirdParty.source, MAX_SOURCE) as string } } : {}),
  };

  const clean = JSON.parse(JSON.stringify(manifest)) as ManifestInput;
  const result = parseManifest(clean);
  if (!result.ok) throw new Error(`Draft manifest is invalid: ${JSON.stringify(result.issues.slice(0, 5))}`);
  return { manifest: clean, report: { items, notes } };
}
