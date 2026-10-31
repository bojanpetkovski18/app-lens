import { displayOf, sceneAt, scenarioStepAt, type DemoScene, type DemoScript, type Manifest } from '@app-lens/core';
import { initials } from './util';

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
const FPS = 30;
const CHROME_HEIGHT = 44;
const CAPTION_HEIGHT = 64;
const PADDING = 64;
const FADE_MS = 400;
const VISIBLE_STEPS = 7;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface VideoColors {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
}

type Ctx = CanvasRenderingContext2D;

function fit(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(ctx: Ctx, text: string, x: number, y: number, width: number, lineHeight: number, maxLines = 3): number {
  const lines = fit(ctx, text, width);
  lines.slice(0, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + Math.min(lines.length, maxLines) * lineHeight;
}

function roundedRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function card(ctx: Ctx, colors: VideoColors, x: number, y: number, width: number, height: number): void {
  roundedRect(ctx, x, y, width, height, 12);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.stroke();
}

const fadeIn = (ms: number, at: number): number => Math.max(0, Math.min(1, (ms - at) / FADE_MS));

function setFont(ctx: Ctx, size: number, weight = 400): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function drawGrid(ctx: Ctx, colors: VideoColors, ms: number, top: number, items: { title: string; lines: string[] }[]): void {
  const columns = Math.min(3, Math.max(1, items.length));
  const gap = 20;
  const width = (VIDEO_WIDTH - PADDING * 2 - gap * (columns - 1)) / columns;
  const height = 150;
  items.slice(0, 6).forEach((item, index) => {
    const x = PADDING + (index % columns) * (width + gap);
    const y = top + Math.floor(index / columns) * (height + gap);
    ctx.globalAlpha = fadeIn(ms, 500 + index * 500);
    card(ctx, colors, x, y, width, height);
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.text;
    setFont(ctx, 21, 650);
    ctx.fillText(item.title, x + 20, y + 38, width - 40);
    ctx.fillStyle = colors.muted;
    setFont(ctx, 16);
    let lineY = y + 68;
    for (const line of item.lines) lineY = paragraph(ctx, line, x + 20, lineY, width - 40, 22, 2);
  });
  ctx.globalAlpha = 1;
}

function drawScene(ctx: Ctx, manifest: Manifest, scene: DemoScene, progress: number, colors: VideoColors): void {
  const ms = progress * scene.durationMs;
  const top = CHROME_HEIGHT + PADDING;
  const middle = (CHROME_HEIGHT + VIDEO_HEIGHT - CAPTION_HEIGHT) / 2;

  const heading = (text: string) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.text;
    setFont(ctx, 40, 700);
    ctx.fillText(text, PADDING, top + 20, VIDEO_WIDTH - PADDING * 2);
  };

  switch (scene.kind) {
    case 'intro': {
      const size = 96;
      const x = VIDEO_WIDTH / 2 - size / 2;
      const y = middle - 150;
      ctx.globalAlpha = fadeIn(ms, 0);
      const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
      gradient.addColorStop(0, colors.primary);
      gradient.addColorStop(1, colors.accent);
      roundedRect(ctx, x, y, size, size, 22);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      setFont(ctx, 36, 700);
      ctx.fillText(initials(manifest.app.name), VIDEO_WIDTH / 2, y + 61);
      ctx.globalAlpha = fadeIn(ms, 800);
      ctx.fillStyle = colors.text;
      setFont(ctx, 64, 750);
      ctx.fillText(manifest.app.name, VIDEO_WIDTH / 2, middle + 40, VIDEO_WIDTH - PADDING * 2);
      ctx.globalAlpha = fadeIn(ms, 1400);
      ctx.fillStyle = colors.muted;
      setFont(ctx, 26);
      paragraph(ctx, scene.caption, VIDEO_WIDTH / 2, middle + 92, VIDEO_WIDTH - PADDING * 4, 34);
      break;
    }
    case 'personas':
      heading(scene.title);
      drawGrid(ctx, colors, ms, top + 60, scene.personas.map((persona) => ({ title: persona.label, lines: persona.description ? [persona.description] : persona.goals.slice(0, 2) })));
      break;
    case 'feature': {
      const split = VIDEO_WIDTH / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.primary;
      setFont(ctx, 17, 650);
      ctx.fillText((scene.feature.category ?? 'Feature').toUpperCase(), PADDING, top + 10);
      ctx.fillStyle = colors.text;
      setFont(ctx, 38, 700);
      let y = paragraph(ctx, scene.title, PADDING, top + 58, split - PADDING - 24, 46, 2);
      ctx.fillStyle = colors.muted;
      setFont(ctx, 20);
      y = paragraph(ctx, scene.feature.description ?? '', PADDING, y + 12, split - PADDING - 24, 28);
      ctx.fillStyle = colors.text;
      setFont(ctx, 18);
      scene.feature.highlights.slice(0, 4).forEach((highlight, index) => {
        ctx.globalAlpha = fadeIn(ms, 1000 + index * 700);
        ctx.fillText(`•  ${highlight}`, PADDING, y + 26 + index * 30, split - PADDING - 24);
      });
      ctx.globalAlpha = fadeIn(ms, 400);
      const width = VIDEO_WIDTH - split - PADDING;
      const height = 340;
      card(ctx, colors, split, top, width, height);
      ctx.fillStyle = colors.muted;
      setFont(ctx, 15, 650);
      ctx.fillText(scene.entity ? manifest.entities[scene.entity]?.label ?? scene.entity : 'Who uses it', split + 20, top + 34);
      const rows = scene.entity
        ? scene.records.map((record) => displayOf(manifest, scene.entity as string, record))
        : scene.feature.personas.map((id) => manifest.personas.find((persona) => persona.id === id)?.label ?? id);
      setFont(ctx, 19);
      const hovered = Math.floor((ms - 1600) / 1100);
      rows.slice(0, 4).forEach((row, index) => {
        const rowY = top + 56 + index * 62;
        if (index === hovered) {
          ctx.fillStyle = colors.border;
          roundedRect(ctx, split + 12, rowY, width - 24, 52, 8);
          ctx.fill();
        }
        ctx.fillStyle = colors.text;
        ctx.fillText(row, split + 28, rowY + 33, width - 56);
      });
      ctx.globalAlpha = 1;
      break;
    }
    case 'data-model':
      heading(scene.title);
      drawGrid(ctx, colors, ms, top + 60, scene.entities.map((entity) => ({
        title: entity.label,
        lines: [`${entity.count} records`, ...entity.refs.slice(0, 2).map((ref) => `Linked to ${ref.target}`)],
      })));
      break;
    case 'scenario': {
      heading(scene.title);
      const step = scenarioStepAt(scene, progress);
      setFont(ctx, 20);
      // Long walkthroughs scroll, so the current step is always on screen.
      const first = Math.max(0, Math.min(step - 3, scene.scenario.steps.length - VISIBLE_STEPS));
      scene.scenario.steps.slice(first, first + VISIBLE_STEPS).forEach((item, offset) => {
        const index = first + offset;
        const y = top + 64 + offset * 58;
        if (index === step) {
          ctx.fillStyle = colors.primary;
          roundedRect(ctx, PADDING, y, VIDEO_WIDTH - PADDING * 2, 50, 10);
          ctx.fill();
        }
        ctx.fillStyle = index === step ? '#ffffff' : index < step ? colors.text : colors.muted;
        ctx.fillText(`${index + 1}.  ${item.narration}`, PADDING + 18, y + 32, VIDEO_WIDTH - PADDING * 2 - 36);
      });
      break;
    }
    case 'outro': {
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.text;
      setFont(ctx, 54, 750);
      ctx.fillText(scene.title, VIDEO_WIDTH / 2, middle - 90, VIDEO_WIDTH - PADDING * 2);
      const share = Math.min(1, ms / 1500);
      scene.stats.forEach((stat, index) => {
        const x = VIDEO_WIDTH / 2 + (index - (scene.stats.length - 1) / 2) * 240;
        ctx.fillStyle = colors.primary;
        setFont(ctx, 58, 700);
        ctx.fillText(String(Math.round(stat.value * share)), x, middle + 10);
        ctx.fillStyle = colors.muted;
        setFont(ctx, 20);
        ctx.fillText(stat.label, x, middle + 44);
      });
      ctx.globalAlpha = fadeIn(ms, 1800);
      setFont(ctx, 20);
      ctx.fillText(scene.integrations.join('  ·  '), VIDEO_WIDTH / 2, middle + 110, VIDEO_WIDTH - PADDING * 2);
      ctx.globalAlpha = 1;
      break;
    }
  }
}

function caption(script: DemoScript, elapsedMs: number): string {
  const { scene, progress } = sceneAt(script, elapsedMs);
  if (scene.kind === 'scenario') {
    const step = scenarioStepAt(scene, progress);
    if (step >= 0) return scene.frames[step]?.step.narration ?? scene.caption;
  }
  return scene.caption;
}

/** Draws one frame. Everything derives from elapsedMs, as in the on-screen player. */
export function drawDemoFrame(ctx: Ctx, manifest: Manifest, script: DemoScript, elapsedMs: number, colors: VideoColors): void {
  const { scene, progress } = sceneAt(script, elapsedMs);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, VIDEO_WIDTH, CHROME_HEIGHT);
  ctx.fillStyle = colors.border;
  for (const x of [22, 42, 62]) {
    ctx.beginPath();
    ctx.arc(x, CHROME_HEIGHT / 2, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CHROME_HEIGHT, VIDEO_WIDTH, VIDEO_HEIGHT - CHROME_HEIGHT - CAPTION_HEIGHT);
  ctx.clip();
  drawScene(ctx, manifest, scene, progress, colors);
  ctx.restore();

  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, VIDEO_HEIGHT - CAPTION_HEIGHT, VIDEO_WIDTH, CAPTION_HEIGHT);
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, VIDEO_HEIGHT - CAPTION_HEIGHT, (VIDEO_WIDTH * elapsedMs) / script.durationMs, 3);
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  setFont(ctx, 21);
  ctx.fillText(caption(script, elapsedMs), VIDEO_WIDTH / 2, VIDEO_HEIGHT - 24, VIDEO_WIDTH - PADDING * 2);
}

