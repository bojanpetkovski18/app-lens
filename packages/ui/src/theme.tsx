import { FONT_STACK, HEX_COLOR, THEME_MODES, type ThemeMode, type ThemeSettings } from '@app-lens/core';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Brand } from './components/Brand';

export type ThemeOverrides = Partial<ThemeSettings>;

interface RawTheme {
  mode?: string | null;
  primary?: string | null;
  accent?: string | null;
  radius?: string | number | null;
  font?: string | null;
}

/** Keeps only valid values. Attributes and URL parameters are untrusted. */
export function sanitizeTheme(raw: RawTheme): ThemeOverrides {
  const theme: ThemeOverrides = {};
  if (raw.mode && (THEME_MODES as readonly string[]).includes(raw.mode)) theme.mode = raw.mode as ThemeMode;
  if (raw.primary && HEX_COLOR.test(raw.primary)) theme.primary = raw.primary;
  if (raw.accent && HEX_COLOR.test(raw.accent)) theme.accent = raw.accent;
  if (raw.radius !== undefined && raw.radius !== null && /^\d{1,2}$/.test(String(raw.radius)) && Number(raw.radius) <= 24) {
    theme.radius = Number(raw.radius);
  }
  if (raw.font && FONT_STACK.test(raw.font)) theme.font = raw.font;
  return theme;
}

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export function useTheme(base: ThemeSettings | undefined, overrides: ThemeOverrides | undefined) {
  const prefersDark = usePrefersDark();
  return useMemo(() => {
    const defined = Object.entries(overrides ?? {}).filter(([, value]) => value !== undefined);
    const theme: ThemeSettings = { ...base, ...Object.fromEntries(defined) };
    const scheme: 'light' | 'dark' = theme.mode === 'dark' || (theme.mode === 'auto' && prefersDark) ? 'dark' : 'light';
    const style: Record<string, string> = {};
    if (theme.primary) style['--al-primary'] = theme.primary;
    if (theme.accent) style['--al-accent'] = theme.accent;
    if (theme.radius !== undefined) style['--al-radius'] = `${theme.radius}px`;
    if (theme.font) style['--al-font'] = theme.font;
    return { scheme, style: style as CSSProperties };
  }, [base, overrides, prefersDark]);
}

export interface FrameProps {
  theme?: ThemeSettings;
  overrides?: ThemeOverrides;
  embedded?: boolean;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function Frame({ theme, overrides, embedded, toolbar, children }: FrameProps) {
  const { scheme, style } = useTheme(theme, overrides);
  return (
    <div className={`al-root${embedded ? ' is-embedded' : ''}`} data-theme={scheme} style={style}>
      <div className="al-shell">
        {!embedded || toolbar ? (
          <header className="al-topbar">
            {embedded ? <span /> : <Brand />}
            {toolbar}
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
}
