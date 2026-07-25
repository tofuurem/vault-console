export const THEME_STORAGE_KEY = 'vault-console:theme';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export interface ThemeStorage {
  getItem?(key: string): string | null;
  setItem?(key: string, value: string): void;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string'
    && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function readThemePreference(storage: ThemeStorage | null): ThemePreference {
  try {
    const stored = storage?.getItem?.(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  storage: ThemeStorage | null,
  preference: ThemePreference,
): boolean {
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, preference);
    return storage !== null;
  } catch {
    return false;
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
