import { displayOf, getEntityFields, runScenario, type Dataset, type Manifest, type Scenario, type ScenarioStep } from '@app-lens/core';
import { useEffect, useMemo, useState } from 'react';
import { useTrack } from '../analytics';
import { humanize, isScenarioForPersona } from '../util';
import { DemoTheater } from './DemoTheater';
import { FieldValue } from './FieldValue';

interface ScenarioPlayerProps {
  manifest: Manifest;
  dataset: Dataset;
  persona: string | null;
  seed: string | number;
}

const DEMO_ID = '__demo__';
const FIRST_STEP_DELAY_MS = 400;
const STEP_DELAY_MS = 2200;
const PREVIEW_ROWS = 6;
const PREVIEW_COLUMNS = 4;

export const STEP_LABELS: Record<ScenarioStep['action'], string> = {
  create: 'Create',
  select: 'Open',
  update: 'Update',
  delete: 'Delete',
  note: 'Info',
};

export function ScenarioPlayer({ manifest, dataset, persona, seed }: ScenarioPlayerProps) {
  const scenarios = useMemo(
    () => manifest.scenarios.filter((scenario) => isScenarioForPersona(scenario, persona)),
    [manifest, persona],
  );
  const [selected, setSelected] = useState(DEMO_ID);
  const scenario = scenarios.find((item) => item.id === selected);

  return (
    <div className="al-explorer al-explorer-player">
      <nav className="al-entity-list" aria-label="Walkthroughs">
        <div className="al-eyebrow">Walkthroughs</div>
        <button type="button" aria-current={!scenario ? 'true' : undefined} onClick={() => setSelected(DEMO_ID)}>
          <span>Product demo</span>
          <span className="al-tab-count">Video</span>
        </button>
        {scenarios.map((item) => (
          <button key={item.id} type="button" aria-current={item.id === selected ? 'true' : undefined} onClick={() => setSelected(item.id)}>
            <span>{item.title}</span>
            <span className="al-tab-count">{item.steps.length}</span>
          </button>
        ))}
      </nav>
      <div className="al-explorer-main">
        {scenario ? (
          <Player key={scenario.id} manifest={manifest} dataset={dataset} scenario={scenario} seed={seed} />
        ) : (
          <DemoTheater manifest={manifest} dataset={dataset} persona={persona} seed={seed} />
        )}
      </div>
    </div>
  );
}

interface PlayerProps {
  manifest: Manifest;
  dataset: Dataset;
  scenario: Scenario;
  seed: string | number;
}

function Player({ manifest, dataset, scenario, seed }: PlayerProps) {
  const frames = useMemo(() => runScenario(manifest, dataset, scenario, { seed }), [manifest, dataset, scenario, seed]);
  const [position, setPosition] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;
  const frame = position >= 0 ? frames[position] : undefined;
  const entity = manifest.entities[scenario.entity];
  const fields = entity ? getEntityFields(entity) : [];
  const atEnd = position >= last;
  const track = useTrack();

  useEffect(() => {
    if (position === last) track({ type: 'scenario_completed', scenario: scenario.id });
  }, [position, last, scenario.id, track]);

  useEffect(() => {
    if (!playing) return;
    if (position >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setPosition((value) => value + 1), position < 0 ? FIRST_STEP_DELAY_MS : STEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [playing, position, last]);

  const togglePlay = () => {
    if (atEnd) setPosition(-1);
    setPlaying(!playing || atEnd);
  };
  const stepTo = (next: number) => {
    setPlaying(false);
    setPosition(Math.max(-1, Math.min(last, next)));
  };

  const rows = (frame?.records ?? dataset[scenario.entity] ?? []).slice(0, PREVIEW_ROWS);

  return (
    <div className="al-stack">
      <div>
        <h2>{scenario.title}</h2>
        {scenario.description ? <p className="al-muted">{scenario.description}</p> : null}
      </div>

      <ol className="al-steps">
        {scenario.steps.map((step, index) => (
          <li key={index} className={index === position ? 'is-current' : index < position ? 'is-done' : undefined}>
            <span className="al-step-label">{STEP_LABELS[step.action]}</span>
            <span>{step.narration}</span>
          </li>
        ))}
      </ol>

      <div className="al-row al-controls">
        <button type="button" className="al-btn al-btn-ghost" onClick={() => stepTo(-1)}>Restart</button>
        <button type="button" className="al-btn al-btn-ghost" disabled={position < 0} onClick={() => stepTo(position - 1)}>Back</button>
        <button type="button" className="al-btn al-btn-primary" onClick={togglePlay}>
          {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <button type="button" className="al-btn al-btn-ghost" disabled={atEnd} onClick={() => stepTo(position + 1)}>Next</button>
        <span className="al-muted">Step {Math.max(0, position + 1)} of {frames.length}</span>
      </div>

      <p className="al-narration" aria-live="polite">
        {frame ? frame.step.narration : 'Press Play to start the walkthrough.'}
      </p>

      {frame?.removed ? (
        <div className="al-alert al-alert-info">{displayOf(manifest, scenario.entity, frame.removed)} was removed.</div>
      ) : null}

      {frame?.subject ? (
        <section className="al-card" aria-label="Current record">
          <h3>{displayOf(manifest, scenario.entity, frame.subject)}</h3>
          <dl className="al-fields">
            {fields.map(([name, spec]) => (
              <div key={name} className={frame.changed.includes(name) ? 'is-changed' : undefined}>
                <dt>{humanize(name)}</dt>
                <dd><FieldValue value={frame.subject?.[name]} spec={spec} manifest={manifest} dataset={dataset} /></dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="al-table-wrap" role="region" aria-label="Records" tabIndex={0}>
        <table className="al-table">
          <thead>
            <tr>{fields.slice(0, PREVIEW_COLUMNS).map(([name]) => <th key={name} scope="col">{humanize(name)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.id} className={record.id === frame?.subject?.id ? 'is-selected' : undefined}>
                {fields.slice(0, PREVIEW_COLUMNS).map(([name, spec]) => (
                  <td key={name}><FieldValue value={record[name]} spec={spec} manifest={manifest} dataset={dataset} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
