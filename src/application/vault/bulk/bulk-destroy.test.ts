import { describe, expect, it, vi } from 'vitest';

import type {
  KvV2Gateway,
  VaultCapabilityMap,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { executeBulkDestroy, prepareBulkDestroy } from './bulk-destroy';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('test-token'),
  authMethod: 'token',
};

function gateway(): KvV2Gateway {
  return {
    listMounts: vi.fn(),
    createKvV2Mount: vi.fn(),
    listPaths: vi.fn(),
    readSecret: vi.fn(),
    writeSecret: vi.fn(),
    readSecretMetadata: vi.fn(async (_session, _mount, path) => {
      if (path === 'missing') throw new VaultError('not-found');
      return {
        createdTime: '2026-07-25T01:00:00Z',
        updatedTime: '2026-07-25T03:00:00Z',
        currentVersion: 3,
        oldestVersion: 1,
        maxVersions: 0,
        casRequired: false,
        deleteVersionAfter: '0s',
        customMetadata: {},
        versions: [
          { version: 3, createdTime: '2026-07-25T03:00:00Z', destroyed: false },
          { version: 2, createdTime: '2026-07-25T02:00:00Z', destroyed: true },
          {
            version: 1,
            createdTime: '2026-07-25T01:00:00Z',
            destroyed: false,
            deletionTime: '2026-07-25T02:30:00Z',
          },
        ],
      };
    }),
    updateSecretMetadata: vi.fn(),
    readMountConfig: vi.fn(),
    updateMountConfig: vi.fn(),
    deleteLatestSecret: vi.fn(),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(),
    destroyVersions: vi.fn(async (_session, _mount, path) => {
      if (path === 'fails') throw new VaultError('unavailable');
    }),
    deleteMetadata: vi.fn(),
  };
}

function capabilityMap(paths: readonly string[]): VaultCapabilityMap {
  return Object.fromEntries(paths.map((path) => {
    if (path.includes('/destroy/denied')) return [path, ['deny']];
    if (path.includes('/metadata/')) return [path, ['read']];
    return [path, ['update']];
  })) as VaultCapabilityMap;
}

describe('bulk destroy', () => {
  it('exposes only non-destroyed versions after exact capability preflight', async () => {
    const kv = gateway();
    const result = await prepareBulkDestroy({
      gateway: kv,
      session,
      mount: 'applications',
      paths: ['ready', 'denied', 'missing'],
      queryCapabilities: async (paths) => capabilityMap(paths),
    });

    expect(result.eligible).toEqual([{
      path: 'ready',
      versions: [
        expect.objectContaining({ version: 3, destroyed: false }),
        expect.objectContaining({ version: 1, destroyed: false }),
      ],
    }]);
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'denied', status: 'denied' }),
      expect.objectContaining({ path: 'missing', status: 'missing' }),
    ]));
    expect(kv.readSecretMetadata).not.toHaveBeenCalledWith(
      session,
      'applications',
      'denied',
      undefined,
    );
  });

  it('destroys only explicitly supplied versions and reports partial failure', async () => {
    const kv = gateway();
    const outcomes = await executeBulkDestroy({
      gateway: kv,
      session,
      mount: 'applications',
      targets: [
        { path: 'ready', versions: [3, 1, 3] },
        { path: 'ignored', versions: [] },
        { path: 'fails', versions: [2] },
      ],
    });

    expect(kv.destroyVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'ready',
      [1, 3],
      undefined,
    );
    expect(kv.destroyVersions).not.toHaveBeenCalledWith(
      session,
      'applications',
      'ignored',
      expect.anything(),
      undefined,
    );
    expect(outcomes).toEqual([
      { path: 'ready', versions: [1, 3], status: 'succeeded' },
      expect.objectContaining({
        path: 'fails',
        versions: [2],
        status: 'failed',
      }),
    ]);
  });
});
