import { buildDemo, sceneAt, type Dataset, type DemoScript, type Manifest } from '@app-lens/core';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useTrack } from '../analytics';
import { canRecordVideo, recordDemo } from '../video';
import { downloadBlob, initials, mediaMatches, messageOf, slug } from '../util';
import { DemoStage, sceneCaption } from './DemoScenes';

interface DemoTheaterProps {
  manifest: Manifest;
  dataset: Dataset;
  persona: string | null;
  seed: string | number;
}

type Phase = 'idle' | 'researching' | 'ready';

const STAGE_MS = 950;
const REDUCED_STAGE_MS = 250;
const SEEK_STEP_MS = 5000;
/** Longest step of the video clock, so returning to a background tab does not skip ahead. */
const MAX_FRAME_MS = 250;

// A demo already researched for a manifest, persona and seed skips the research step this session.
const researched = new WeakMap<Manifest, Set<string>>();

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function researchStages(manifest: Manifest, script: DemoScript) {
  const { findings } = script;
  return [
    { label: 'Reading the app profile', detail: [manifest.app.name, manifest.app.category].filter(Boolean).join(' · ') },
    { label: 'Identifying who uses it', detail: plural(findings.personas, 'persona') },
    { label: 'Ranking the main features', detail: `${findings.featuresPicked} of ${plural(findings.featuresReviewed, 'feature')} selected` },
    { label: 'Mapping the data model', detail: `${plural(findings.dataTypes, 'data type')}, ${plural(findings.relationships, 'relationship')}` },
    { label: 'Scripting workflows', detail: plural(findings.workflows, 'workflow') },
    { label: 'Rendering the demo video', detail: `${plural(findings.scenes, 'scene')}, ${clock(script.durationMs)}` },
  ];
}

export function DemoTheater({ manifest, dataset, persona, seed }: DemoTheaterProps) {
  const script = useMemo(() => buildDemo(manifest, dataset, { persona, seed }), [manifest, dataset, persona, seed]);
  const cacheKey = `${persona}:${seed}`;
  const [phase, setPhase] = useState<Phase>(() => (researched.get(manifest)?.has(cacheKey) ? 'ready' : 'idle'));

  useEffect(() => {
    setPhase(researched.get(manifest)?.has(cacheKey) ? 'ready' : 'idle');
  }, [manifest, cacheKey]);

  const finishResearch = useCallback(() => {
    const keys = researched.get(manifest) ?? new Set<string>();
    keys.add(cacheKey);
    researched.set(manifest, keys);
    setPhase('ready');
  }, [manifest, cacheKey]);

  if (phase === 'idle') {
    return (
      <section className="al-demo-poster">
        <span className="al-app-mark" aria-hidden="true">{initials(manifest.app.name)}</span>
        <h2>Product demo</h2>
        <p className="al-muted">
          AppLens studies {manifest.app.name} and scripts a short video tour of what it does.
        </p>
        <button type="button" className="al-btn al-btn-primary" onClick={() => setPhase('researching')}>
          Generate demo
        </button>
      </section>
    );
  }
  if (phase === 'researching') return <Research stages={researchStages(manifest, script)} onDone={finishResearch} />;
  return <DemoVideo manifest={manifest} script={script} onResearchAgain={() => setPhase('researching')} />;
}

