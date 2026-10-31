import {
  displayOf,
  getEntityFields,
  scenarioStepAt,
  type DataModelScene,
  type DemoScene,
  type FeatureScene,
  type Manifest,
  type OutroScene,
  type PersonasScene,
  type ScenarioScene,
} from '@app-lens/core';
import { humanize, initials } from '../util';
import { STEP_LABELS } from './ScenarioPlayer';

const CURSOR_START_MS = 1600;
const CURSOR_ROW_MS = 1100;
const COUNT_UP_MS = 1500;

function reveal(ms: number, at: number): string {
  return ms >= at ? 'al-reveal is-in' : 'al-reveal';
}

export function sceneCaption(scene: DemoScene, progress: number): string {
  if (scene.kind === 'scenario') {
    const step = scenarioStepAt(scene, progress);
    if (step >= 0) return scene.frames[step]?.step.narration ?? scene.caption;
  }
  return scene.caption;
}

interface DemoStageProps {
  manifest: Manifest;
  scene: DemoScene;
  progress: number;
}

export function DemoStage({ manifest, scene, progress }: DemoStageProps) {
  const ms = progress * scene.durationMs;
  switch (scene.kind) {
    case 'intro':
      return (
        <div className="al-scene al-scene-center">
          <span className={`al-app-mark al-scene-mark ${reveal(ms, 0)}`} aria-hidden="true">{initials(manifest.app.name)}</span>
          {manifest.app.category ? <div className={`al-eyebrow ${reveal(ms, 500)}`}>{manifest.app.category}</div> : null}
          <div className={`al-scene-title ${reveal(ms, 800)}`}>{manifest.app.name}</div>
          <p className={`al-scene-sub ${reveal(ms, 1400)}`}>{scene.caption}</p>
        </div>
      );
    case 'personas':
      return <PersonasView scene={scene} ms={ms} />;
    case 'feature':
      return <FeatureView manifest={manifest} scene={scene} ms={ms} />;
    case 'data-model':
      return <DataModelView scene={scene} ms={ms} />;
    case 'scenario':
      return <ScenarioView manifest={manifest} scene={scene} progress={progress} />;
    case 'outro':
      return <OutroView scene={scene} ms={ms} />;
  }
}

