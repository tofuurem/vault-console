import { beforeEach, describe, expect, it, vi } from 'vitest';

import { vaultToken } from '@/domain/vault/sensitive-value';
import {
  SESSION_STORAGE_KEY,
  createVaultSessionStorage,
} from './session-storage';

describe('Vault tab session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips only the versioned Vault session fields', () => {
    const storage = createVaultSessionStorage(sessionStorage);
    const session = {
      serverUrl: 'https://vault.example.test',
      token: vaultToken('hvs.persisted'),
      authMethod: 'userpass' as const,
      displayName: 'alice',
      expiresAt: Date.parse('2030-01-02T03:04:05Z'),
    };

    expect(storage.save(session)).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toEqual({
      version: 1,
      serverUrl: 'https://vault.example.test',
      token: 'hvs.persisted',
      authMethod: 'userpass',
      displayName: 'alice',
      createdAt: expect.any(Number),
      expiresAt: Date.parse('2030-01-02T03:04:05Z'),
    });
    expect(storage.load(Date.parse('2029-01-01T00:00:00Z')).session).toMatchObject({
      serverUrl: 'https://vault.example.test',
      authMethod: 'userpass',
      displayName: 'alice',
    });
    expect(storage.load(Date.parse('2029-01-01T00:00:00Z')).session?.token.reveal()).toBe('hvs.persisted');
  });

  it('removes expired and malformed records', () => {
    const storage = createVaultSessionStorage(sessionStorage);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      serverUrl: 'https://vault.example.test',
      token: 'hvs.expired',
      authMethod: 'token',
      createdAt: 100,
      expiresAt: 200,
    }));

    expect(storage.load(201)).toEqual({ available: true });
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    sessionStorage.setItem(SESSION_STORAGE_KEY, '{"token":');
    expect(storage.load()).toEqual({ available: true });
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('degrades safely when browser storage is unavailable', () => {
    const unavailable = {
      getItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
      setItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
      removeItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
    };
    const storage = createVaultSessionStorage(unavailable);

    expect(storage.load()).toEqual({ available: false });
    expect(storage.save({
      serverUrl: 'https://vault.example.test',
      token: vaultToken('hvs.memory-only'),
      authMethod: 'token',
    })).toBe(false);
    expect(storage.clear()).toBe(false);
  });
});
