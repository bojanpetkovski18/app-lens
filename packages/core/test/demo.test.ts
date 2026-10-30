import { describe, expect, it } from 'vitest';
import { buildDemo, generateDataset, parseManifest, rankFeatures, sceneAt, scenarioStepAt, type Manifest, type ScenarioScene } from '../src';

function manifest(): Manifest {
  const result = parseManifest({
    app: { name: 'Demo', tagline: 'Short pitch' },
    personas: [{ id: 'admin', label: 'Admin' }, { id: 'user', label: 'User' }],
    entities: {
      Customer: { count: 5, fields: { name: 'company' } },
      Order: { count: 6, fields: { customer: 'ref:Customer', status: 'enum:new,done' } },
    },
    features: [
      { id: 'thin', title: 'Thin' },
      { id: 'rich', title: 'Rich', description: 'Well described', personas: ['admin'], entities: ['Order', 'Customer'], highlights: ['a', 'b'] },
      { id: 'paid', title: 'Paid', tier: 'Pro', personas: ['user'], entities: ['Order'] },
    ],
    scenarios: [
      { id: 'one', title: 'One', persona: 'admin', entity: 'Order', steps: [
        { action: 'create', narration: 'New' },
        { action: 'update', narration: 'Done', set: { status: 'done' } },
      ] },
      { id: 'two', title: 'Two', persona: 'user', entity: 'Order', steps: [{ action: 'note', narration: 'Hi' }] },
    ],
    integrations: [{ name: 'Mail' }],
    mock: { seed: 'demo', baseDate: '2025-01-15' },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.manifest;
}

describe('rankFeatures', () => {
  it('prefers well-described features and filters by persona', () => {
    expect(rankFeatures(manifest())[0]?.id).toBe('rich');
    expect(rankFeatures(manifest(), 'user').map((f) => f.id)).toEqual(['paid', 'thin']);
  });
});

describe('buildDemo', () => {
  it('scripts every scene in order and sums the duration', () => {
    const m = manifest();
    const script = buildDemo(m, generateDataset(m), { maxFeatures: 2 });
    expect(script.scenes.map((s) => s.kind)).toEqual(['intro', 'personas', 'feature', 'feature', 'data-model', 'scenario', 'scenario', 'outro']);
    expect(script.scenes[2]?.id).toBe('feature:rich');
    expect(script.durationMs).toBe(script.scenes.reduce((sum, s) => sum + s.durationMs, 0));
  });

  it('describes relationships and replays scenarios', () => {
    const m = manifest();
    const script = buildDemo(m, generateDataset(m));
    const model = script.scenes.find((s) => s.kind === 'data-model');
    expect(model?.caption).toBe('Manages customer and order, all linked together.');
    expect(script.findings.relationships).toBe(1);
    expect(script.scenes.find((s): s is ScenarioScene => s.kind === 'scenario')?.frames).toHaveLength(2);
  });

  it('tailors the demo to a persona', () => {
    const m = manifest();
    const script = buildDemo(m, generateDataset(m), { persona: 'user' });
    expect(script.scenes.some((s) => s.id === 'feature:rich')).toBe(false);
    expect(script.scenes.some((s) => s.id === 'scenario:one')).toBe(false);
    expect(script.findings.workflows).toBe(1);
  });
});

describe('timeline helpers', () => {
  it('locates scenes, including clamping', () => {
    const m = manifest();
    const script = buildDemo(m, generateDataset(m));
    expect(sceneAt(script, 0).scene.kind).toBe('intro');
    expect(sceneAt(script, 4500).scene.kind).toBe('personas');
    const end = sceneAt(script, script.durationMs + 1000);
    expect(end.scene.kind).toBe('outro');
    expect(end.progress).toBe(1);
  });

  it('maps progress to steps', () => {
    const m = manifest();
    const scene = buildDemo(m, generateDataset(m)).scenes.find((s): s is ScenarioScene => s.kind === 'scenario')!;
    expect(scenarioStepAt(scene, 0)).toBe(-1);
    expect(scenarioStepAt(scene, 1)).toBe(1);
    expect(scenarioStepAt(scene, (scene.leadInMs + 100) / scene.durationMs)).toBe(0);
  });
});
