import { emptySignals, kindForName, type EntitySignal, type FeatureSignal, type ProjectSignals } from './intake';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const MAX_ALLOF_DEPTH = 8;

function schemaName(ref: unknown): string | undefined {
  // Only local references are followed. Remote ones would mean fetching whatever a spec points at.
  const match = typeof ref === 'string' ? /^#\/(?:components\/schemas|definitions)\/([^/]+)$/.exec(ref) : null;
  return match?.[1];
}

function enumSpec(values: unknown[]): string | null {
  const options = values.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').map((value) => String(value).replace(/,/g, ' ').trim()).filter(Boolean);
  return options.length > 0 ? `enum:${options.join(',')}` : null;
}

function propertySpec(name: string, schema: Json): string | null {
  const ref = schemaName(schema.$ref);
  if (ref) return `ref:${ref}`;
  const composite = [...(Array.isArray(schema.allOf) ? schema.allOf : []), ...(Array.isArray(schema.oneOf) ? schema.oneOf : [])];
  for (const part of composite) {
    const target = isObject(part) ? schemaName(part.$ref) : undefined;
    if (target) return `ref:${target}`;
  }
  if (Array.isArray(schema.enum)) return enumSpec(schema.enum);
  const type = Array.isArray(schema.type) ? schema.type.find((item) => item !== 'null') : schema.type;
  switch (type) {
    case 'string':
      switch (schema.format) {
        case 'date': return 'date';
        case 'date-time': return 'datetime';
        case 'email': return 'email';
        case 'uuid': return 'id';
        case 'password':
        case 'binary':
        case 'byte': return null;
        default: return kindForName(name, 'words');
      }
    case 'integer': {
      const kind = kindForName(name, 'int');
      return kind === 'money' || kind === 'percent' ? kind : 'int:0..1000';
    }
    case 'number': {
      const kind = kindForName(name, 'float');
      return kind === 'money' || kind === 'percent' ? kind : 'float:0..1000';
    }
    case 'boolean':
      return 'bool';
    default:
      return null;
  }
}

function collectProperties(schema: Json, all: Json, depth = 0): Record<string, Json> {
  if (depth > MAX_ALLOF_DEPTH) return {};
  const properties: Record<string, Json> = {};
  for (const part of Array.isArray(schema.allOf) ? schema.allOf : []) {
    if (!isObject(part)) continue;
    const target = schemaName(part.$ref);
    const resolved = target ? all[target] : part;
    if (isObject(resolved)) Object.assign(properties, collectProperties(resolved, all, depth + 1));
  }
  if (isObject(schema.properties)) {
    for (const [name, value] of Object.entries(schema.properties)) {
      if (isObject(value)) properties[name] = value;
    }
  }
  return properties;
}

function operationSchemas(operation: Json): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 12) return;
    if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1));
    else if (isObject(value)) {
      const name = schemaName(value.$ref);
      if (name) found.add(name);
      Object.values(value).forEach((item) => walk(item, depth + 1));
    }
  };
  walk(operation.requestBody, 0);
  walk(operation.parameters, 0);
  walk(operation.responses, 0);
  return found;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Reads an OpenAPI 3 or Swagger 2 document that has already been parsed from JSON or YAML. */
export function importOpenApi(doc: unknown, source = 'openapi'): ProjectSignals {
  const signals = emptySignals();
  if (!isObject(doc) || !(doc.openapi || doc.swagger)) {
    throw new Error('This does not look like an OpenAPI document: it has no "openapi" or "swagger" key.');
  }
  const info = isObject(doc.info) ? doc.info : {};
  signals.appName = asString(info.title);
  signals.description = asString(info.description);
  signals.version = asString(info.version);

  const components = isObject(doc.components) ? doc.components : {};
  const schemas = isObject(components.schemas) ? components.schemas : isObject(doc.definitions) ? doc.definitions : {};

  for (const [name, schema] of Object.entries(schemas)) {
    if (!isObject(schema)) continue;
    const fields: Record<string, string> = {};
    for (const [field, property] of Object.entries(collectProperties(schema, schemas))) {
      const spec = propertySpec(field, property);
      if (spec) fields[field] = spec;
    }
    if (Object.keys(fields).length === 0) continue;
    signals.entities.push({
      name,
      description: asString(schema.description),
      fields,
      evidence: [{ source, detail: `schema ${name}` }],
      confidence: 'high',
    });
  }

  const groups = new Map<string, FeatureSignal>();
  const tagInfo = new Map((Array.isArray(doc.tags) ? doc.tags : []).filter(isObject).map((tag) => [asString(tag.name) ?? '', asString(tag.description)]));
  const paths = isObject(doc.paths) ? doc.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      const tag = (Array.isArray(operation.tags) ? asString(operation.tags[0]) : undefined) ?? path.split('/').filter(Boolean)[0] ?? 'General';
      let group = groups.get(tag);
      if (!group) {
        group = { title: tag.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), description: tagInfo.get(tag), entities: [], highlights: [], category: 'API', evidence: [], confidence: 'medium' };
        groups.set(tag, group);
      }
      const summary = asString(operation.summary);
      if (summary) group.highlights?.push(summary);
      group.evidence.push({ source, detail: `${method.toUpperCase()} ${path}` });
      for (const schema of operationSchemas(operation)) {
        if (!group.entities?.includes(schema)) group.entities?.push(schema);
      }
    }
  }
  signals.features.push(...groups.values());
  return signals;
}

const PRISMA_NUMBERS: Record<string, string> = { Int: 'int:0..1000', BigInt: 'int:0..1000', Float: 'float:0..1000', Decimal: 'money' };

