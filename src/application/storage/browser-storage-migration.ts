import {
  LEGACY_LOCAL_FAVORITES_STORAGE_PREFIX,
  LEGACY_LOCAL_STORAGE_KEY_MIGRATIONS,
  LOCAL_FAVORITES_STORAGE_PREFIX,
} from './browser-storage-keys';

export interface MigrationStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function migrateKey(storage: MigrationStorage, legacyKey: string, nextKey: string): void {
  try {
    const legacyValue = storage.getItem(legacyKey);
    if (legacyValue === null) return;

    if (storage.getItem(nextKey) === null) {
      storage.setItem(nextKey, legacyValue);
      if (storage.getItem(nextKey) === null) return;
    }

    storage.removeItem(legacyKey);
  } catch {
    // Browser storage may be unavailable or full. Keep the legacy value when
    // migration cannot be completed without losing the user's preference.
  }
}

function storageKeys(storage: MigrationStorage): readonly string[] {
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

export function migrateVaultConsoleLocalStorage(
  storage: MigrationStorage | null | undefined,
): void {
  if (!storage) return;

  for (const [legacyKey, nextKey] of LEGACY_LOCAL_STORAGE_KEY_MIGRATIONS) {
    migrateKey(storage, legacyKey, nextKey);
  }

  for (const legacyKey of storageKeys(storage)) {
    if (!legacyKey.startsWith(LEGACY_LOCAL_FAVORITES_STORAGE_PREFIX)) continue;
    const scope = legacyKey.slice(LEGACY_LOCAL_FAVORITES_STORAGE_PREFIX.length);
    if (!scope) continue;
    migrateKey(storage, legacyKey, `${LOCAL_FAVORITES_STORAGE_PREFIX}${scope}`);
  }
}

export function migrateBrowserVaultConsoleLocalStorage(): void {
  try {
    migrateVaultConsoleLocalStorage(window.localStorage);
  } catch {
    // Access can be blocked by browser privacy settings. Providers already
    // fall back to in-memory preferences when persistence is unavailable.
  }
}
