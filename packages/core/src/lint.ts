import { getEntityFields, generateDataset } from './generator';
import { runScenario } from './scenario';
import type { Manifest } from './schema';

export type LintSeverity = 'warning' | 'tip';

export interface LintFinding {
  severity: LintSeverity;
  path: string;
  message: string;
}

export interface LintResult {
  /** 0 to 100, how complete and consistent the showcase is. */
  score: number;
  findings: LintFinding[];
}

const PENALTY: Record<LintSeverity, number> = { warning: 8, tip: 3 };

/** Quality checks for a valid manifest. Unlike validation, none of these stop a build. */
export function lintManifest(manifest: Manifest): LintResult {
  const findings: LintFinding[] = [];
  const warn = (path: string, message: string) => findings.push({ severity: 'warning', path, message });
  const tip = (path: string, message: string) => findings.push({ severity: 'tip', path, message });
  const { app, personas, features, scenarios, entities } = manifest;

  if (!app.tagline) tip('app.tagline', 'Add a tagline. It opens the overview and the demo.');
  if (!app.description) tip('app.description', 'Add a description so visitors know what the app does.');
  if (features.length === 0) warn('features', 'List at least one feature.');
  if (Object.keys(entities).length === 0) warn('entities', 'Add a data type so the explorer has something to show.');
  if (scenarios.length === 0) tip('scenarios', 'Add a walkthrough to show the app in action.');
  if (personas.length === 0) tip('personas', 'Add personas to unlock the "who gets what" matrix.');
  if (!manifest.mock.baseDate) tip('mock.baseDate', 'Set a base date so generated data is the same every day.');

  features.forEach((feature, index) => {
    const path = `features[${index}]`;
    if (!feature.description) tip(`${path}.description`, `"${feature.title}" has no description.`);
    if (feature.highlights.length === 0) tip(`${path}.highlights`, `"${feature.title}" has no highlights for the demo.`);
  });

  for (const persona of personas) {
    const used = features.some((feature) => feature.personas.includes(persona.id)) || scenarios.some((scenario) => scenario.persona === persona.id);
    if (!used) warn('personas', `Persona "${persona.label}" is not linked to any feature or walkthrough.`);
  }

  const referenced = new Set<string>([
    ...features.flatMap((feature) => feature.entities),
    ...scenarios.map((scenario) => scenario.entity),
    ...Object.values(entities).flatMap((entity) => getEntityFields(entity).flatMap(([, spec]) => (spec.kind === 'ref' && spec.target ? [spec.target] : []))),
  ]);
  for (const name of Object.keys(entities)) {
    if (!referenced.has(name)) tip(`entities.${name}`, `${name} is not used by any feature, walkthrough or link.`);
  }

  // Steps that find nothing play back as a walkthrough where nothing happens.
  const dataset = generateDataset(manifest);
  scenarios.forEach((scenario, index) => {
    runScenario(manifest, dataset, scenario).forEach((frame, step) => {
      const path = `scenarios[${index}].steps[${step}]`;
      if (frame.step.action === 'select' && !frame.subject) warn(path, `"${scenario.title}" selects nothing with this seed. Try a different "where" or more records.`);
      if ((frame.step.action === 'update' || frame.step.action === 'delete') && !frame.subject && !frame.removed) {
        warn(path, `"${scenario.title}" has no record to ${frame.step.action}. Add a create or select step before it.`);
      }
    });
  });

  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + PENALTY[finding.severity], 0));
  return { score, findings };
}

export interface ManifestChange {
  section: 'app' | 'personas' | 'entities' | 'features' | 'scenarios' | 'integrations';
  type: 'added' | 'removed' | 'changed';
  name: string;
}

function diffList<T>(section: ManifestChange['section'], before: T[], after: T[], key: (item: T) => string): ManifestChange[] {
  const previous = new Map(before.map((item) => [key(item), item]));
  const next = new Map(after.map((item) => [key(item), item]));
  const changes: ManifestChange[] = [];
  for (const [name, item] of next) {
    if (!previous.has(name)) changes.push({ section, type: 'added', name });
    else if (JSON.stringify(previous.get(name)) !== JSON.stringify(item)) changes.push({ section, type: 'changed', name });
  }
  for (const name of previous.keys()) {
    if (!next.has(name)) changes.push({ section, type: 'removed', name });
  }
  return changes;
}

/** What differs between two manifests. Used for review steps and release notes. */
export function diffManifests(before: Manifest, after: Manifest): ManifestChange[] {
  const entries = (manifest: Manifest) => Object.entries(manifest.entities);
  return [
    ...(JSON.stringify(before.app) !== JSON.stringify(after.app) ? [{ section: 'app' as const, type: 'changed' as const, name: after.app.name }] : []),
    ...diffList('personas', before.personas, after.personas, (item) => item.id),
    ...diffList('entities', entries(before), entries(after), ([name]) => name),
    ...diffList('features', before.features, after.features, (item) => item.id),
    ...diffList('scenarios', before.scenarios, after.scenarios, (item) => item.id),
    ...diffList('integrations', before.integrations, after.integrations, (item) => item.name),
  ];
}
