import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLensView, IssuesView, sanitizeTheme } from '../src';
import { formatDate, formatMoney, humanize, initials, recordIndex } from '../src/util';

const manifest = (name = 'Alpha', seed = 'alpha') => ({
  app: { name, currency: 'EUR' },
  personas: [{ id: 'admin', label: 'Admin' }, { id: 'guest', label: 'Guest' }],
  entities: {
    Thing: { count: 120, display: 'code', fields: { code: 'seq:T-###', owner: 'ref:Person', cost: 'money:1..9' } },
    Person: { count: 3, display: 'name', fields: { name: 'fullName' } },
  },
  features: [
    { id: 'a', title: 'For admins', personas: ['admin'], category: 'One', highlights: ['Same', 'Same'] },
    { id: 'b', title: 'For guests', personas: ['guest'], category: 'Two' },
  ],
  scenarios: [{ id: 's', title: 'Tour', entity: 'Thing', steps: [{ action: 'create', narration: 'Make one' }] }],
  integrations: [{ name: 'Mail' }, { name: 'Mail' }],
  mock: { seed, baseDate: '2025-01-15' },
});

afterEach(cleanup);

describe('AppLensView', () => {
  it('shows validation problems instead of a blank screen', () => {
    render(<AppLensView manifest={{ app: {} }} />);
    expect(screen.getByRole('alert').textContent).toContain('This manifest has 1 problem.');
  });

  it('renders without matchMedia', () => {
    const original = window.matchMedia;
    Reflect.deleteProperty(window, 'matchMedia');
    expect(() => render(<AppLensView manifest={manifest()} />)).not.toThrow();
    window.matchMedia = original;
  });

  it('forgets persona, focus and seed when the manifest is replaced', () => {
    const { rerender } = render(<AppLensView manifest={manifest()} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'View as persona' })).getByRole('button', { name: 'Admin' }));
    fireEvent.click(screen.getByRole('tab', { name: /Data/ }));
    fireEvent.click(screen.getByRole('button', { name: 'New sample data' }));

    const next = { ...manifest('Beta', 'beta'), personas: [{ id: 'other', label: 'Other' }] };
    next.features = next.features.map((feature) => ({ ...feature, personas: ['other'] }));
    rerender(<AppLensView manifest={next} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Beta');
    expect(screen.getByRole('button', { name: 'Everyone', pressed: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Features/ }).textContent).toContain('2');
    rerender(<AppLensView manifest={manifest('Beta', 'beta')} />);
    fireEvent.click(screen.getByRole('tab', { name: /Data/ }));
    const afterNew = document.querySelector('tbody tr')?.textContent;
    rerender(<AppLensView manifest={manifest('Gamma', 'beta')} />);
    fireEvent.click(screen.getByRole('tab', { name: /Data/ }));
    expect(document.querySelector('tbody tr')?.textContent).toBe(afterNew);
  });

  it('follows tab and persona props without losing generated data', () => {
    const value = manifest();
    const { rerender } = render(<AppLensView manifest={value} initialTab="data" />);
    fireEvent.click(screen.getByRole('button', { name: 'New sample data' }));
    const row = document.querySelector('tbody tr')?.textContent;
    rerender(<AppLensView manifest={value} initialTab="features" initialPersona="guest" />);
    expect(screen.getByRole('tab', { name: /Features/, selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guest', pressed: true })).toBeTruthy();
    rerender(<AppLensView manifest={value} initialTab="data" initialPersona="guest" />);
    expect(document.querySelector('tbody tr')?.textContent).toBe(row);
  });
});

describe('tabs', () => {
  it('link each tab to its panel', () => {
    render(<AppLensView manifest={manifest()} />);
    const tab = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('support arrow, Home and End keys with a roving tabindex', () => {
    render(<AppLensView manifest={manifest()} />);
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Features');
    expect(document.activeElement).toBe(screen.getByRole('tab', { selected: true }));
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Walkthroughs');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Overview');
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Walkthroughs');
  });
});

describe('data explorer', () => {
  const open = () => render(<AppLensView manifest={manifest()} initialTab="data" />);
  const rows = () => document.querySelectorAll('tbody tr');

  it('paginates large tables', () => {
    open();
    expect(rows()).toHaveLength(50);
    expect(screen.getByText('1–50 of 120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('51–100 of 120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(rows()).toHaveLength(20);
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('returns to the first page when the search changes', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'T-001' } });
    expect(rows()).toHaveLength(1);
  });

  it('opens a record from the keyboard', () => {
    open();
    fireEvent.keyDown(rows()[0] as Element, { key: 'Enter' });
    expect(screen.getByRole('complementary', { name: 'Record details' })).toBeTruthy();
  });

  it('clears the search when a reference jumps to another type', () => {
    open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'T-001' } });
    fireEvent.click(document.querySelector('tbody .al-link') as Element);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(rows()).toHaveLength(3);
  });

  it('shows a focused record that is on a later page', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(rows()[9] as Element);
    expect(document.querySelector('tr.is-selected')?.textContent).toContain('T-060');
  });
});