function Research({ stages, onDone }: { stages: { label: string; detail: string }[]; onDone: () => void }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const delay = mediaMatches('(prefers-reduced-motion: reduce)') ? REDUCED_STAGE_MS : STAGE_MS;
    if (current >= stages.length) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setCurrent((value) => value + 1), delay);
    return () => clearTimeout(timer);
  }, [current, stages.length, onDone]);

  const percent = Math.round((current / stages.length) * 100);
  return (
    <section className="al-research" aria-label="Researching the app">
      <h2>Researching…</h2>
      <div className="al-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Research progress">
        <span style={{ width: `${percent}%` }} />
      </div>
      <ol className="al-stages">
        {stages.map((stage, index) => (
          <li key={stage.label} className={index < current ? 'is-done' : index === current ? 'is-current' : undefined}>
            <span className="al-stage-mark" aria-hidden="true">{index < current ? '✓' : ''}</span>
            <span>
              {stage.label}
              {index < current ? <span className="al-muted"> — {stage.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface VideoExportProps {
  manifest: Manifest;
  script: DemoScript;
  rootRef: RefObject<HTMLElement>;
}

function VideoExport({ manifest, script, rootRef }: VideoExportProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  if (!canRecordVideo()) return null;

  const start = async () => {
    const root = rootRef.current;
    if (!root) return;
    const styles = getComputedStyle(root);
    const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    controller.current = new AbortController();
    setError(null);
    setProgress(0);
    try {
      const blob = await recordDemo(manifest, script, {
        colors: {
          primary: color('--al-primary', '#4f46e5'),
          accent: color('--al-accent', '#0ea5e9'),
          background: color('--al-bg', '#f5f6fa'),
          surface: color('--al-surface', '#ffffff'),
          border: color('--al-border', '#e3e6ee'),
          text: color('--al-text', '#1b2130'),
          muted: color('--al-muted', '#657085'),
        },
        signal: controller.current.signal,
        onProgress: setProgress,
      });
      downloadBlob(blob, `${slug(manifest.app.name) || 'app'}-demo.webm`);
    } catch (reason) {
      if (!controller.current?.signal.aborted) setError(messageOf(reason));
    } finally {
      setProgress(null);
    }
  };

  if (progress !== null) {
    return (
      <span className="al-row">
        <span className="al-muted al-num" role="status">Recording {Math.round(progress * 100)}%</span>
        <button type="button" className="al-link" onClick={() => controller.current?.abort()}>Cancel</button>
      </span>
    );
  }
  return (
    <span className="al-row">
      {error ? <span role="alert">{error}</span> : null}
      <button type="button" className="al-link" onClick={() => void start()}>Download video (WebM)</button>
    </span>
  );
}

interface ChapterListProps {
  chapters: { id: string; title: string; start: number }[];
  current: number;
  onSeek: (ms: number) => void;
}

// Memoised because the player re-renders on every animation frame.
const ChapterList = memo(function ChapterList({ chapters, current, onSeek }: ChapterListProps) {
  return (
    <div className="al-chips">
      {chapters.map((chapter, index) => (
        <button key={chapter.id} type="button" className="al-chip" aria-pressed={index === current} onClick={() => onSeek(chapter.start)}>
          {chapter.title}
        </button>
      ))}
    </div>
  );
});

interface DemoVideoProps {
  manifest: Manifest;
  script: DemoScript;
  onResearchAgain: () => void;
}

function DemoVideo({ manifest, script, onResearchAgain }: DemoVideoProps) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(() => !mediaMatches('(prefers-reduced-motion: reduce)'));
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(MAX_FRAME_MS, now - previous);
      previous = now;
      setElapsed((value) => Math.min(script.durationMs, value + delta));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, script.durationMs]);

  const track = useTrack();
  const finished = elapsed >= script.durationMs;
  useEffect(() => {
    if (!finished) return;
    setPlaying(false);
    track({ type: 'demo_completed' });
  }, [finished, track]);

  useEffect(() => {
    // Inside a shadow root, document.fullscreenElement is the host, not the player.
    const onChange = () => {
      const root = rootRef.current;
      setFullscreen(!!root && (root.getRootNode() as unknown as DocumentOrShadowRoot).fullscreenElement === root);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const position = sceneAt(script, elapsed);
  const ended = elapsed >= script.durationMs;

  const seek = useCallback(
    (value: number) => setElapsed(Math.max(0, Math.min(script.durationMs, value))),
    [script.durationMs],
  );
  const toggle = () => {
    if (ended) setElapsed(0);
    setPlaying(!playing || ended);
  };
  const toggleFullscreen = () => {
    if (fullscreen) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    if (event.key === ' ' && target.tagName === 'BUTTON') return;
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault();
      toggle();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seek(elapsed + SEEK_STEP_MS);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seek(elapsed - SEEK_STEP_MS);
    }
  };

  const chapters = useMemo(() => {
    let start = 0;
    return script.scenes.map((scene) => {
      const chapter = { id: scene.id, title: scene.title, start };
      start += scene.durationMs;
      return chapter;
    });
  }, [script]);

  return (
    <div className="al-stack">
      <section ref={rootRef} className="al-video" aria-label="Product demo video" tabIndex={0} onKeyDown={onKeyDown}>
        <div className="al-video-chrome">
          <span className="al-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="al-video-url">{slug(manifest.app.name) || 'app'}.example/{position.scene.kind}</span>
        </div>
        <div className="al-video-screen">
          <div className="al-video-stage" key={position.scene.id}>
            <DemoStage manifest={manifest} scene={position.scene} progress={position.progress} />
          </div>
          {!playing ? (
            <button type="button" className="al-video-overlay" aria-label={ended ? 'Replay' : 'Play'} onClick={toggle}>
              <span aria-hidden="true">{ended ? '↻' : '▶'}</span>
            </button>
          ) : null}
        </div>
        <p className="al-video-caption" aria-live="polite">{sceneCaption(position.scene, position.progress)}</p>
        <div className="al-video-controls">
          <button type="button" className="al-btn al-btn-ghost" onClick={toggle}>{playing ? 'Pause' : ended ? 'Replay' : 'Play'}</button>
          <button type="button" className="al-btn al-btn-ghost" onClick={() => seek(0)}>Restart</button>
          <div className="al-video-track">
            <input
              type="range"
              min={0}
              max={script.durationMs}
              step={100}
              value={elapsed}
              aria-label="Seek"
              aria-valuetext={`${clock(elapsed)} of ${clock(script.durationMs)}`}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <div className="al-video-marks" aria-hidden="true">
              {chapters.map((chapter) => <i key={chapter.id} style={{ left: `${(chapter.start / script.durationMs) * 100}%` }} />)}
            </div>
          </div>
          <span className="al-num">{clock(elapsed)} / {clock(script.durationMs)}</span>
          <button type="button" className="al-btn al-btn-ghost" onClick={toggleFullscreen}>
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </section>
      <div className="al-toolbar">
        <ChapterList chapters={chapters} current={position.index} onSeek={seek} />
        <div className="al-row">
          <VideoExport manifest={manifest} script={script} rootRef={rootRef} />
          <button type="button" className="al-link" onClick={onResearchAgain}>Research again</button>
        </div>
      </div>
    </div>
  );
}
