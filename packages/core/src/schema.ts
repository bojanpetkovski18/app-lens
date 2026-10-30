import { z } from 'zod';

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** Ends up in a CSS custom property, so only plain family names are allowed. */
export const FONT_STACK = /^[\w\s,'"-]{1,120}$/;
export const THEME_MODES = ['light', 'dark', 'auto'] as const;

const id = z
  .string()
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes, e.g. "get-paid".');
// Starting with a letter also rules out "__proto__".
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const NAME_MESSAGE = 'Use letters, digits and underscores, starting with a letter.';
const entityName = z.string().max(60).regex(NAME, NAME_MESSAGE);
const fieldName = z.string().max(60).regex(NAME, NAME_MESSAGE);

const text = (max: number) => z.string().trim().min(1).max(max);
const httpUrl = z.url().refine((value) => /^https?:\/\//i.test(value), 'Only http(s) URLs are allowed.');
const hexColor = z.string().regex(HEX_COLOR, 'Use a hex color such as "#4f46e5".');
function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine(isCalendarDate, 'This date does not exist.');
const scalar = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const valueMap = z.record(fieldName, scalar);

const themeSchema = z
  .object({
    primary: hexColor.optional(),
    accent: hexColor.optional(),
    mode: z.enum(THEME_MODES).optional(),
    radius: z.number().int().min(0).max(24).optional(),
    font: z.string().regex(FONT_STACK, 'Use a plain font stack such as "Inter, sans-serif".').optional(),
  })
  .strict();

const appSchema = z
  .object({
    name: text(80),
    tagline: text(160).optional(),
    description: text(2000).optional(),
    category: text(60).optional(),
    version: text(30).optional(),
    website: httpUrl.optional(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code such as "USD".').default('USD'),
    theme: themeSchema.optional(),
  })
  .strict();

const attributionSchema = z.object({ text: text(500), url: httpUrl.optional() }).strict();

const personaSchema = z
  .object({
    id,
    label: text(60),
    description: text(500).optional(),
    goals: z.array(text(200)).max(10).default([]),
  })
  .strict();

const entitySchema = z
  .object({
    label: text(60).optional(),
    description: text(500).optional(),
    count: z.number().int().min(0).max(500).default(8),
    display: fieldName.optional(),
    fields: z
      .record(fieldName, z.string().min(1).max(300))
      .refine((fields) => Object.keys(fields).length >= 1, 'Define at least one field.')
      .refine((fields) => Object.keys(fields).length <= 40, 'Use at most 40 fields per entity.'),
  })
  .strict();

const featureSchema = z
  .object({
    id,
    title: text(80),
    description: text(1000).optional(),
    category: text(60).optional(),
    tier: text(30).optional(),
    personas: z.array(id).default([]),
    entities: z.array(entityName).default([]),
    highlights: z.array(text(200)).max(10).default([]),
  })
  .strict();

const narration = text(500);
const stepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), narration, values: valueMap.optional() }).strict(),
  z.object({ action: z.literal('select'), narration, where: valueMap.optional() }).strict(),
  z.object({ action: z.literal('update'), narration, set: valueMap }).strict(),
  z.object({ action: z.literal('delete'), narration }).strict(),
  z.object({ action: z.literal('note'), narration }).strict(),
]);

const scenarioSchema = z
  .object({
    id,
    title: text(80),
    description: text(1000).optional(),
    persona: id.optional(),
    entity: entityName,
    steps: z.array(stepSchema).min(1).max(30),
  })
  .strict();

const integrationSchema = z
  .object({ name: text(60), category: text(60).optional(), description: text(500).optional() })
  .strict();

export const manifestSchema = z
  .object({
    $schema: z.string().optional(),
    manifestVersion: z.literal(1).default(1),
    app: appSchema,
    attribution: attributionSchema.optional(),
    personas: z.array(personaSchema).max(12).default([]),
    entities: z
      .record(entityName, entitySchema)
      .refine((entities) => Object.keys(entities).length <= 30, 'Use at most 30 entities.')
      .default({}),
    features: z.array(featureSchema).max(100).default([]),
    scenarios: z.array(scenarioSchema).max(30).default([]),
    integrations: z.array(integrationSchema).max(50).default([]),
    mock: z
      .object({
        seed: z.union([z.string().max(100), z.number()]).default('app-lens'),
        baseDate: isoDate.optional(),
      })
      .strict()
      .default({ seed: 'app-lens' }),
  })
  .strict();

export type ManifestInput = z.input<typeof manifestSchema>;
export type Manifest = z.output<typeof manifestSchema>;
export type AppInfo = Manifest['app'];
export type ThemeSettings = NonNullable<AppInfo['theme']>;
export type ThemeMode = (typeof THEME_MODES)[number];
export type Persona = Manifest['personas'][number];
export type EntityDefinition = Manifest['entities'][string];
export type Feature = Manifest['features'][number];
export type Scenario = Manifest['scenarios'][number];
export type ScenarioStep = Scenario['steps'][number];
export type Integration = Manifest['integrations'][number];

export function manifestJsonSchema(): unknown {
  return z.toJSONSchema(manifestSchema, { io: 'input' });
}
