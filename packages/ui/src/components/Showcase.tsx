import { generateDataset, type Manifest } from '@app-lens/core';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTrack } from '../analytics';
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
  const knownPersona = initialPersona && manifest.personas.some((p) => p.id === initialPersona) ? initialPersona : null;
  const [tab, setTab] = useState<Tab>(initialTab && TABS.includes(initialTab) ? initialTab : 'overview');
  const [persona, setPersona] = useState<string | null>(knownPersona);
  const [seed, setSeed] = useState<string | number>(manifest.mock.seed);
  const [focus, setFocus] = useState<DataFocus | null>(null);

  // Hosts can change these after mount, for example through element attributes.
  useEffect(() => {
    if (initialTab && TABS.includes(initialTab)) setTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    setPersona(knownPersona);
  }, [knownPersona]);

  // Reached only by live previews: other hosts get a new instance per manifest.
  useEffect(() => {
    setSeed(manifest.mock.seed);
  }, [manifest.mock.seed]);
  useEffect(() => {
    setPersona((current) => (current && manifest.personas.some((p) => p.id === current) ? current : null));
  }, [manifest]);

  const track = useTrack();
  const firstRender = useRef(true);
  useEffect(() => {
    track({ type: 'tab_viewed', tab });
  }, [tab, track]);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else track({ type: 'persona_changed', persona });
  }, [persona, track]);

  const idBase = useId();
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
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

  const onTabKey = (event: KeyboardEvent<HTMLElement>) => {
    const current = TABS.indexOf(tab);
    const targets: Record<string, number> = {
      ArrowRight: (current + 1) % TABS.length,
      ArrowLeft: (current - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = TABS[targets[event.key] ?? -1];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabRefs.current.get(next)?.focus();
  };

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

      <nav className="al-tabs" role="tablist" aria-label="Sections" onKeyDown={onTabKey}>
        {tabs.map((item) => (
          <button
            key={item.id}
            ref={(node) => {
              if (node) tabRefs.current.set(item.id, node);
              else tabRefs.current.delete(item.id);
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`${idBase}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.count !== undefined ? <span className="al-tab-count">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <main className="al-main">
        <div id={`${idBase}-panel`} role="tabpanel" aria-labelledby={`${idBase}-tab-${tab}`}>
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
        </div>
      </main>

      <footer className="al-footer">
        Sample data is generated and fictional. Made with AppLens.
      </footer>
    </Frame>
  );
}
