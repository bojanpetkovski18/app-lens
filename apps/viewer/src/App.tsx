import { AppLensView, Frame, sanitizeTheme, TABS, type Tab } from '@app-lens/ui';
import { useEffect, useMemo, useState } from 'react';
import { SourcePicker } from './components/SourcePicker';
import { pinnedManifestUrl, sampleSources, sourceFromUrl, type ManifestSource } from './sources';

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

function resolveSources(): { sources: ManifestSource[]; pinned: boolean } {
  const url = params.get('manifest') ?? pinnedManifestUrl();
  const source = url ? sourceFromUrl(url) : null;
  return source ? { sources: [source], pinned: true } : { sources: sampleSources(), pinned: false };
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; manifest: unknown };

export function App() {
  const { sources, pinned } = useMemo(resolveSources, []);
  const [activeKey, setActiveKey] = useState(() => params.get('source') ?? sources[0]?.key ?? '');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const source = sources.find((item) => item.key === activeKey);
    if (!source) {
      setState(activeKey ? { status: 'error', message: `Unknown manifest source "${activeKey}".` } : { status: 'loading' });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    source.load().then(
      (manifest) => {
        if (active) setState({ status: 'ready', manifest });
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [activeKey, sources]);

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

  const toolbar = !embedded && !pinned && sources.length > 1
    ? <SourcePicker sources={sources} value={activeKey} onChange={selectSource} />
    : undefined;

  if (state.status === 'ready') {
    return (
      <AppLensView
        key={activeKey}
        manifest={state.manifest}
        theme={themeOverrides}
        embedded={embedded}
        toolbar={toolbar}
        initialTab={initialTab}
        initialPersona={initialPersona}
      />
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
