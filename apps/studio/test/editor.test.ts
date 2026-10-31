import { parseManifest, starterManifest } from '@app-lens/core';
import { describe, expect, it } from 'vitest';
import { analyze, createEditor, editorReducer, locatePath, serialize } from '../src/editor';

describe('editorReducer', () => {
  it('undoes and redoes edits', () => {
    let state = createEditor('a');
    state = editorReducer(state, { type: 'edit', text: 'b' });
    state = editorReducer(state, { type: 'edit', text: 'c' });
    state = editorReducer(state, { type: 'undo' });
    expect(state.text).toBe('b');
    state = editorReducer(state, { type: 'undo' });
    expect(state.text).toBe('a');
    expect(editorReducer(state, { type: 'undo' })).toBe(state);
    state = editorReducer(state, { type: 'redo' });
    expect(state.text).toBe('b');
  });

  it('drops the redo stack on a new edit and ignores no-ops', () => {
    let state = editorReducer(createEditor('a'), { type: 'edit', text: 'b' });
    state = editorReducer(state, { type: 'undo' });
    state = editorReducer(state, { type: 'edit', text: 'z' });
    expect(state.future).toEqual([]);
    expect(editorReducer(state, { type: 'edit', text: 'z' })).toBe(state);
  });

  it('starts a fresh history when a file is loaded', () => {
    const state = editorReducer(editorReducer(createEditor('a'), { type: 'edit', text: 'b' }), { type: 'load', text: 'file' });
    expect(state).toEqual({ past: [], text: 'file', future: [] });
  });

  it('caps the history', () => {
    let state = createEditor('0');
    for (let i = 1; i <= 150; i++) state = editorReducer(state, { type: 'edit', text: String(i) });
    expect(state.past).toHaveLength(100);
  });
});

describe('analyze', () => {
  it('separates broken JSON, invalid manifests and valid ones', () => {
    expect(analyze('{ nope')).toMatchObject({ manifest: null, value: undefined });
    expect(analyze('{ nope').jsonError).toBeTruthy();
    const invalid = analyze('{"app":{}}');
    expect(invalid.value).toEqual({ app: {} });
    expect(invalid.issues.length).toBeGreaterThan(0);
    const valid = analyze(serialize(starterManifest('Studio')));
    expect(valid.manifest?.app.name).toBe('Studio');
    expect(valid.lint?.score).toBeGreaterThan(0);
  });
});

describe('locatePath', () => {
  const text = serialize({
    app: { name: 'A' },
    personas: [{ id: 'one', label: 'One, with "quotes" [and] {braces}' }, { id: 'two', label: 'Two' }],
    features: [{ id: 'a', title: 'First' }, { id: 'b', title: 'Second', personas: ['x', 'y'] }],
    entities: { Thing: { fields: { name: 'word' } } },
  });
  const lineOf = (position: number) => text.slice(position, text.indexOf('\n', position));

  it('finds keys', () => {
    expect(lineOf(locatePath(text, 'app.name'))).toContain('"name": "A"');
    expect(lineOf(locatePath(text, 'entities.Thing.fields.name'))).toContain('"name": "word"');
    expect(locatePath(text, '(root)')).toBe(0);
  });

  it('counts array items, ignoring text inside strings', () => {
    expect(lineOf(locatePath(text, 'features[1].title'))).toContain('Second');
    expect(lineOf(locatePath(text, 'personas[1].label'))).toContain('Two');
    expect(lineOf(locatePath(text, 'features[1].personas[1]'))).toContain('"y"');
  });

  it('copes with a path it cannot find', () => {
    expect(locatePath(text, 'nope.missing')).toBeGreaterThanOrEqual(0);
  });

  it('works on the starter', () => {
    expect(parseManifest(starterManifest('x')).ok).toBe(true);
  });
});
