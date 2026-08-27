import { describe, expect, it, vi } from 'vitest';

import type {
  KvV2Gateway,
  VaultCapabilityMap,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import {
  executeBulkDeleteKeys,
  prepareBulkDeleteKeys,
} from './bulk-delete-keys';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.bulk-delete'),
  authMethod: 'token',
};

function gateway(): KvV2Gateway {
  return {
    listMounts: vi.fn(),
    createKvV2Mount: vi.fn(),
    listPaths: vi.fn(),
    readSecret: vi.fn(),
    writeSecret: vi.fn(),
    readSecretMetadata: vi.fn(),
    updateSecretMetadata: vi.fn(),
    readMountConfig: vi.fn(),
    updateMountConfig: vi.fn(),
    deleteLatestSecret: vi.fn(),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(),
    destroyVersions: vi.fn(),
    deleteMetadata: vi.fn(async (_session, _mount, path) => {
      if (path === 'missing') throw new VaultError('not-found');
      if (path === 'runtime-denied') throw new VaultError('authorization');
      if (path === 'failed') throw new VaultError('unavailable');
    }),
  };
}

describe('bulk permanent key deletion', () => {
  it('sorts and deduplicates targets while excluding known denial', async () => {
    const queryCapabilities = vi.fn(async (paths: readonly string[]): Promise<VaultCapabilityMap> => (
      Object.fromEntries(paths.map((path) => [
        path,
        path.endsWith('/denied') ? ['deny'] : ['delete'],
      ])) as VaultCapabilityMap
    ));

    const result = await prepareBulkDeleteKeys({
      mount: 'applications',
      paths: ['ready', 'denied', 'alpha', 'ready'],
      queryCapabilities,
    });

    expect(result.requestedPaths).toEqual(['alpha', 'denied', 'ready']);
    expect(result.eligible).toEqual([{ path: 'alpha' }, { path: 'ready' }]);
    expect(result.excluded).toEqual([expect.objectContaining({
      path: 'denied',
      status: 'denied',
    })]);
  });

  it('keeps every target eligible when capability discovery is unavailable', async () => {
    const result = await prepareBulkDeleteKeys({
      mount: 'applications',
      paths: ['one', 'two'],
      queryCapabilities: vi.fn(async () => {
        throw new VaultError('authorization', { status: 403 });
      }),
    });

    expect(result.eligible).toEqual([{ path: 'one' }, { path: 'two' }]);
    expect(result.excluded).toEqual([]);
  });

  it('reports per-key success, missing, denial, and failure', async () => {
    const outcomes = await executeBulkDeleteKeys({
      gateway: gateway(),
      session,
      mount: 'applications',
      candidates: [
        { path: 'ready' },
        { path: 'missing' },
        { path: 'runtime-denied' },
        { path: 'failed' },
      ],
    });

    expect(outcomes).toEqual([
      expect.objectContaining({ path: 'ready', status: 'succeeded' }),
      expect.objectContaining({ path: 'missing', status: 'missing' }),
      expect.objectContaining({ path: 'runtime-denied', status: 'denied' }),
      expect.objectContaining({ path: 'failed', status: 'failed' }),
    ]);
  });
});
