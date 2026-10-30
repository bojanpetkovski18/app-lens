import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

export type AppLensEvent =
  | { type: 'tab_viewed'; tab: string }
  | { type: 'persona_changed'; persona: string | null }
  | { type: 'feature_viewed'; feature: string }
  | { type: 'scenario_completed'; scenario: string }
  | { type: 'demo_completed' };

type Track = (event: AppLensEvent) => void;

const AnalyticsContext = createContext<Track>(() => {});

export function useTrack(): Track {
  return useContext(AnalyticsContext);
}

export function AnalyticsProvider({ onEvent, children }: { onEvent?: Track; children: ReactNode }) {
  // Kept in a ref so a new callback from the host does not re-fire effects that depend on track.
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const track = useCallback<Track>((event) => handler.current?.(event), []);
  return <AnalyticsContext.Provider value={track}>{children}</AnalyticsContext.Provider>;
}
