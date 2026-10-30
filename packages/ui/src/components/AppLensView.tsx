import { parseManifest, type Manifest } from '@app-lens/core';
import { useMemo, type ReactNode } from 'react';
import { Frame, type ThemeOverrides } from '../theme';
import { IssuesView } from './IssuesView';
import { Showcase, type Tab } from './Showcase';

// Each manifest gets its own Showcase instance, so persona, seed and focus never carry over.
const manifestKeys = new WeakMap<Manifest, number>();
let nextManifestKey = 0;

function keyOf(manifest: Manifest): number {
  const key = manifestKeys.get(manifest) ?? ++nextManifestKey;
  manifestKeys.set(manifest, key);
  return key;
}

export interface AppLensViewProps {
  manifest: unknown;
  theme?: ThemeOverrides;
  embedded?: boolean;
  toolbar?: ReactNode;
  initialTab?: Tab;
  initialPersona?: string;
}

export function AppLensView({ manifest, theme, embedded, toolbar, initialTab, initialPersona }: AppLensViewProps) {
  const result = useMemo(() => parseManifest(manifest), [manifest]);
  if (!result.ok) {
    return (
      <Frame overrides={theme} embedded={embedded} toolbar={toolbar}>
        <IssuesView issues={result.issues} />
      </Frame>
    );
  }
  return (
    <Showcase
      key={keyOf(result.manifest)}
      manifest={result.manifest}
      theme={theme}
      embedded={embedded}
      toolbar={toolbar}
      initialTab={initialTab}
      initialPersona={initialPersona}
    />
  );
}
