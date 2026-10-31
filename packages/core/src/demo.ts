import { getEntityFields, type Dataset, type MockRecord } from './generator';
import { runScenario, type ScenarioFrame } from './scenario';
import type { Feature, Manifest, Persona, Scenario } from './schema';

interface SceneBase {
  id: string;
  title: string;
  caption: string;
  durationMs: number;
}

export interface DemoEntity {
  name: string;
  label: string;
  count: number;
  refs: { field: string; target: string }[];
}

export interface IntroScene extends SceneBase { kind: 'intro' }
export interface PersonasScene extends SceneBase { kind: 'personas'; personas: Persona[] }
export interface FeatureScene extends SceneBase { kind: 'feature'; feature: Feature; entity: string | null; records: MockRecord[] }
export interface DataModelScene extends SceneBase { kind: 'data-model'; entities: DemoEntity[] }
export interface ScenarioScene extends SceneBase {
  kind: 'scenario';
  scenario: Scenario;
  frames: ScenarioFrame[];
  leadInMs: number;
  stepMs: number;
}
export interface OutroScene extends SceneBase { kind: 'outro'; stats: { label: string; value: number }[]; integrations: string[] }
export type DemoScene = IntroScene | PersonasScene | FeatureScene | DataModelScene | ScenarioScene | OutroScene;

export interface DemoFindings {
  featuresReviewed: number;
  featuresPicked: number;
  personas: number;
  dataTypes: number;
  relationships: number;
  workflows: number;
  scenes: number;
}

export interface DemoScript {
  scenes: DemoScene[];
  durationMs: number;
  findings: DemoFindings;
}

export interface BuildDemoOptions {
  persona?: string | null;
  seed?: string | number;
  baseDate?: string | Date;
  maxFeatures?: number;
  maxScenarios?: number;
}

export const DEMO_TIMING = {
  intro: 4500,
  personas: 5000,
  feature: 4500,
  perHighlight: 700,
  dataModel: 5500,
  scenarioLeadIn: 1800,
  scenarioStep: 3000,
  outro: 5000,
} as const;

function featureScore(feature: Feature, persona: string | null): number {
  return (
    feature.highlights.length +
    2 * Math.min(feature.entities.length, 2) +
    (feature.description ? 1 : 0) +
    (feature.tier ? 0 : 1) +
    (persona && feature.personas.includes(persona) ? 2 : 0)
  );
}

export function rankFeatures(manifest: Manifest, persona: string | null = null): Feature[] {
  return manifest.features
    .map((feature, index) => ({ feature, index, score: featureScore(feature, persona) }))
    .filter(({ feature }) => !persona || feature.personas.length === 0 || feature.personas.includes(persona))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ feature }) => feature);
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describeEntities(manifest: Manifest): DemoEntity[] {
  return Object.entries(manifest.entities).map(([name, entity]) => ({
    name,
    label: entity.label ?? name,
    count: entity.count,
    refs: getEntityFields(entity).flatMap(([field, spec]) =>
      spec.kind === 'ref' && spec.target ? [{ field, target: spec.target }] : [],
    ),
  }));
}

