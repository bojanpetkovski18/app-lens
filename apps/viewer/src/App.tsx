import { AppLensView, Frame, sanitizeTheme, TABS, type AppLensEvent, type Tab } from '@app-lens/ui';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { SourcePicker } from './components/SourcePicker';
import { pinnedManifestUrl, resolveManifestUrl, sampleSources, sourceFromUrl, type ManifestSource } from './sources';

const params = new URLSearchParams(window.location.search);
const embedded = ['1', 'true'].includes(params.get('embed') ?? '');
const tabParam = params.get('tab') as Tab | null;
const initialTab = tabParam && TABS.includes(tabParam) ? tabParam : undefined;
const initialPersona = params.get('persona') ?? undefined;
const themeOverrides = sanitizeTheme({
  mode: params.get('theme'),
  primary: params.get('primary'),
  accent: params.get('accent'),
  radius: params.get('radius'),
  font: params.get('font'),
});

function resolveSources(): { sources: ManifestSource[]; pinned: boolean; invalidUrl?: string } {
  const url = resolveManifestUrl(params.get('manifest'), pinnedManifestUrl());
  if (!url) return { sources: sampleSources(), pinned: false };
  const source = sourceFromUrl(url);
  return source ? { sources: [source], pinned: true } : { sources: [], pinned: true, invalidUrl: url };
}

// Hosts of an iframe receive interactions as messages. Without an embedder nothing is sent anywhere.
function forwardEvent(event: AppLensEvent): void {
  if (embedded && window.parent !== window) window.parent.postMessage({ type: 'app-lens:event', event }, '*');
}

// Loaded on demand because it pulls in a YAML parser.
const AttachDialog = lazy(() => import('@app-lens/ui/attach'));

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; manifest: unknown };

export function App() {
  const { sources, pinned, invalidUrl } = useMemo(resolveSources, []);
  const [activeKey, setActiveKey] = useState(() => (pinned ? sources[0]?.key : params.get('source') ?? sources[0]?.key) ?? '');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState<ManifestSource | null>(null);
  const allSources = useMemo(() => (attached ? [...sources, attached] : sources), [sources, attached]);

  useEffect(() => {
    if (invalidUrl) {
      setState({ status: 'error', message: `Only http(s) manifest URLs are allowed: ${invalidUrl}` });
      return;
    }
    const source = allSources.find((item) => item.key === activeKey);
    if (!source) {
      setState(activeKey ? { status: 'error', message: `Unknown manifest source "${activeKey}".` } : { status: 'loading' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    source.load(controller.signal).then(
      (manifest) => {
        if (!controller.signal.aborted) setState({ status: 'ready', manifest });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => controller.abort();
  }, [activeKey, allSources, invalidUrl]);

  useEffect(() => {
    if (!embedded || window.parent === window) return;
    const report = () => window.parent.postMessage({ type: 'app-lens:resize', height: document.body.scrollHeight }, '*');
    const observer = new ResizeObserver(report);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const selectSource = (key: string) => {
    setActiveKey(key);
    const url = new URL(window.location.href);
    url.searchParams.set('source', key);
    window.history.replaceState(null, '', url);
  };

  const toolbar = !embedded && !pinned ? (
    <div className="al-row">
      {allSources.length > 1 ? <SourcePicker sources={allSources} value={activeKey} onChange={selectSource} /> : null}
      <button type="button" className="al-btn" onClick={() => setAttaching(true)}>Attach project</button>
    </div>
  ) : undefined;

  const dialog = attaching ? (
    <Suspense fallback={null}>
      <AttachDialog
        onClose={() => setAttaching(false)}
        onDraft={(label, manifest) => {
          const key = `attached:${Date.now()}`;
          setAttached({ key, label, group: 'Attached', load: () => Promise.resolve(manifest) });
          setActiveKey(key);
          setAttaching(false);
        }}
      />
    </Suspense>
  ) : null;

  if (state.status === 'ready') {
    return (
      <>
      {dialog}
      <AppLensView
        key={activeKey}
        manifest={state.manifest}
        theme={themeOverrides}
        embedded={embedded}
        toolbar={toolbar}
        initialTab={initialTab}
        initialPersona={initialPersona}
        onEvent={forwardEvent}
      />
      </>
    );
  }
  return (
    <Frame overrides={themeOverrides} embedded={embedded} toolbar={toolbar}>
      {state.status === 'error' ? (
        <div className="al-alert al-alert-error" role="alert">{state.message}</div>
      ) : (
        <p className="al-muted">Loading…</p>
      )}
    </Frame>
  );
}
