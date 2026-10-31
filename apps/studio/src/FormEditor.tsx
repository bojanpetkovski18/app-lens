import { FIELD_KINDS, type ManifestInput } from '@app-lens/core';
import type { ReactNode } from 'react';
import { removeEntity, removePersona, renameEntity, renameField, splitLines } from './editor';

type Update = (change: (draft: ManifestInput) => void) => void;

interface TextProps {
  label: string;
  value: string | undefined;
  multiline?: boolean;
  onChange: (value: string) => void;
}

function Text({ label, value, multiline, onChange }: TextProps) {
  return (
    <label className="al-field">
      <span>{label}</span>
      {multiline ? (
        <textarea className="al-input" rows={3} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className="al-input" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function Section({ title, count, open, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details className="al-card al-form-section" open={open}>
      <summary>{title}{count !== undefined ? <span className="al-tab-count">{count}</span> : null}</summary>
      <div className="al-stack">{children}</div>
    </details>
  );
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="al-link" aria-label={`Remove ${label}`} onClick={onClick}>Remove</button>;
}

const optional = (value: string): string | undefined => value || undefined;

function uniqueId(base: string, taken: readonly { id: string }[]): string {
  let id = base;
  for (let suffix = 2; taken.some((item) => item.id === id); suffix++) id = `${base}-${suffix}`;
  return id;
}

function uniqueKey(base: string, taken: Record<string, unknown>): string {
  let key = base;
  for (let suffix = 2; Object.hasOwn(taken, key); suffix++) key = `${base}${suffix}`;
  return key;
}

function FieldRow({ name, spec, onName, onSpec, onRemove }: { name: string; spec: string; onName: (value: string) => void; onSpec: (value: string) => void; onRemove: () => void }) {
  const colon = spec.indexOf(':');
  const kind = colon === -1 ? spec : spec.slice(0, colon);
  const args = colon === -1 ? '' : spec.slice(colon + 1);
  const compose = (nextKind: string, nextArgs: string) => (nextArgs ? `${nextKind}:${nextArgs}` : nextKind);
  return (
    <div className="al-field-row">
      <input className="al-input" aria-label="Field name" value={name} onChange={(event) => onName(event.target.value)} />
      <select className="al-input" aria-label={`Kind of ${name}`} value={kind} onChange={(event) => onSpec(compose(event.target.value, args))}>
        {!(FIELD_KINDS as readonly string[]).includes(kind) ? <option value={kind}>{kind}</option> : null}
        {FIELD_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <input className="al-input" aria-label={`Options of ${name}`} placeholder="options" value={args} onChange={(event) => onSpec(compose(kind, event.target.value))} />
      <Remove label={`field ${name}`} onClick={onRemove} />
    </div>
  );
}

export function FormEditor({ value, onUpdate }: { value: ManifestInput; onUpdate: Update }) {
  const { app, personas = [], entities = {}, features = [], scenarios = [], integrations = [] } = value;
  const entityNames = Object.keys(entities);

  return (
    <div className="al-stack">
      <Section title="App" open>
        <Text label="Name" value={app?.name} onChange={(next) => onUpdate((d) => { d.app.name = next; })} />
        <Text label="Tagline" value={app?.tagline} onChange={(next) => onUpdate((d) => { d.app.tagline = optional(next); })} />
        <Text label="Description" multiline value={app?.description} onChange={(next) => onUpdate((d) => { d.app.description = optional(next); })} />
        <div className="al-field-pair">
          <Text label="Category" value={app?.category} onChange={(next) => onUpdate((d) => { d.app.category = optional(next); })} />
          <Text label="Version" value={app?.version} onChange={(next) => onUpdate((d) => { d.app.version = optional(next); })} />
        </div>
        <Text label="Website" value={app?.website} onChange={(next) => onUpdate((d) => { d.app.website = optional(next); })} />
        <div className="al-field-pair">
          <label className="al-field">
            <span>Primary colour</span>
            <input type="color" value={app?.theme?.primary ?? '#4f46e5'} onChange={(event) => onUpdate((d) => { d.app.theme = { ...d.app.theme, primary: event.target.value }; })} />
          </label>
          <label className="al-field">
            <span>Accent colour</span>
            <input type="color" value={app?.theme?.accent ?? '#0ea5e9'} onChange={(event) => onUpdate((d) => { d.app.theme = { ...d.app.theme, accent: event.target.value }; })} />
          </label>
        </div>
      </Section>

      <Section title="Personas" count={personas.length}>
        {personas.map((persona, index) => (
          <div key={index} className="al-form-item">
            <div className="al-row al-row-between"><strong>{persona.label || 'New persona'}</strong><Remove label={persona.label} onClick={() => onUpdate((d) => removePersona(d, index))} /></div>
            <Text label="Label" value={persona.label} onChange={(next) => onUpdate((d) => { (d.personas as NonNullable<ManifestInput['personas']>)[index]!.label = next; })} />
            <Text label="Description" value={persona.description} onChange={(next) => onUpdate((d) => { (d.personas as NonNullable<ManifestInput['personas']>)[index]!.description = optional(next); })} />
            <Text label="Goals, one per line" multiline value={persona.goals?.join('\n')} onChange={(next) => onUpdate((d) => { (d.personas as NonNullable<ManifestInput['personas']>)[index]!.goals = splitLines(next); })} />
          </div>
        ))}
        <button type="button" className="al-btn" onClick={() => onUpdate((d) => { d.personas = [...(d.personas ?? []), { id: uniqueId('persona', personas), label: 'New persona' }]; })}>Add persona</button>
      </Section>

      <Section title="Data types" count={entityNames.length}>
        {entityNames.map((name, entityIndex) => {
          const entity = entities[name] as NonNullable<ManifestInput['entities']>[string];
          return (
            // Keyed by position: a name key would remount the input and lose focus while renaming.
            <div key={entityIndex} className="al-form-item">
              <div className="al-row al-row-between"><strong>{name}</strong><Remove label={name} onClick={() => onUpdate((d) => removeEntity(d, name))} /></div>
              <div className="al-field-pair">
                <Text label="Name" value={name} onChange={(next) => onUpdate((d) => renameEntity(d, name, next))} />
                <label className="al-field">
                  <span>Sample records</span>
                  <input className="al-input" type="number" min={0} max={500} value={entity.count ?? 8} onChange={(event) => onUpdate((d) => { d.entities![name]!.count = Number(event.target.value); })} />
                </label>
              </div>
              {Object.entries(entity.fields).map(([field, spec], fieldIndex) => (
                <FieldRow
                  key={fieldIndex}
                  name={field}
                  spec={spec}
                  onName={(next) => onUpdate((d) => renameField(d, name, field, next))}
                  onSpec={(next) => onUpdate((d) => { d.entities![name]!.fields[field] = next; })}
                  onRemove={() => onUpdate((d) => { delete d.entities![name]!.fields[field]; })}
                />
              ))}
              <button type="button" className="al-btn al-btn-ghost" onClick={() => onUpdate((d) => { const fields = d.entities![name]!.fields; fields[uniqueKey('field', fields)] = 'word'; })}>Add field</button>
            </div>
          );
        })}
        <button type="button" className="al-btn" onClick={() => onUpdate((d) => { const all = d.entities ?? {}; all[uniqueKey('Thing', all)] = { count: 8, fields: { name: 'title' } }; d.entities = all; })}>Add data type</button>
      </Section>

      <Section title="Features" count={features.length}>
        {features.map((feature, index) => {
          const edit = (change: (item: NonNullable<ManifestInput['features']>[number]) => void) => onUpdate((d) => { change(d.features![index]!); });
          return (
            <div key={index} className="al-form-item">
              <div className="al-row al-row-between"><strong>{feature.title || 'New feature'}</strong><Remove label={feature.title} onClick={() => onUpdate((d) => { d.features?.splice(index, 1); })} /></div>
              <Text label="Title" value={feature.title} onChange={(next) => edit((item) => { item.title = next; })} />
              <Text label="Description" multiline value={feature.description} onChange={(next) => edit((item) => { item.description = optional(next); })} />
              <div className="al-field-pair">
                <Text label="Category" value={feature.category} onChange={(next) => edit((item) => { item.category = optional(next); })} />
                <Text label="Tier" value={feature.tier} onChange={(next) => edit((item) => { item.tier = optional(next); })} />
              </div>
              <Text label="Highlights, one per line" multiline value={feature.highlights?.join('\n')} onChange={(next) => edit((item) => { item.highlights = splitLines(next); })} />
              {personas.length > 0 ? (
                <fieldset className="al-checks">
                  <legend>For</legend>
                  {personas.map((persona) => (
                    <label key={persona.id}>
                      <input
                        type="checkbox"
                        checked={feature.personas?.includes(persona.id) ?? false}
                        onChange={(event) => edit((item) => {
                          const rest = (item.personas ?? []).filter((id) => id !== persona.id);
                          item.personas = event.target.checked ? [...rest, persona.id] : rest;
                        })}
                      />
                      {persona.label}
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          );
        })}
        <button type="button" className="al-btn" onClick={() => onUpdate((d) => { d.features = [...(d.features ?? []), { id: uniqueId('feature', features), title: 'New feature' }]; })}>Add feature</button>
      </Section>

      <Section title="Integrations" count={integrations.length}>
        {integrations.map((integration, index) => (
          <div key={index} className="al-row">
            <input className="al-input" aria-label="Integration name" value={integration.name} onChange={(event) => onUpdate((d) => { d.integrations![index]!.name = event.target.value; })} />
            <Remove label={integration.name} onClick={() => onUpdate((d) => { d.integrations?.splice(index, 1); })} />
          </div>
        ))}
        <button type="button" className="al-btn" onClick={() => onUpdate((d) => { d.integrations = [...(d.integrations ?? []), { name: 'New integration' }]; })}>Add integration</button>
      </Section>

      <p className="al-muted">Walkthroughs ({scenarios.length}) are edited in the JSON tab.</p>
    </div>
  );
}
