import { createContext, useContext } from 'react';

import type { ResolvedTheme, ThemePreference } from './theme';

export interface ThemeContextValue {
  readonly preference: ThemePreference;
  readonly resolvedTheme: ResolvedTheme;
  readonly persistenceAvailable: boolean;
  setPreference(preference: ThemePreference): void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
