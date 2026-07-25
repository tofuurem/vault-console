import { describe, expect, it, vi } from 'vitest';

import type {
  KvV2Gateway,
  VaultCapabilityMap,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import {
  executeBulkSoftDelete,
  prepareBulkSoftDelete,
  undoBulkSoftDelete,
} from './bulk-soft-delete';

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
    readSecretHistory: vi.fn(async (_session, _mount, path) => {
      if (path === 'missing') throw new VaultError('not-found');
      return {
        currentVersion: path === 'deleted' ? 4 : 3,
        oldestVersion: 1,
        customMetadata: {},
        versions: [{
          version: path === 'deleted' ? 4 : 3,
          createdTime: '2026-07-25T00:00:00Z',
          destroyed: false,
          deletionTime: path === 'deleted' ? '2026-07-25T01:00:00Z' : undefined,
        }],
      };
    }),
    deleteLatestVersion: vi.fn(async (_session, _mount, path) => {
      if (path === 'runtime-denied') throw new VaultError('authorization');
    }),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(async (_session, _mount, path) => {
      if (path === 'undo-fails') throw new VaultError('unavailable');
    }),
    destroyVersions: vi.fn(),
    deleteMetadata: vi.fn(),
  };
}

function capabilityMap(paths: readonly string[]): VaultCapabilityMap {
  return Object.fromEntries(paths.map((path) => {
    if (path.includes('/data/denied')) return [path, ['read']];
    if (path.includes('/undelete/no-undo')) return [path, ['deny']];
    if (path.includes('/metadata/')) return [path, ['read']];
    if (path.includes('/data/')) return [path, ['delete']];
    return [path, ['update']];
  })) as VaultCapabilityMap;
}

describe('bulk soft delete', () => {
  it('preflights exact versions and keeps denied or absent paths explicit', async () => {
    const kv = gateway();
    const queryCapabilities = vi.fn(async (paths: readonly string[]) => (
      capabilityMap(paths)
    ));
    const result = await prepareBulkSoftDelete({
      gateway: kv,
      session,
      mount: 'applications',
      paths: ['ready', 'denied', 'deleted', 'missing', 'no-undo', 'ready'],
      queryCapabilities,
    });

    expect(result.requestedPaths).toEqual([
      'ready',
      'denied',
      'deleted',
      'missing',
      'no-undo',
    ]);
    expect(result.eligible).toEqual([
      { path: 'ready', version: 3, canUndo: true },
      { path: 'no-undo', version: 3, canUndo: false },
    ]);
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'denied', status: 'denied' }),
      expect.objectContaining({ path: 'deleted', status: 'missing', version: 4 }),
      expect.objectContaining({ path: 'missing', status: 'missing' }),
    ]));
    expect(kv.readSecretHistory).not.toHaveBeenCalledWith(
      session,
      'applications',
      'denied',
      undefined,
    );
    expect(queryCapabilities).toHaveBeenCalledOnce();
  });

  it('returns partial execution results and undoes exact successful versions', async () => {
    const kv = gateway();
    const candidates = [
      { path: 'ready', version: 3, canUndo: true },
      { path: 'runtime-denied', version: 5, canUndo: true },
      { path: 'no-undo', version: 7, canUndo: false },
      { path: 'undo-fails', version: 9, canUndo: true },
    ];
    const outcomes = await executeBulkSoftDelete({
      gateway: kv,
      session,
      mount: 'applications',
      candidates,
    });
    expect(outcomes).toEqual([
      { path: 'ready', version: 3, status: 'succeeded' },
      expect.objectContaining({
        path: 'runtime-denied',
        version: 5,
        status: 'denied',
      }),
      { path: 'no-undo', version: 7, status: 'succeeded' },
      { path: 'undo-fails', version: 9, status: 'succeeded' },
    ]);

    const undo = await undoBulkSoftDelete({
      gateway: kv,
      session,
      mount: 'applications',
      candidates: candidates.filter((candidate) => (
        outcomes.some((outcome) => (
          outcome.path === candidate.path && outcome.status === 'succeeded'
        ))
      )),
    });
    expect(kv.undeleteVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'ready',
      [3],
      undefined,
    );
    expect(kv.undeleteVersions).not.toHaveBeenCalledWith(
      session,
      'applications',
      'no-undo',
      [7],
      undefined,
    );
    expect(undo).toEqual([
      { path: 'ready', version: 3, status: 'succeeded' },
      expect.objectContaining({
        path: 'undo-fails',
        version: 9,
        status: 'failed',
      }),
    ]);
  });
});
