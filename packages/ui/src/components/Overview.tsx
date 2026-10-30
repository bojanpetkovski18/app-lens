import { renderMarkdown, renderPdf, type Dataset, type Manifest } from '@app-lens/core';
import { downloadBlob, initials, isForPersona, isScenarioForPersona, slug } from '../util';
import type { DataFocus } from './DataExplorer';
import type { Tab } from './Showcase';

interface OverviewProps {
  manifest: Manifest;
  dataset: Dataset;
  persona: string | null;
  onPersona: (persona: string | null) => void;
  onTab: (tab: Tab) => void;
  onOpenData: (focus: DataFocus) => void;
}

export function Overview({ manifest, dataset, persona, onPersona, onTab, onOpenData }: OverviewProps) {
  const { app } = manifest;
  const features = manifest.features.filter((feature) => isForPersona(feature, persona));
  const records = Object.values(dataset).reduce((total, list) => total + list.length, 0);
  const entities = Object.entries(manifest.entities);
  const stats: { label: string; value: number; tab: Tab }[] = [
    { label: 'Features', value: features.length, tab: 'features' },
    { label: 'Data types', value: entities.length, tab: 'data' },
    { label: 'Sample records', value: records, tab: 'data' },
    { label: 'Walkthroughs', value: manifest.scenarios.filter((s) => isScenarioForPersona(s, persona)).length, tab: 'scenarios' },
  ];

  const fileName = slug(app.name) || 'app';

  return (
    <div className="al-stack">
      {app.description || app.website ? (
        <section className="al-card">
          {app.description ? <p>{app.description}</p> : null}
          {app.website ? (
            <a href={app.website} target="_blank" rel="noreferrer noopener">
              Visit website
            </a>
          ) : null}
          <div className="al-row">
            <span className="al-muted">One-pager:</span>
            <button type="button" className="al-link" onClick={() => downloadBlob(new Blob([renderPdf(manifest).slice()], { type: 'application/pdf' }), `${fileName}.pdf`)}>PDF</button>
            <button type="button" className="al-link" onClick={() => downloadBlob(new Blob([renderMarkdown(manifest)], { type: 'text/markdown' }), `${fileName}.md`)}>Markdown</button>
          </div>
        </section>
      ) : null}

      <div className="al-stats">
        {stats.map((stat) => (
          <button key={stat.label} type="button" className="al-stat" onClick={() => onTab(stat.tab)}>
            <span className="al-stat-value">{stat.value}</span>
            <span className="al-muted">{stat.label}</span>
          </button>
        ))}
      </div>

      {manifest.personas.length > 0 ? (
        <section className="al-stack">
          <h2>Who it&apos;s for</h2>
          <div className="al-grid">
            {manifest.personas.map((p) => (
              <article key={p.id} className="al-card">
                <div className="al-row">
                  <span className="al-avatar" aria-hidden="true">{initials(p.label)}</span>
                  <h3>{p.label}</h3>
                </div>
                {p.description ? <p className="al-muted">{p.description}</p> : null}
                {p.goals.length > 0 ? (
                  <ul className="al-list">
                    {p.goals.map((goal, index) => <li key={index}>{goal}</li>)}
                  </ul>
                ) : null}
                <button type="button" className="al-btn al-btn-ghost" aria-pressed={persona === p.id} onClick={() => onPersona(persona === p.id ? null : p.id)}>
                  {persona === p.id ? 'Show everyone' : `View as ${p.label.toLowerCase()}`}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {features.length > 0 ? (
        <section className="al-stack">
          <h2>Key capabilities</h2>
          <div className="al-grid">
            {features.slice(0, 6).map((feature) => (
              <article key={feature.id} className="al-card">
                <div className="al-row al-row-between">
                  <h3>{feature.title}</h3>
                  {feature.tier ? <span className="al-tier">{feature.tier}</span> : null}
                </div>
                {feature.description ? <p className="al-muted">{feature.description}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {entities.length > 0 ? (
        <section className="al-stack">
          <h2>What it manages</h2>
          <div className="al-grid al-grid-compact">
            {entities.map(([name, entity]) => (
              <article key={name} className="al-card">
                <h3>{entity.label ?? name}</h3>
                {entity.description ? <p className="al-muted">{entity.description}</p> : null}
                <button type="button" className="al-chip" onClick={() => onOpenData({ entity: name })}>
                  {dataset[name]?.length ?? 0} sample records
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {manifest.integrations.length > 0 ? (
        <section className="al-stack">
          <h2>Works with</h2>
          <div className="al-grid al-grid-compact">
            {manifest.integrations.map((integration, index) => (
              <article key={index} className="al-card">
                <h3>{integration.name}</h3>
                {integration.category ? <span className="al-tag">{integration.category}</span> : null}
                {integration.description ? <p className="al-muted">{integration.description}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
