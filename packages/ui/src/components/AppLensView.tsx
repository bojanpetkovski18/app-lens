import { parseManifest } from '@app-lens/core';
import { useMemo, type ReactNode } from 'react';
import { Frame, type ThemeOverrides } from '../theme';
import { IssuesView } from './IssuesView';
import { Showcase, type Tab } from './Showcase';

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
      manifest={result.manifest}
      theme={theme}
      embedded={embedded}
      toolbar={toolbar}
      initialTab={initialTab}
      initialPersona={initialPersona}
    />
  );
}
