export const THEME_STORAGE_KEY = 'vc-console:theme';
export const OBSOLETE_DENSITY_STORAGE_KEYS = Object.freeze([
  'vc-console:workspace-preferences:v1',
  'vault-console:workspace-preferences:v1',
]);
export const INSPECTOR_PREFERENCES_STORAGE_KEY =
  'vc-console:inspector-layout:v1';
export const LOCAL_FAVORITES_STORAGE_PREFIX =
  'vc-console.navigation.favorites.v1.';

export const SESSION_PREFERENCES_STORAGE_KEY = 'vc-console:session-preferences:v1';

export const VAULT_CONSOLE_LOCAL_STORAGE_KEYS = Object.freeze([
  THEME_STORAGE_KEY,
  INSPECTOR_PREFERENCES_STORAGE_KEY,
  SESSION_PREFERENCES_STORAGE_KEY,
]);

export const LEGACY_LOCAL_STORAGE_KEY_MIGRATIONS = Object.freeze([
  ['vault-console:theme', THEME_STORAGE_KEY],
  ['vault-console:inspector-layout:v1', INSPECTOR_PREFERENCES_STORAGE_KEY],
] as const);

export const LEGACY_LOCAL_FAVORITES_STORAGE_PREFIX =
  'vault-console.navigation.favorites.v1.';

export const SESSION_STORAGE_KEY = 'vc-console.session.v1';
export const RECENT_PATHS_STORAGE_KEY = 'vc-console.navigation.recents.v1';
export const SESSION_FAVORITES_STORAGE_KEY = 'vc-console.navigation.favorites.session.v1';

export const VAULT_CONSOLE_SESSION_STORAGE_KEYS = Object.freeze([
  SESSION_STORAGE_KEY,
  RECENT_PATHS_STORAGE_KEY,
  SESSION_FAVORITES_STORAGE_KEY,
]);

/** Tab-scoped navigation keys renamed in 0.9.0. */
export const LEGACY_SESSION_STORAGE_KEY_MIGRATIONS = Object.freeze([
  ['vault-console.navigation.recents.v1', RECENT_PATHS_STORAGE_KEY],
  ['vault-console.navigation.favorites.session.v1', SESSION_FAVORITES_STORAGE_KEY],
] as const);

/**
 * The pre-0.9.0 token record is removed rather than copied, so a browser tab
 * that was open during the upgrade signs in once more and no token value is
 * ever moved between keys.
 */
export const LEGACY_SESSION_TOKEN_STORAGE_KEY = 'vault-console.session.v1';
