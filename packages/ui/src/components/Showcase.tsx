import { generateDataset, type Manifest } from '@app-lens/core';
import { useMemo, useState, type ReactNode } from 'react';
import { Frame, type ThemeOverrides } from '../theme';
import { initials, isForPersona, isScenarioForPersona } from '../util';
import { DataExplorer, type DataFocus } from './DataExplorer';
import { Features } from './Features';
import { Overview } from './Overview';
import { ScenarioPlayer } from './ScenarioPlayer';

export const TABS = ['overview', 'features', 'data', 'scenarios'] as const;
export type Tab = (typeof TABS)[number];

export interface ShowcaseProps {
  manifest: Manifest;
  theme?: ThemeOverrides;
  embedded?: boolean;
  toolbar?: ReactNode;
  initialTab?: Tab;
  initialPersona?: string;
}

export function Showcase({ manifest, theme, embedded, toolbar, initialTab, initialPersona }: ShowcaseProps) {
  const [tab, setTab] = useState<Tab>(initialTab && TABS.includes(initialTab) ? initialTab : 'overview');
  const [persona, setPersona] = useState<string | null>(
    initialPersona && manifest.personas.some((p) => p.id === initialPersona) ? initialPersona : null,
  );
  const [seed, setSeed] = useState<string | number>(manifest.mock.seed);
  const [focus, setFocus] = useState<DataFocus | null>(null);

  const dataset = useMemo(() => generateDataset(manifest, { seed }), [manifest, seed]);
  const entityCount = Object.keys(manifest.entities).length;
  const featureCount = manifest.features.filter((feature) => isForPersona(feature, persona)).length;
  const scenarioCount = manifest.scenarios.filter((scenario) => isScenarioForPersona(scenario, persona)).length;

  const openData = (next: DataFocus) => {
    setFocus(next);
    setTab('data');
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'features', label: 'Features', count: featureCount },
    { id: 'data', label: 'Data', count: entityCount },
    { id: 'scenarios', label: 'Walkthroughs', count: scenarioCount },
  ];

  return (
    <Frame theme={manifest.app.theme} overrides={theme} embedded={embedded} toolbar={toolbar}>
      {manifest.attribution ? (
        <div className="al-alert al-alert-info">
          {manifest.attribution.text}{' '}
          {manifest.attribution.url ? (
            <a href={manifest.attribution.url} target="_blank" rel="noreferrer noopener">
              Source
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="al-app-header">
        <span className="al-app-mark" aria-hidden="true">{initials(manifest.app.name)}</span>
        <div className="al-app-title">
          {manifest.app.category ? <div className="al-eyebrow">{manifest.app.category}</div> : null}
          <h1>{manifest.app.name}</h1>
          {manifest.app.tagline ? <p className="al-muted">{manifest.app.tagline}</p> : null}
        </div>
        {manifest.personas.length > 0 ? (
          <div className="al-segmented" role="group" aria-label="View as persona">
            <button type="button" aria-pressed={persona === null} onClick={() => setPersona(null)}>
              Everyone
            </button>
            {manifest.personas.map((p) => (
              <button key={p.id} type="button" aria-pressed={persona === p.id} onClick={() => setPersona(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <nav className="al-tabs" role="tablist" aria-label="Sections">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
            {item.count !== undefined ? <span className="al-tab-count">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <main className="al-main">
        {tab === 'overview' ? (
          <Overview
            manifest={manifest}
            dataset={dataset}
            persona={persona}
            onPersona={setPersona}
            onTab={setTab}
            onOpenData={openData}
          />
        ) : null}
        {tab === 'features' ? <Features manifest={manifest} persona={persona} onOpenData={openData} /> : null}
        {tab === 'data' ? (
          <DataExplorer
            manifest={manifest}
            dataset={dataset}
            focus={focus}
            onFocus={setFocus}
            onNewData={() => setSeed(Math.floor(Math.random() * 1e9))}
          />
        ) : null}
        {tab === 'scenarios' ? <ScenarioPlayer manifest={manifest} dataset={dataset} persona={persona} seed={seed} /> : null}
      </main>

      <footer className="al-footer">
        Sample data is generated and fictional. Made with AppLens.
      </footer>
    </Frame>
  );
}
