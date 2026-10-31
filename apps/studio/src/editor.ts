import { lintManifest, parseManifest, type LintResult, type Manifest, type ManifestIssue } from '@app-lens/core';

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
