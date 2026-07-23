import type { VaultAuthMethod, VaultSession } from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';

export const SESSION_STORAGE_KEY = 'vault-console.session.v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredVaultSession {
  readonly version: 1;
  readonly serverUrl: string;
  readonly token: string;
  readonly authMethod: VaultAuthMethod;
  readonly displayName?: string;
  readonly createdAt: number;
  readonly expiresAt?: number;
}

interface StoredSessionResult {
  readonly available: boolean;
  readonly session?: VaultSession;
}

function validServerUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function asStoredSession(value: unknown): StoredVaultSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<StoredVaultSession>;
  if (
    record.version !== 1
    || !validServerUrl(record.serverUrl)
    || typeof record.token !== 'string'
    || !record.token.trim()
    || !['token', 'userpass'].includes(record.authMethod ?? '')
    || typeof record.createdAt !== 'number'
    || !Number.isFinite(record.createdAt)
    || (record.displayName !== undefined && typeof record.displayName !== 'string')
    || (record.expiresAt !== undefined && (
      typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)
    ))
  ) return null;
  return record as StoredVaultSession;
}

function removeSilently(storage: StorageLike): boolean {
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createVaultSessionStorage(storage: StorageLike | null | undefined) {
  return {
    load(now = Date.now()): StoredSessionResult {
      if (!storage) return { available: false };
      let raw: string | null;
      try {
        raw = storage.getItem(SESSION_STORAGE_KEY);
      } catch {
        return { available: false };
      }
      if (!raw) return { available: true };
      let stored: StoredVaultSession | null = null;
      try {
        stored = asStoredSession(JSON.parse(raw));
      } catch {
        stored = null;
      }
      if (!stored || (stored.expiresAt !== undefined && stored.expiresAt <= now)) {
        return { available: removeSilently(storage) };
      }
      return {
        available: true,
        session: {
          serverUrl: stored.serverUrl,
          token: vaultToken(stored.token),
          authMethod: stored.authMethod,
          displayName: stored.displayName,
          expiresAt: stored.expiresAt,
        },
      };
    },

    save(session: VaultSession): boolean {
      if (!storage) return false;
      const record: StoredVaultSession = {
        version: 1,
        serverUrl: session.serverUrl,
        token: session.token.reveal(),
        authMethod: session.authMethod,
        displayName: session.displayName,
        createdAt: Date.now(),
        expiresAt: session.expiresAt,
      };
      try {
        storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
        return true;
      } catch {
        return false;
      }
    },

    clear(): boolean {
      if (!storage) return false;
      return removeSilently(storage);
    },
  };
}

export type VaultSessionStorage = ReturnType<typeof createVaultSessionStorage>;
export type { StorageLike as VaultSessionStorageLike };
