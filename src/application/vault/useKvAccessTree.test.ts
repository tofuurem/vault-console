import { describe, expect, it, vi } from 'vitest';

import type { KvV2Gateway, VaultSession } from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { discoverKvAccessTree } from './useKvAccessTree';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

describe('KV access tree discovery', () => {
  it('turns Vault LIST folder markers into bounded folder and secret nodes', async () => {
    const gateway = {
      listPaths: vi.fn(async (_session, _mount, path) => path === '' ? ['billing/', 'shared'] : ['database']),
    } as unknown as KvV2Gateway;

    const tree = await discoverKvAccessTree(gateway, session, [
      { path: 'applications', accessor: 'kv_apps', description: '', version: 2 },
    ]);

    expect(tree).toEqual([
      expect.objectContaining({
        id: 'applications:',
        children: [
          expect.objectContaining({ id: 'applications:billing', target: 'folder', children: [
            expect.objectContaining({ id: 'applications:billing/database', target: 'secret' }),
          ] }),
          expect.objectContaining({ id: 'applications:shared', target: 'secret' }),
        ],
      }),
    ]);
  });
});
