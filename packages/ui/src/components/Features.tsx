import type { Manifest } from '@app-lens/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrack } from '../analytics';
import { isForPersona } from '../util';
import type { DataFocus } from './DataExplorer';

interface FeaturesProps {
  manifest: Manifest;
  persona: string | null;
  onOpenData: (focus: DataFocus) => void;
}

export function Features({ manifest, persona, onOpenData }: FeaturesProps) {
  const [category, setCategory] = useState<string | null>(null);
  const [layout, setLayout] = useState<'cards' | 'matrix'>('cards');

  const forPersona = useMemo(() => manifest.features.filter((f) => isForPersona(f, persona)), [manifest, persona]);
  const categories = useMemo(
    () => [...new Set(forPersona.flatMap((feature) => (feature.category ? [feature.category] : [])))],
    [forPersona],
  );
  const activeCategory = category && categories.includes(category) ? category : null;
  const visible = useMemo(
    () => forPersona.filter((feature) => !activeCategory || feature.category === activeCategory),
    [forPersona, activeCategory],
  );
  const track = useTrack();
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const feature of visible) {
      if (seen.current.has(feature.id)) continue;
      seen.current.add(feature.id);
      track({ type: 'feature_viewed', feature: feature.id });
    }
  }, [visible, track]);
  const personaLabel = (id: string) => manifest.personas.find((p) => p.id === id)?.label ?? id;

  return (
    <div className="al-stack">
      <div className="al-toolbar">
        <div className="al-chips">
          <button type="button" className="al-chip" aria-pressed={!activeCategory} onClick={() => setCategory(null)}>
            All
          </button>
          {categories.map((name) => (
            <button key={name} type="button" className="al-chip" aria-pressed={activeCategory === name} onClick={() => setCategory(name)}>
              {name}
            </button>
          ))}
        </div>
        {manifest.personas.length > 0 ? (
          <div className="al-segmented" role="group" aria-label="Layout">
            <button type="button" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}>Cards</button>
            <button type="button" aria-pressed={layout === 'matrix'} onClick={() => setLayout('matrix')}>Who gets what</button>
          </div>
        ) : null}
      </div>

      {persona ? (
        <p className="al-muted">
          Showing {forPersona.length} of {manifest.features.length} features for {personaLabel(persona).toLowerCase()}.
        </p>
      ) : null}

      {visible.length === 0 ? <p className="al-muted">No features to show.</p> : null}

      {layout === 'cards' || manifest.personas.length === 0 ? (
        <div className="al-grid">
          {visible.map((feature) => (
            <article key={feature.id} className="al-card">
              <div className="al-row al-row-between">
                <h3>{feature.title}</h3>
                {feature.tier ? <span className="al-tier">{feature.tier}</span> : null}
              </div>
              {feature.description ? <p className="al-muted">{feature.description}</p> : null}
              {feature.highlights.length > 0 ? (
                <ul className="al-list">
                  {feature.highlights.map((highlight, index) => <li key={index}>{highlight}</li>)}
                </ul>
              ) : null}
              <div className="al-tags">
                {feature.personas.map((id) => <span key={id} className="al-tag">{personaLabel(id)}</span>)}
                {feature.entities.map((entity) => (
                  <button key={entity} type="button" className="al-chip" onClick={() => onOpenData({ entity })}>
                    {manifest.entities[entity]?.label ?? entity}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="al-table-wrap">
          <table className="al-matrix">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                {manifest.personas.map((p) => <th key={p.id} scope="col">{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((feature) => (
                <tr key={feature.id}>
                  <th scope="row">{feature.title}</th>
                  {manifest.personas.map((p) => {
                    const included = feature.personas.length === 0 || feature.personas.includes(p.id);
                    return (
                      <td key={p.id} aria-label={`${p.label}: ${included ? 'included' : 'not included'}`}>
                        {included ? '✓' : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