function PersonasView({ scene, ms }: { scene: PersonasScene; ms: number }) {
  return (
    <div className="al-scene">
      <div className={`al-scene-heading ${reveal(ms, 0)}`}>{scene.title}</div>
      <div className="al-scene-grid">
        {scene.personas.map((persona, index) => (
          <div key={persona.id} className={`al-card ${reveal(ms, 500 + index * 700)}`}>
            <div className="al-row">
              <span className="al-avatar" aria-hidden="true">{initials(persona.label)}</span>
              <strong>{persona.label}</strong>
            </div>
            {persona.description ? <p className="al-muted">{persona.description}</p> : null}
            <ul className="al-list">
              {persona.goals.slice(0, 2).map((goal, index) => <li key={index}>{goal}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureView({ manifest, scene, ms }: { manifest: Manifest; scene: FeatureScene; ms: number }) {
  const { feature, records, entity } = scene;
  const hovered = ms >= CURSOR_START_MS ? Math.min(records.length - 1, Math.floor((ms - CURSOR_START_MS) / CURSOR_ROW_MS)) : -1;
  const definition = entity ? manifest.entities[entity] : undefined;
  const columns = definition ? getEntityFields(definition).filter(([, spec]) => spec.kind !== 'ref').slice(0, 3) : [];

  return (
    <div className="al-scene al-scene-split">
      <div className="al-scene-copy">
        <div className={`al-eyebrow ${reveal(ms, 0)}`}>{feature.category ?? 'Feature'}</div>
        <div className={`al-scene-heading ${reveal(ms, 200)}`}>{feature.title}</div>
        {feature.description ? <p className={`al-scene-sub ${reveal(ms, 600)}`}>{feature.description}</p> : null}
        <ul className="al-list">
          {feature.highlights.map((highlight, index) => (
            <li key={index} className={reveal(ms, 1000 + index * 700)}>{highlight}</li>
          ))}
        </ul>
      </div>
      <div className={`al-mock ${reveal(ms, 400)}`}>
        <div className="al-mock-title">{definition?.label ?? entity ?? 'Who uses it'}</div>
        {entity && records.length > 0 ? (
          <div className="al-mock-rows">
            {records.map((record, index) => (
              <div key={record.id} className={`al-mock-row${index === hovered ? ' is-hovered' : ''}`}>
                <strong>{displayOf(manifest, entity, record)}</strong>
                {columns.map(([name]) => <span key={name} className="al-muted">{String(record[name] ?? '')}</span>)}
                {index === hovered ? <span className="al-cursor" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="al-tags">
            {feature.personas.map((id) => (
              <span key={id} className="al-tag">{manifest.personas.find((p) => p.id === id)?.label ?? id}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DataModelView({ scene, ms }: { scene: DataModelScene; ms: number }) {
  const links = scene.entities.flatMap((entity) => entity.refs.map((ref) => ({ ...ref, from: entity.label })));
  return (
    <div className="al-scene">
      <div className={`al-scene-heading ${reveal(ms, 0)}`}>{scene.title}</div>
      <div className="al-scene-grid">
        {scene.entities.slice(0, 6).map((entity, index) => (
          <div key={entity.name} className={`al-card ${reveal(ms, 400 + index * 400)}`}>
            <strong>{entity.label}</strong>
            <p className="al-muted">{entity.count} records</p>
          </div>
        ))}
      </div>
      <div className="al-tags">
        {links.slice(0, 8).map((link, index) => (
          <span key={`${link.from}-${link.field}`} className={`al-tag ${reveal(ms, 2000 + index * 300)}`}>
            {link.from} → {link.target}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScenarioView({ manifest, scene, progress }: { manifest: Manifest; scene: ScenarioScene; progress: number }) {
  const step = scenarioStepAt(scene, progress);
  const frame = step >= 0 ? scene.frames[step] : undefined;
  const entity = manifest.entities[scene.scenario.entity];
  const fields = entity ? getEntityFields(entity).slice(0, 5) : [];

  return (
    <div className="al-scene al-scene-split">
      <div className="al-scene-copy">
        <div className="al-eyebrow">Walkthrough</div>
        <div className="al-scene-heading">{scene.title}</div>
        <ol className="al-steps al-steps-compact">
          {scene.scenario.steps.map((item, index) => (
            <li key={index} className={index === step ? 'is-current' : index < step ? 'is-done' : undefined}>
              <span className="al-step-label">{STEP_LABELS[item.action]}</span>
              <span>{item.narration}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="al-mock">
        <div className="al-mock-title">{entity?.label ?? scene.scenario.entity}</div>
        {frame?.removed ? (
          <p className="al-muted">{displayOf(manifest, scene.scenario.entity, frame.removed)} was removed.</p>
        ) : frame?.subject ? (
          <dl className="al-fields">
            {fields.map(([name]) => (
              <div key={name} className={frame.changed.includes(name) ? 'is-changed' : undefined}>
                <dt>{humanize(name)}</dt>
                <dd>{String(frame.subject?.[name] ?? '—')}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="al-muted">{step < 0 ? 'Getting ready…' : 'Nothing selected.'}</p>
        )}
      </div>
    </div>
  );
}

function OutroView({ scene, ms }: { scene: OutroScene; ms: number }) {
  const share = Math.min(1, ms / COUNT_UP_MS);
  return (
    <div className="al-scene al-scene-center">
      <div className={`al-scene-title ${reveal(ms, 0)}`}>{scene.title}</div>
      <div className="al-stats">
        {scene.stats.map((stat) => (
          <div key={stat.label} className="al-stat">
            <span className="al-stat-value">{Math.round(stat.value * share)}</span>
            <span className="al-muted">{stat.label}</span>
          </div>
        ))}
      </div>
      <div className={`al-tags ${reveal(ms, 1800)}`}>
        {scene.integrations.map((name, index) => <span key={index} className="al-tag">{name}</span>)}
      </div>
      <p className={`al-scene-sub ${reveal(ms, 2400)}`}>{scene.caption}</p>
    </div>
  );
}