describe('demo player', () => {
  const start = () => {
    vi.useFakeTimers();
    render(<AppLensView manifest={manifest()} initialTab="scenarios" />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate demo' }));
    act(() => { vi.advanceTimersByTime(7000); });
    return screen.getByRole('region', { name: 'Product demo video' });
  };

  afterEach(() => { vi.useRealTimers(); });

  it('leaves Space on a focused button to that button', () => {
    const video = start();
    const fullscreen = within(video).getByRole('button', { name: 'Fullscreen' });
    const pause = within(video).getByRole('button', { name: 'Pause' });
    expect(fireEvent.keyDown(fullscreen, { key: ' ' })).toBe(true);
    expect(pause.textContent).toBe('Pause');
  });

  it('starts paused when the viewer prefers reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({ matches: query.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const video = start();
    expect(within(video).getAllByRole('button', { name: 'Play' }).length).toBeGreaterThan(0);
    window.matchMedia = original;
  });

  it('detects fullscreen inside a shadow root', () => {
    const video = start();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    vi.spyOn(video, 'getRootNode').mockReturnValue(shadow);
    Object.defineProperty(shadow, 'fullscreenElement', { value: video, configurable: true });
    act(() => { document.dispatchEvent(new Event('fullscreenchange')); });
    expect(within(video).getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
  });
});

describe('components', () => {
  it('renders duplicate highlight and integration names without key warnings', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppLensView manifest={manifest()} initialTab="features" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(error.mock.calls.filter(([message]) => String(message).includes('same key'))).toEqual([]);
    error.mockRestore();
  });

  it('lists issues', () => {
    render(<IssuesView issues={[{ path: 'a', message: 'one' }, { path: 'b', message: 'two' }]} />);
    expect(screen.getByRole('alert').textContent).toContain('2 problems');
  });
});

describe('sanitizeTheme', () => {
  it('keeps valid values and drops everything else', () => {
    expect(sanitizeTheme({ mode: 'dark', primary: '#fff', accent: 'red', radius: '12', font: 'Inter, serif' }))
      .toEqual({ mode: 'dark', primary: '#fff', radius: 12, font: 'Inter, serif' });
    expect(sanitizeTheme({ mode: 'neon', primary: 'url(x)', radius: '99', font: 'a;}b{' })).toEqual({});
  });
});

describe('util', () => {
  it('keeps emoji whole in initials', () => {
    expect(initials('😀 Rocket')).toBe('😀R');
  });

  it('humanizes field names', () => {
    expect(humanize('dueDate')).toBe('Due date');
    expect(humanize('first_name')).toBe('First name');
  });

  it('survives an unknown currency and invalid dates', () => {
    expect(formatMoney(1.5, 'ZZZ')).toContain('1.50');
    expect(formatDate('nope')).toBe('nope');
  });

  it('reuses number formatters', () => {
    const format = vi.spyOn(Intl, 'NumberFormat');
    formatMoney(1, 'CHF');
    formatMoney(2, 'CHF');
    expect(format.mock.calls.length).toBeLessThanOrEqual(1);
    format.mockRestore();
  });

  it('indexes records by id once per list', () => {
    const records = [{ id: 'a' }, { id: 'b' }];
    expect(recordIndex(records).get('b')).toBe(records[1]);
    expect(recordIndex(records)).toBe(recordIndex(records));
  });
});
