import { parseFieldSpec } from './fields';
import { entityOrder, ReferenceCycleError } from './generator';
import { manifestSchema, type Manifest, type Scenario } from './schema';

export interface ManifestIssue {
  path: string;
  message: string;
}
export type ParseManifestResult = { ok: true; manifest: Manifest } | { ok: false; issues: ManifestIssue[] };

function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out || '(root)';
}

function checkDuplicates(items: readonly { id: string }[], section: string, issues: ManifestIssue[]): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) issues.push({ path: `${section}[${index}].id`, message: `Duplicate id "${item.id}".` });
    seen.add(item.id);
  });
}

function checkEntities(manifest: Manifest, issues: ManifestIssue[]): boolean {
  let specsValid = true;
  for (const [name, entity] of Object.entries(manifest.entities)) {
    for (const [field, raw] of Object.entries(entity.fields)) {
      const path = `entities.${name}.fields.${field}`;
      if (field === 'id') {
        issues.push({ path, message: '"id" is generated automatically. Use a different field name.' });
      }
      const parsed = parseFieldSpec(raw);
      if (!parsed.ok) {
        specsValid = false;
        issues.push({ path, message: parsed.error });
      } else if (parsed.spec.kind === 'ref' && parsed.spec.target && !manifest.entities[parsed.spec.target]) {
        issues.push({ path, message: `References unknown entity "${parsed.spec.target}".` });
      }
    }
    if (entity.display && !(entity.display in entity.fields)) {
      issues.push({ path: `entities.${name}.display`, message: `Unknown field "${entity.display}".` });
    }
  }
  return specsValid;
}

function checkValues(
  manifest: Manifest,
  scenario: Scenario,
  values: Record<string, unknown> | undefined,
  path: string,
  allowId: boolean,
  issues: ManifestIssue[],
): void {
  const entity = manifest.entities[scenario.entity];
  if (!entity || !values) return;
  for (const [field, value] of Object.entries(values)) {
    if (allowId && field === 'id') continue;
    const raw = entity.fields[field];
    if (raw === undefined) {
      issues.push({ path: `${path}.${field}`, message: `Unknown field "${field}" on ${scenario.entity}.` });
      continue;
    }
    const parsed = parseFieldSpec(raw);
    if (parsed.ok && parsed.spec.kind === 'enum' && !parsed.spec.options?.includes(String(value))) {
      issues.push({ path: `${path}.${field}`, message: `"${String(value)}" is not one of: ${parsed.spec.options?.join(', ')}.` });
    }
  }
}

function checkReferences(manifest: Manifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  checkDuplicates(manifest.personas, 'personas', issues);
  checkDuplicates(manifest.features, 'features', issues);
  checkDuplicates(manifest.scenarios, 'scenarios', issues);

  if (checkEntities(manifest, issues)) {
    try {
      entityOrder(manifest.entities);
    } catch (error) {
      if (!(error instanceof ReferenceCycleError)) throw error;
      issues.push({ path: 'entities', message: error.message });
    }
  }

  const personas = new Set(manifest.personas.map((persona) => persona.id));
  manifest.features.forEach((feature, index) => {
    feature.personas.forEach((persona, i) => {
      if (!personas.has(persona)) issues.push({ path: `features[${index}].personas[${i}]`, message: `Unknown persona "${persona}".` });
    });
    feature.entities.forEach((entity, i) => {
      if (!manifest.entities[entity]) issues.push({ path: `features[${index}].entities[${i}]`, message: `Unknown entity "${entity}".` });
    });
  });

  manifest.scenarios.forEach((scenario, index) => {
    const path = `scenarios[${index}]`;
    if (scenario.persona && !personas.has(scenario.persona)) {
      issues.push({ path: `${path}.persona`, message: `Unknown persona "${scenario.persona}".` });
    }
    if (!manifest.entities[scenario.entity]) {
      issues.push({ path: `${path}.entity`, message: `Unknown entity "${scenario.entity}".` });
      return;
    }
    scenario.steps.forEach((step, i) => {
      const stepPath = `${path}.steps[${i}]`;
      if (step.action === 'create') checkValues(manifest, scenario, step.values, `${stepPath}.values`, false, issues);
      if (step.action === 'update') checkValues(manifest, scenario, step.set, `${stepPath}.set`, false, issues);
      if (step.action === 'select') checkValues(manifest, scenario, step.where, `${stepPath}.where`, true, issues);
    });
  });
  return issues;
}

export function parseManifest(input: unknown): ParseManifestResult {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message })),
    };
  }
  const issues = checkReferences(parsed.data);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, manifest: parsed.data };
}
