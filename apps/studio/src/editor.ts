import { lintManifest, parseManifest, type LintResult, type Manifest, type ManifestInput, type ManifestIssue } from '@app-lens/core';

const MAX_HISTORY = 100;

export interface EditorState {
  past: string[];
  text: string;
  future: string[];
}

export type EditorAction = { type: 'edit'; text: string } | { type: 'replace'; text: string } | { type: 'load'; text: string } | { type: 'undo' } | { type: 'redo' };

export function createEditor(text: string): EditorState {
  return { past: [], text, future: [] };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'edit':
    case 'replace':
      if (action.text === state.text) return state;
      return { past: [...state.past, state.text].slice(-MAX_HISTORY), text: action.text, future: [] };
    case 'load':
      return createEditor(action.text);
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return { past: state.past.slice(0, -1), text: previous, future: [state.text, ...state.future] };
    }
    case 'redo': {
      const [next, ...future] = state.future;
      if (next === undefined) return state;
      return { past: [...state.past, state.text], text: next, future };
    }
  }
}

export interface Analysis {
  /** Parsed JSON, even when it does not validate, so the form can still show it. */
  value: unknown;
  jsonError: string | null;
  issues: ManifestIssue[];
  manifest: Manifest | null;
  lint: LintResult | null;
}

export function analyze(text: string): Analysis {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { value: undefined, jsonError: (error as Error).message, issues: [], manifest: null, lint: null };
  }
  const result = parseManifest(value);
  if (!result.ok) return { value, jsonError: null, issues: result.issues, manifest: null, lint: null };
  return { value, jsonError: null, issues: [], manifest: result.manifest, lint: lintManifest(result.manifest) };
}

export const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function indexOfKey(text: string, key: string, from: number): number {
  const index = text.indexOf(`"${key}"`, from);
  return index === -1 ? from : index;
}

/** Finds where an issue path such as "features[2].title" sits in pretty-printed JSON. */
export function locatePath(text: string, path: string): number {
  if (path === '(root)') return 0;
  let position = 0;
  for (const token of path.match(/[^.[\]]+|\[\d+\]/g) ?? []) {
    if (!token.startsWith('[')) {
      position = indexOfKey(text, token, position);
      continue;
    }
    const target = Number(token.slice(1, -1));
    let depth = 0;
    let count = -1;
    let inString = false;
    for (let index = text.indexOf('[', position) + 1; index > 0 && index < text.length; index++) {
      const char = text[index];
      if (inString) {
        if (char === '\\') index++;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
        if (depth === 0 && (count === -1 || text[lastSignificant(text, index)] === ',')) count++;
      } else if (char === '{' || char === '[') {
        if (depth === 0 && (count === -1 || text[lastSignificant(text, index)] === ',')) count++;
        depth++;
      } else if (char === '}' || char === ']') {
        if (depth === 0) break;
        depth--;
      }
      if (depth <= 1 && count === target && char !== ' ' && char !== '\n') {
        position = index;
        break;
      }
    }
  }
  return position;
}

function lastSignificant(text: string, before: number): number {
  let index = before - 1;
  while (index > 0 && /\s/.test(text[index] as string)) index--;
  return index;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const optionalStrings = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
const optionalRecords = (value: unknown): value is Record<string, unknown>[] | undefined => value === undefined || (Array.isArray(value) && value.every(isRecord));

/** The form also shows invalid manifests, but only if each part has the shape it reads. */
export function canUseForm(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { app, personas, features, integrations, scenarios, entities } = value;
  if (app !== undefined && !isRecord(app)) return false;
  if (!optionalRecords(personas) || !optionalRecords(features) || !optionalRecords(integrations) || !optionalRecords(scenarios)) return false;
  if (personas?.some((persona) => !optionalStrings(persona.goals))) return false;
  if (features?.some((feature) => !optionalStrings(feature.highlights) || !optionalStrings(feature.personas) || !optionalStrings(feature.entities))) return false;
  if (entities === undefined) return true;
  return isRecord(entities) && Object.values(entities).every((entity) => isRecord(entity) && isRecord(entity.fields) && Object.values(entity.fields).every((spec) => typeof spec === 'string'));
}

/** One item per line. A trailing blank line stays so the next line can be typed. */
export function splitLines(value: string): string[] {
  if (!value) return [];
  return value.split('\n').filter((line, index, all) => line || index === all.length - 1);
}

/** Keeps the key's position, because order decides how fields are generated and shown. */
function renameKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key === from ? to : key, value]));
}

/** Renames in place, along with everything that points at the entity. An existing name is refused, because it would replace that entity. */
export function renameEntity(draft: ManifestInput, from: string, to: string): void {
  const entities = draft.entities ?? {};
  if (from === to || Object.hasOwn(entities, to)) return;
  draft.entities = renameKey(entities, from, to);
  for (const entity of Object.values(draft.entities)) {
    for (const [field, spec] of Object.entries(entity.fields)) {
      if (spec === `ref:${from}`) entity.fields[field] = `ref:${to}`;
    }
  }
  for (const feature of draft.features ?? []) {
    if (feature.entities) feature.entities = feature.entities.map((name) => (name === from ? to : name));
  }
  for (const scenario of draft.scenarios ?? []) {
    if (scenario.entity === from) scenario.entity = to;
  }
}

/** Renames in place, along with the display setting and walkthrough values. An existing name is refused. */
export function renameField(draft: ManifestInput, entityName: string, from: string, to: string): void {
  const entity = draft.entities?.[entityName];
  if (!entity || from === to || Object.hasOwn(entity.fields, to)) return;
  entity.fields = renameKey(entity.fields, from, to);
  if (entity.display === from) entity.display = to;
  for (const scenario of draft.scenarios ?? []) {
    if (scenario.entity !== entityName) continue;
    for (const step of scenario.steps) {
      if (step.action === 'create' && step.values) step.values = renameKey(step.values, from, to);
      if (step.action === 'select' && step.where) step.where = renameKey(step.where, from, to);
      if (step.action === 'update') step.set = renameKey(step.set, from, to);
    }
  }
}

export function removePersona(draft: ManifestInput, index: number): void {
  const [removed] = draft.personas?.splice(index, 1) ?? [];
  if (!removed) return;
  for (const feature of draft.features ?? []) {
    if (feature.personas) feature.personas = feature.personas.filter((id) => id !== removed.id);
  }
  for (const scenario of draft.scenarios ?? []) {
    if (scenario.persona === removed.id) delete scenario.persona;
  }
}

export function removeEntity(draft: ManifestInput, name: string): void {
  delete draft.entities?.[name];
  for (const feature of draft.features ?? []) {
    if (feature.entities) feature.entities = feature.entities.filter((item) => item !== name);
  }
}