export function buildDemo(manifest: Manifest, dataset: Dataset, options: BuildDemoOptions = {}): DemoScript {
  const { persona = null, seed, baseDate, maxFeatures = 4, maxScenarios = 2 } = options;
  const { app } = manifest;
  const scenes: DemoScene[] = [];

  scenes.push({
    kind: 'intro',
    id: 'intro',
    title: app.name,
    caption: app.tagline ?? app.description ?? `Meet ${app.name}.`,
    durationMs: DEMO_TIMING.intro,
  });

  if (manifest.personas.length > 0) {
    scenes.push({
      kind: 'personas',
      id: 'personas',
      title: 'Who it is for',
      caption: `Built for ${listOf(manifest.personas.map((p) => p.label.toLowerCase()))}.`,
      durationMs: DEMO_TIMING.personas,
      personas: manifest.personas,
    });
  }

  const ranked = rankFeatures(manifest, persona);
  const top = new Set(ranked.slice(0, maxFeatures));
  for (const feature of manifest.features) {
    if (!top.has(feature)) continue;
    const entity = feature.entities.find((name) => manifest.entities[name]) ?? null;
    scenes.push({
      kind: 'feature',
      id: `feature:${feature.id}`,
      title: feature.title,
      caption: feature.description ?? feature.highlights[0] ?? feature.title,
      durationMs: DEMO_TIMING.feature + DEMO_TIMING.perHighlight * feature.highlights.length,
      feature,
      entity,
      records: entity ? (dataset[entity] ?? []).slice(0, 4) : [],
    });
  }

  const entities = describeEntities(manifest);
  const relationships = entities.reduce((total, entity) => total + entity.refs.length, 0);
  if (entities.length > 0) {
    scenes.push({
      kind: 'data-model',
      id: 'data-model',
      title: 'What it keeps track of',
      caption: `Manages ${listOf(entities.map((e) => e.label.toLowerCase()))}${relationships > 0 ? ', all linked together' : ''}.`,
      durationMs: DEMO_TIMING.dataModel,
      entities,
    });
  }

  const scenarios = manifest.scenarios
    .filter((scenario) => !persona || !scenario.persona || scenario.persona === persona)
    .slice(0, maxScenarios);
  for (const scenario of scenarios) {
    scenes.push({
      kind: 'scenario',
      id: `scenario:${scenario.id}`,
      title: scenario.title,
      caption: scenario.description ?? scenario.title,
      durationMs: DEMO_TIMING.scenarioLeadIn + DEMO_TIMING.scenarioStep * scenario.steps.length,
      scenario,
      frames: runScenario(manifest, dataset, scenario, { seed, baseDate }),
      leadInMs: DEMO_TIMING.scenarioLeadIn,
      stepMs: DEMO_TIMING.scenarioStep,
    });
  }

  scenes.push({
    kind: 'outro',
    id: 'outro',
    title: `That's ${app.name}`,
    caption: `${ranked.length} features, ${entities.length} types of data and ${manifest.scenarios.length} guided workflows. Explore the rest at your own pace.`,
    durationMs: DEMO_TIMING.outro,
    stats: [
      { label: 'Features', value: ranked.length },
      { label: 'Personas', value: manifest.personas.length },
      { label: 'Data types', value: entities.length },
      { label: 'Workflows', value: manifest.scenarios.length },
    ],
    integrations: manifest.integrations.map((integration) => integration.name),
  });

  return {
    scenes,
    durationMs: scenes.reduce((total, scene) => total + scene.durationMs, 0),
    findings: {
      featuresReviewed: manifest.features.length,
      featuresPicked: top.size,
      personas: manifest.personas.length,
      dataTypes: entities.length,
      relationships,
      workflows: scenarios.length,
      scenes: scenes.length,
    },
  };
}

export interface ScenePosition {
  index: number;
  scene: DemoScene;
  start: number;
  /** 0..1 within the scene. */
  progress: number;
}

export function sceneAt(script: DemoScript, elapsedMs: number): ScenePosition {
  const elapsed = Math.max(0, elapsedMs);
  let start = 0;
  for (let index = 0; index < script.scenes.length; index++) {
    const scene = script.scenes[index] as DemoScene;
    if (elapsed < start + scene.durationMs || index === script.scenes.length - 1) {
      return { index, scene, start, progress: Math.min(1, (elapsed - start) / scene.durationMs) };
    }
    start += scene.durationMs;
  }
  throw new Error('A demo needs at least one scene.');
}

/** -1 during the lead-in, otherwise the index of the current frame. */
export function scenarioStepAt(scene: ScenarioScene, progress: number): number {
  const elapsed = progress * scene.durationMs - scene.leadInMs;
  if (elapsed < 0) return -1;
  return Math.min(scene.frames.length - 1, Math.floor(elapsed / scene.stepMs));
}
