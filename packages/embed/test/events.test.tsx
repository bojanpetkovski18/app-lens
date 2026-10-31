import { act, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '../src/index';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

it('re-dispatches interactions as composed app-lens:event events', async () => {
  const el = document.createElement('app-lens');
  const listener = vi.fn();
  document.addEventListener('app-lens:event', listener);
  await act(async () => {
    document.body.append(el);
    el.manifest = { app: { name: 'A' }, features: [{ id: 'f', title: 'F' }] };
  });
  const tab = [...(el.shadowRoot?.querySelectorAll('[role=tab]') ?? [])].find((item) => item.textContent?.startsWith('Features')) as HTMLElement;
  await act(async () => { tab.click(); });
  const events = listener.mock.calls.map(([event]) => (event as CustomEvent).detail);
  expect(events).toContainEqual({ type: 'tab_viewed', tab: 'features' });
  expect(events).toContainEqual({ type: 'feature_viewed', feature: 'f' });
  document.removeEventListener('app-lens:event', listener);
});
