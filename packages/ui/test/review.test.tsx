import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLensView } from '../src';
import AttachDialog, { readSelectedFiles } from '../src/AttachDialog';

const manifest = {
  app: { name: 'Alpha' },
  personas: [{ id: 'admin', label: 'Admin' }, { id: 'guest', label: 'Guest' }],
  entities: {
    Person: { count: 2, display: 'code', fields: { code: 'seq:P-###' } },
    Thing: { count: 4, fields: { label: 'word', owner: 'ref:Person' } },
  },
  features: [{ id: 'a', title: 'Only admins', personas: ['admin', 'admin'] }],
  scenarios: [{ id: 's', title: 'Tour', entity: 'Person', steps: [{ action: 'note', narration: 'First' }, { action: 'note', narration: 'Second' }, { action: 'note', narration: 'Third' }] }],
  mock: { seed: 'alpha', baseDate: '2025-01-15' },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('data search', () => {
  it('finds records by the linked name that the table shows', () => {
    render(<AppLensView manifest={manifest} initialTab="data" />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Data types' })).getByRole('button', { name: /Thing/ }));
    const rows = () => screen.getByRole('region', { name: 'Records' }).querySelectorAll('tbody tr').length;
    const name = screen.getByRole('region', { name: 'Records' }).querySelector('tbody .al-link')?.textContent ?? '';
    expect(name).toMatch(/^P-/);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: name } });
    expect(rows()).toBeGreaterThan(0);
  });
});

describe('overview', () => {
  it('offers the one-pager without a description or website', () => {
    render(<AppLensView manifest={manifest} />);
    expect(screen.getByRole('button', { name: 'PDF' })).toBeTruthy();
  });

  it('uses the singular for one record', () => {
    render(<AppLensView manifest={{ ...manifest, entities: { Person: { count: 1, fields: { code: 'seq:P-###' } } }, scenarios: [] }} />);
    expect(screen.getByRole('button', { name: '1 sample record' })).toBeTruthy();
  });
});

describe('features', () => {
  it('does not warn about a persona listed twice', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppLensView manifest={manifest} initialTab="features" />);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('walkthrough player', () => {
  it('stays in range when the walkthrough gets shorter in a live preview', () => {
    const { rerender } = render(<AppLensView manifest={manifest} initialTab="scenarios" stateKey="live" />);
    fireEvent.click(screen.getByRole('button', { name: /^Tour/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const shorter = { ...manifest, scenarios: [{ ...manifest.scenarios[0], steps: manifest.scenarios[0]?.steps.slice(0, 1) }] };
    rerender(<AppLensView manifest={shorter} initialTab="scenarios" stateKey="live" />);
    expect(screen.getByText('Step 1 of 1')).toBeTruthy();
  });
});

describe('demo player', () => {
  const open = () => {
    render(<AppLensView manifest={manifest} initialTab="scenarios" />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Generate demo' }));
    for (let step = 0; step < 8; step++) act(() => { vi.advanceTimersByTime(1000); });
    vi.useRealTimers();
    return screen.getByRole('region', { name: 'Product demo video' });
  };

  it('hides fullscreen where the browser does not allow it', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    const video = open();
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
    expect(within(video).queryByRole('button', { name: 'Fullscreen' })).toBeNull();
  });

  it('starts again when the persona changes', () => {
    const both = { ...manifest, features: [{ id: 'a', title: 'Admins', personas: ['admin'] }, { id: 'b', title: 'Guests', personas: ['guest'] }] };
    const research = () => {
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Generate demo' }));
      for (let step = 0; step < 8; step++) act(() => { vi.advanceTimersByTime(1000); });
      vi.useRealTimers();
    };
    const persona = (name: string) => fireEvent.click(within(screen.getByRole('group', { name: 'View as persona' })).getByRole('button', { name }));
    render(<AppLensView manifest={both} initialTab="scenarios" />);
    research();
    persona('Admin');
    research();
    persona('Everyone');
    const slider = screen.getByRole('slider', { name: 'Seek' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: slider.max } });
    persona('Admin');
    expect((screen.getByRole('slider', { name: 'Seek' }) as HTMLInputElement).value).toBe('0');
  });
});

describe('attach dialog', () => {
  const file = (path: string, size: number) => {
    const item = new File([new Uint8Array(size)], path.split('/').pop() ?? path);
    Object.defineProperty(item, 'webkitRelativePath', { value: path });
    return item;
  };

  it('stops reading a folder at a total size', async () => {
    const files = Array.from({ length: 80 }, (_, index) => file(`project/file${index}.md`, 500 * 1024));
    const read = await readSelectedFiles(files);
    expect(read.reduce((total, item) => total + item.text.length, 0)).toBeLessThanOrEqual(32 * 1024 * 1024);
    expect(read.length).toBeLessThan(80);
  });

  it('explains that a static host cannot attach a link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Method not allowed</html>', { status: 405 })));
    render(<AttachDialog onClose={() => {}} onDraft={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'GitHub link' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://github.com/o/r' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft manifest' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This needs a server');
  });

  it('reports a server error that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502 })));
    render(<AttachDialog onClose={() => {}} onDraft={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'GitHub link' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://github.com/o/r' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft manifest' }));
    expect((await screen.findByRole('alert')).textContent).toContain('HTTP 502');
  });
});
