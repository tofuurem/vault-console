import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ThemeContext, type ThemeContextValue } from './ThemeContext';
import {
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ThemePreference,
  type ThemeStorage,
} from './theme';

interface ColorSchemeQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void;
  removeEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void;
}

interface ThemeProviderProps {
  readonly children: ReactNode;
  readonly storage?: ThemeStorage | null;
  readonly colorSchemeQuery?: ColorSchemeQuery;
}

function browserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserColorSchemeQuery(): ColorSchemeQuery {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)');
  }
  return {
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

export function ThemeProvider({
  children,
  storage: suppliedStorage,
  colorSchemeQuery: suppliedColorSchemeQuery,
}: ThemeProviderProps) {
  const [storage] = useState(
    () => suppliedStorage === undefined ? browserLocalStorage() : suppliedStorage,
  );
  const [colorSchemeQuery] = useState(
    () => suppliedColorSchemeQuery ?? browserColorSchemeQuery(),
  );
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readThemePreference(storage),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(colorSchemeQuery.matches);
  const [persistenceAvailable, setPersistenceAvailable] = useState(storage !== null);
  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  const appliedTheme = useRef<string | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const switching = appliedTheme.current !== null && appliedTheme.current !== resolvedTheme;
    appliedTheme.current = resolvedTheme;
    if (switching) root.classList.add('theme-switching');
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    if (!switching) return undefined;
    const timer = window.setTimeout(() => root.classList.remove('theme-switching'), 250);
    return () => {
      window.clearTimeout(timer);
      root.classList.remove('theme-switching');
    };
  }, [resolvedTheme]);

  useEffect(() => {
    if (preference !== 'system') return;
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(colorSchemeQuery.matches);
    colorSchemeQuery.addEventListener('change', handleChange);
    return () => colorSchemeQuery.removeEventListener('change', handleChange);
  }, [colorSchemeQuery, preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    setPersistenceAvailable(writeThemePreference(storage, nextPreference));
    if (nextPreference === 'system') setSystemPrefersDark(colorSchemeQuery.matches);
  }, [colorSchemeQuery, storage]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme,
    persistenceAvailable,
    setPreference,
  }), [persistenceAvailable, preference, resolvedTheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
