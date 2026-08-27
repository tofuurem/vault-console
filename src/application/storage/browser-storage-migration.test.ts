import { beforeEach, describe, expect, it } from 'vitest';

import {
  INSPECTOR_PREFERENCES_STORAGE_KEY,
  LOCAL_FAVORITES_STORAGE_PREFIX,
  OBSOLETE_DENSITY_STORAGE_KEYS,
  THEME_STORAGE_KEY,
  VAULT_CONSOLE_LOCAL_STORAGE_KEYS,
} from './browser-storage-keys';
import { migrateVaultConsoleLocalStorage } from './browser-storage-migration';

describe('Vault Console browser storage compatibility', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps every persistent key outside the native Vault token namespace', () => {
    expect(VAULT_CONSOLE_LOCAL_STORAGE_KEYS).not.toHaveLength(0);
    for (const key of VAULT_CONSOLE_LOCAL_STORAGE_KEYS) {
      expect(key.startsWith('vault-')).toBe(false);
    }
    expect(LOCAL_FAVORITES_STORAGE_PREFIX.startsWith('vault-')).toBe(false);
  });

  it('moves known preferences and scoped favorites without touching native Vault data', () => {
    const nativeTokenKey = 'vault-userpass☃cluster-id';
    const nativeToken = JSON.stringify({ token: 'hvs.native', policies: ['default'] });
    const favoriteScope = '0123456789abcdef';
    const favorites = JSON.stringify({ version: 1, paths: [] });

    window.localStorage.setItem('vault-console:theme', 'dark');
    window.localStorage.setItem(
      'vault-console:workspace-preferences:v1',
      JSON.stringify({ version: 1, density: 'compact' }),
    );
    window.localStorage.setItem(
      'vault-console:inspector-layout:v1',
      JSON.stringify({ placement: 'right', bottomRatio: 0.5, rightWidth: 440 }),
    );
    window.localStorage.setItem(
      `vault-console.navigation.favorites.v1.${favoriteScope}`,
      favorites,
    );
    window.localStorage.setItem(nativeTokenKey, nativeToken);

    migrateVaultConsoleLocalStorage(window.localStorage);

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    for (const key of OBSOLETE_DENSITY_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
    expect(window.localStorage.getItem(INSPECTOR_PREFERENCES_STORAGE_KEY))
      .toBe(JSON.stringify({ placement: 'right', bottomRatio: 0.5, rightWidth: 440 }));
    expect(window.localStorage.getItem(`${LOCAL_FAVORITES_STORAGE_PREFIX}${favoriteScope}`))
      .toBe(favorites);
    expect(window.localStorage.getItem(nativeTokenKey)).toBe(nativeToken);

    expect(Object.keys(window.localStorage).filter((key) => key.startsWith('vault-console')))
      .toEqual([]);
  });

  it('removes both obsolete density records without touching native Vault storage', () => {
    const nativeTokenKey = 'vault-userpass☃cluster-id';
    const nativeToken = JSON.stringify({ token: 'hvs.native' });
    for (const key of OBSOLETE_DENSITY_STORAGE_KEYS) {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, density: 'compact' }));
    }
    window.localStorage.setItem(nativeTokenKey, nativeToken);

    migrateVaultConsoleLocalStorage(window.localStorage);

    for (const key of OBSOLETE_DENSITY_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
    expect(window.localStorage.getItem(nativeTokenKey)).toBe(nativeToken);
  });

  it('prefers an existing new value and remains idempotent', () => {
    window.localStorage.setItem('vault-console:theme', 'light');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    migrateVaultConsoleLocalStorage(window.localStorage);
    migrateVaultConsoleLocalStorage(window.localStorage);

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(window.localStorage.getItem('vault-console:theme')).toBeNull();
  });

  it('does not discard a legacy value when the replacement cannot be written', () => {
    const values = new Map([['vault-console:theme', 'dark']]);
    const blockedStorage = {
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => {
        throw new DOMException('quota exceeded');
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };

    expect(() => migrateVaultConsoleLocalStorage(blockedStorage)).not.toThrow();
    expect(values.get('vault-console:theme')).toBe('dark');
    expect(values.has(THEME_STORAGE_KEY)).toBe(false);
  });
});
