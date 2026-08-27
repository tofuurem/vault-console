export const THEME_STORAGE_KEY = 'vc-console:theme';
export const WORKSPACE_PREFERENCES_STORAGE_KEY =
  'vc-console:workspace-preferences:v1';
export const INSPECTOR_PREFERENCES_STORAGE_KEY =
  'vc-console:inspector-layout:v1';
export const LOCAL_FAVORITES_STORAGE_PREFIX =
  'vc-console.navigation.favorites.v1.';

export const VAULT_CONSOLE_LOCAL_STORAGE_KEYS = Object.freeze([
  THEME_STORAGE_KEY,
  WORKSPACE_PREFERENCES_STORAGE_KEY,
  INSPECTOR_PREFERENCES_STORAGE_KEY,
]);

export const LEGACY_LOCAL_STORAGE_KEY_MIGRATIONS = Object.freeze([
  ['vault-console:theme', THEME_STORAGE_KEY],
  ['vault-console:workspace-preferences:v1', WORKSPACE_PREFERENCES_STORAGE_KEY],
  ['vault-console:inspector-layout:v1', INSPECTOR_PREFERENCES_STORAGE_KEY],
] as const);

export const LEGACY_LOCAL_FAVORITES_STORAGE_PREFIX =
  'vault-console.navigation.favorites.v1.';