/** Reads a Prisma schema. Only declarations are parsed, nothing is executed. */
export function importPrisma(text: string, source = 'schema.prisma'): ProjectSignals {
  const signals = emptySignals();
  const clean = text.replace(/\/\/.*$/gm, '');
  const blocks = [...clean.matchAll(/^\s*(model|enum)\s+(\w+)\s*\{([^}]*)\}/gm)];

  const enums = new Map<string, string[]>();
  for (const [, type, name, body] of blocks) {
    if (type !== 'enum' || !name) continue;
    enums.set(name, (body ?? '').split('\n').map((line) => line.trim().split(/\s+/)[0] ?? '').filter((value) => value && !value.startsWith('@')));
  }
  const models = new Set(blocks.filter(([, type]) => type === 'model').map(([, , name]) => name));

  for (const [, type, name, body] of blocks) {
    if (type !== 'model' || !name) continue;
    const lines = (body ?? '').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('@@'));
    const foreignKeys = new Set(lines.flatMap((line) => [...line.matchAll(/fields:\s*\[([^\]]*)\]/g)].flatMap((match) => (match[1] ?? '').split(',').map((key) => key.trim()))));
    const fields: Record<string, string> = {};

    for (const line of lines) {
      const match = /^(\w+)\s+(\w+)(\[\]|\?)?/.exec(line);
      if (!match) continue;
      const [, field, fieldType, modifier] = match;
      if (!field || !fieldType || modifier === '[]' || field === 'id' || foreignKeys.has(field)) continue;
      if (models.has(fieldType)) {
        fields[field] = `ref:${fieldType}`;
      } else if (enums.has(fieldType)) {
        const spec = enumSpec(enums.get(fieldType) ?? []);
        if (spec) fields[field] = spec;
      } else if (fieldType === 'String') {
        fields[field] = kindForName(field, 'words');
      } else if (fieldType === 'Boolean') {
        fields[field] = 'bool';
      } else if (fieldType === 'DateTime') {
        fields[field] = kindForName(field, 'datetime') === 'date' ? 'date' : 'datetime';
      } else if (PRISMA_NUMBERS[fieldType]) {
        const kind = kindForName(field, '');
        fields[field] = kind === 'money' || kind === 'percent' ? kind : (PRISMA_NUMBERS[fieldType] as string);
      }
    }
    if (Object.keys(fields).length === 0) continue;
    const entity: EntitySignal = { name, fields, evidence: [{ source, detail: `model ${name}` }], confidence: 'high' };
    signals.entities.push(entity);
  }
  if (signals.entities.length === 0) signals.notes.push(`${source}: no models found.`);
  return signals;
}

const SKIPPED_SECTIONS = /^(install|installation|getting started|setup|usage|quick ?start|licen[cs]e|contribut|changelog|development|building|build|test|tests|testing|requirements|prerequisites|faq|support|credits|acknowledg|table of contents|contents|roadmap|docs|documentation|deploy)/i;
const FEATURE_SECTIONS = /^(key )?(features?|highlights|capabilities|what it does|why )/i;
const INTEGRATION_SECTIONS = /^(integrations?|works with|supported (services|platforms))/i;

function plainText(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]{1,200}>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .trim();
}

/** Splits "**Title**: rest" or "Title - rest" into its two parts. */
function splitBullet(raw: string): { title: string; description?: string } {
  const bold = /^(?:\*\*|__)(.+?)(?:\*\*|__)\s*[:\-–—]?\s*(.*)$/.exec(raw);
  if (bold) return { title: plainText(bold[1] ?? ''), description: plainText(bold[2] ?? '') || undefined };
  const text = plainText(raw);
  const split = /^(.{3,60}?)\s*(?::|\s[-–—]\s)\s*(.+)$/.exec(text);
  if (split) return { title: split[1] ?? '', description: split[2] };
  return { title: text };
}

/** Heuristic only: headings and bullets become draft features. */
export function importReadme(markdown: string, source = 'README.md'): ProjectSignals {
  const signals = emptySignals();
  const lines = markdown.replace(/```[\s\S]*?```/g, '').split(/\r?\n/);
  let section = '';
  let current: FeatureSignal | null = null;

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const title = plainText(heading[2] ?? '');
      if (level === 1 && !signals.appName) {
        signals.appName = title;
        section = '';
        current = null;
      } else if (level === 2) {
        section = title;
        current = null;
      } else if (FEATURE_SECTIONS.test(section) && title) {
        current = { title, highlights: [], evidence: [{ source, detail: `heading "${title}"` }], confidence: 'medium' };
        signals.features.push(current);
      }
    } else if (bullet) {
      if (INTEGRATION_SECTIONS.test(section)) {
        signals.integrations.push(splitBullet(bullet[1] ?? '').title);
      } else if (FEATURE_SECTIONS.test(section)) {
        if (current) {
          current.highlights?.push(plainText(bullet[1] ?? ''));
        } else {
          const { title, description } = splitBullet(bullet[1] ?? '');
          if (title) signals.features.push({ title, description, evidence: [{ source, detail: `bullet in "${section}"` }], confidence: 'medium' });
        }
      }
    } else if (line.trim() && !line.startsWith('[![') && !line.startsWith('|')) {
      const text = plainText(line);
      if (!text) continue;
      if (!section && !signals.description) signals.description = text;
      else if (current && !current.description) current.description = text;
    }
  }

  if (signals.features.length === 0) {
    const sections = lines.flatMap((line) => {
      const match = /^##\s+(.*?)\s*#*$/.exec(line);
      const title = match ? plainText(match[1] ?? '') : '';
      return title && !SKIPPED_SECTIONS.test(title) && !FEATURE_SECTIONS.test(title) ? [title] : [];
    });
    for (const title of sections) {
      signals.features.push({ title, evidence: [{ source, detail: `heading "${title}"` }], confidence: 'low' });
    }
  }
  return signals;
}