export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export interface RecordOptions {
  colors: VideoColors;
  signal?: AbortSignal;
  onProgress?: (share: number) => void;
}

/** Records in real time, so it takes as long as the demo and keeps working in a background tab. */
export function recordDemo(manifest: Manifest, script: DemoScript, { colors, signal, onProgress }: RecordOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = VIDEO_WIDTH;
    canvas.height = VIDEO_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('This browser cannot draw the video.'));
      return;
    }
    drawDemoFrame(ctx, manifest, script, 0, colors);

    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      reject(new Error('This browser cannot record WebM video.'));
      return;
    }
    const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    const started = performance.now();
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const timer = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(timer);
        recorder.onstop = () => reject(new DOMException('Cancelled', 'AbortError'));
        recorder.stop();
        return;
      }
      const elapsed = performance.now() - started;
      drawDemoFrame(ctx, manifest, script, Math.min(elapsed, script.durationMs), colors);
      onProgress?.(Math.min(1, elapsed / script.durationMs));
      if (elapsed >= script.durationMs) {
        clearInterval(timer);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
        recorder.stop();
      }
    }, 1000 / FPS);
    recorder.onerror = () => {
      clearInterval(timer);
      reject(new Error('Recording failed.'));
    };
    recorder.start(1000);
  });
}
