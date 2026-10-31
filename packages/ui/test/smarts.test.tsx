import { buildDemo, generateDataset, parseManifest, type Manifest } from '@app-lens/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLensView, type AppLensEvent } from '../src';
import { drawDemoFrame, VIDEO_HEIGHT, VIDEO_WIDTH, type VideoColors } from '../src/video';

const input = {
  app: { name: 'Tracked', description: 'D' },
  personas: [{ id: 'a', label: 'Alpha' }],
  entities: { T: { count: 3, fields: { status: 'enum:open,done', owner: 'ref:U' } }, U: { count: 2, fields: { name: 'fullName' } } },
  features: [{ id: 'one', title: 'One', personas: ['a'], entities: ['T'], highlights: ['H'] }, { id: 'two', title: 'Two' }],
  scenarios: [{ id: 's', title: 'Tour', persona: 'a', entity: 'T', steps: [
    { action: 'create', narration: 'Make' },
    { action: 'update', narration: 'Finish', set: { status: 'done' } },
    { action: 'delete', narration: 'Bin' },
  ] }],
  integrations: [{ name: 'Mail' }],
  mock: { seed: 's', baseDate: '2025-01-15' },
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('analytics', () => {
  const events = () => {
    const seen: AppLensEvent[] = [];
    return { seen, onEvent: (event: AppLensEvent) => seen.push(event) };
  };

  it('does nothing without a handler', () => {
    expect(() => render(<AppLensView manifest={input} />)).not.toThrow();
  });

  it('reports tabs, personas and each feature once', () => {
    const { seen, onEvent } = events();
    render(<AppLensView manifest={input} onEvent={onEvent} />);
    expect(seen).toEqual([{ type: 'tab_viewed', tab: 'overview' }]);
    fireEvent.click(screen.getByRole('tab', { name: /Features/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'View as persona' })).getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('tab', { name: /Features/ }));
    expect(seen.filter((event) => event.type === 'feature_viewed')).toEqual(expect.arrayContaining([{ type: 'feature_viewed', feature: 'one' }]));
    expect(seen).toContainEqual({ type: 'persona_changed', persona: 'a' });
  });

  it('does not refire when the host passes a new callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<AppLensView manifest={input} onEvent={first} />);
    rerender(<AppLensView manifest={input} onEvent={second} />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: /Data/ }));
    expect(second).toHaveBeenCalledWith({ type: 'tab_viewed', tab: 'data' });
  });

  it('reports a finished walkthrough', () => {
    const { seen, onEvent } = events();
    render(<AppLensView manifest={input} initialTab="scenarios" onEvent={onEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /Tour/ }));
    for (let step = 0; step < 3; step++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(seen).toContainEqual({ type: 'scenario_completed', scenario: 's' });
  });
});

describe('downloads', () => {
  it('offers a one-pager and record exports', () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<AppLensView manifest={input} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    fireEvent.click(screen.getByRole('tab', { name: /Data/ }));
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(created.map((blob) => blob.type)).toEqual(['application/pdf', 'text/markdown', 'text/csv', 'application/json']);
    expect(click).toHaveBeenCalledTimes(4);
    click.mockRestore();
  });
});

describe('drawDemoFrame', () => {
  const colors: VideoColors = { primary: '#000', accent: '#111', background: '#fff', surface: '#eee', border: '#ddd', text: '#222', muted: '#333' };
  const recorder = () => {
    const calls: string[] = [];
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get: (_target, key) => {
        if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (key === 'createLinearGradient') return () => gradient;
        if (key === 'fillText') return (text: string) => calls.push(text);
        return () => {};
      },
      set: () => true,
    }) as CanvasRenderingContext2D;
    return { ctx, calls };
  };

  it('draws every scene at every point of the timeline', () => {
    const parsed = parseManifest(input);
    if (!parsed.ok) throw new Error('invalid');
    const manifest: Manifest = parsed.manifest;
    const script = buildDemo(manifest, generateDataset(manifest));
    const { ctx, calls } = recorder();
    for (let ms = 0; ms <= script.durationMs; ms += 500) drawDemoFrame(ctx, manifest, script, ms, colors);
    expect(calls).toContain('Tracked');
    expect(calls).toContain("That's Tracked");
    expect(calls.some((text) => text.includes('Make'))).toBe(true);
  });

  it('uses the 720p canvas', () => {
    expect([VIDEO_WIDTH, VIDEO_HEIGHT]).toEqual([1280, 720]);
  });

  it('hides the export button where recording is unavailable', () => {
    vi.useFakeTimers();
    render(<AppLensView manifest={input} initialTab="scenarios" />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate demo' }));
    for (let stage = 0; stage < 8; stage++) act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('button', { name: /Download video/ })).toBeNull();
  });
});
