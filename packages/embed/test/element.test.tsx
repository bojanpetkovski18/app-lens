import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/index';

const manifest = { app: { name: 'Embedded' }, entities: { T: { count: 2, fields: { a: 'word' } } } };

function element(attributes: Record<string, string> = {}, inline?: string) {
  const el = document.createElement('app-lens');
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  if (inline !== undefined) {
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = inline;
    el.append(script);
  }
  return el;
}

const text = (el: HTMLElement) => el.shadowRoot?.textContent ?? '';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('<app-lens>', () => {
  it('renders a manifest set from script and fires ready', async () => {
    const el = element();
    const ready = vi.fn();
    el.addEventListener('app-lens:ready', ready);
    await act(async () => {
      document.body.append(el);
      el.manifest = manifest;
    });
    expect(text(el)).toContain('Embedded');
    expect(ready).toHaveBeenCalledOnce();
  });

  it('reports an invalid manifest as an error, not ready', async () => {
    const el = element();
    const ready = vi.fn();
    const failed = vi.fn();
    el.addEventListener('app-lens:ready', ready);
    el.addEventListener('app-lens:error', failed);
    await act(async () => {
      document.body.append(el);
      el.manifest = { app: {} };
    });
    expect(ready).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
    expect(text(el)).toContain('This manifest has 1 problem');
  });

  it('applies a manifest assigned before the element was upgraded', async () => {
    const el = document.createElement('div');
    expect(el).toBeTruthy();
    const late = element();
    Object.defineProperty(late, 'manifest', { value: manifest, configurable: true, writable: true });
    await act(async () => { document.body.append(late); });
    expect(text(late)).toContain('Embedded');
  });

  it('reads inline JSON', async () => {
    const el = element({}, JSON.stringify(manifest));
    await act(async () => { document.body.append(el); });
    expect(text(el)).toContain('Embedded');
  });

  it('waits for inline JSON that the parser has not reached yet', async () => {
    const el = element();
    await act(async () => { document.body.append(el); });
    expect(text(el)).toContain('Loading');
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = JSON.stringify(manifest);
    await act(async () => {
      el.append(script);
      await Promise.resolve();
    });
    await waitFor(() => expect(text(el)).toContain('Embedded'));
  });

  it('reports invalid inline JSON', async () => {
    const el = element({}, '{ nope');
    const failed = vi.fn();
    el.addEventListener('app-lens:error', failed);
    await act(async () => { document.body.append(el); });
    expect(text(el)).toContain('The inline manifest is not valid JSON.');
    expect(failed).toHaveBeenCalledOnce();
  });

  it('fetches src without credentials and shows HTTP errors', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const el = element({ src: 'https://example.com/m.json' });
    await act(async () => { document.body.append(el); });
    await waitFor(() => expect(text(el)).toContain('Could not load manifest (HTTP 404).'));
    expect(fetchMock.mock.calls[0]).toMatchObject([expect.any(String), { credentials: 'omit' }]);
  });

  it('refuses a non-http src', async () => {
    const el = element({ src: 'javascript:alert(1)' });
    await act(async () => { document.body.append(el); });
    await waitFor(() => expect(text(el)).toContain('Only http(s)'));
  });

  it('reports a manifest that is too large', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-length': String(6 * 1024 * 1024) } })));
    const element = document.createElement('app-lens');
    element.setAttribute('src', 'huge.json');
    const failed = new Promise<CustomEvent>((resolve) => element.addEventListener('app-lens:error', (event) => resolve(event as CustomEvent)));
    document.body.append(element);
    expect((await failed).detail.message).toMatch(/too large/);
    element.remove();
  });

  it('aborts the previous fetch when src changes', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise(() => {});
    }));
    const el = element({ src: 'https://example.com/a.json' });
    await act(async () => { document.body.append(el); });
    await act(async () => { el.setAttribute('src', 'https://example.com/b.json'); });
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('survives being removed and added back', async () => {
    const el = element();
    await act(async () => {
      document.body.append(el);
      el.manifest = manifest;
    });
    await act(async () => {
      el.remove();
      await Promise.resolve();
    });
    await act(async () => { document.body.append(el); });
    expect(text(el)).toContain('Embedded');
  });

  it('keeps generated state when the tab attribute changes', async () => {
    const el = element({ tab: 'data' });
    await act(async () => {
      document.body.append(el);
      el.manifest = manifest;
    });
    const newData = [...(el.shadowRoot?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'New sample data');
    await act(async () => { newData?.click(); });
    const row = el.shadowRoot?.querySelector('tbody tr')?.textContent;
    await act(async () => { el.setAttribute('tab', 'overview'); });
    await act(async () => { el.setAttribute('tab', 'data'); });
    expect(el.shadowRoot?.querySelector('tbody tr')?.textContent).toBe(row);
  });
});
