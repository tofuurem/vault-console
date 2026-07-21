import { describe, expect, it, vi } from 'vitest';

import type { VaultAccessControlGateway, VaultSession } from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { loadAccessControlSnapshot } from './useAccessControlData';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

function gateway(): VaultAccessControlGateway {
  return {
    listAuthMounts: vi.fn(async () => [
      { path: 'userpass', accessor: 'auth_userpass_123', type: 'userpass', description: '' },
      { path: 'token', accessor: 'auth_token_123', type: 'token', description: '' },
    ]),
    listPolicies: vi.fn(async () => ['default', 'vc-role-platform-readers', 'vc-user-alice', 'legacy-ops']),
    readPolicy: vi.fn(async (_session, name) => ({
      name,
      policy: name === 'vc-role-platform-readers'
        ? 'path "platform/data/*" {\n  capabilities = ["read"]\n}'
        : 'path "sys/health" {\n  capabilities = ["read"]\n}',
    })),
    writePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    listGroups: vi.fn(async () => [{
      id: 'group-1',
      name: 'platform-team',
      policies: ['vc-role-platform-readers'],
      memberEntityIds: ['entity-1'],
      memberGroupIds: [],
      metadata: {},
    }]),
    updateGroupMembers: vi.fn(),
    listUserpassAccounts: vi.fn(async () => [{ username: 'alice', mount: 'userpass', tokenPolicies: ['default'] }]),
    createUserpassAccount: vi.fn(),
    deleteUserpassAccount: vi.fn(),
    readEntityByName: vi.fn(),
    lookupEntityByAlias: vi.fn(async () => ({
      id: 'entity-1',
      name: 'Alice Operator',
      disabled: false,
      policies: ['vc-user-alice', 'legacy-ops'],
      groupIds: ['group-1'],
      aliases: [{ id: 'alias-1', name: 'alice', canonicalId: 'entity-1', mountAccessor: 'auth_userpass_123' }],
    })),
    createEntity: vi.fn(),
    deleteEntity: vi.fn(),
    createEntityAlias: vi.fn(),
    deleteEntityAlias: vi.fn(),
  };
}

describe('access-control snapshot', () => {
  it('joins userpass accounts, identity aliases, groups, roles, and external policies', async () => {
    const snapshot = await loadAccessControlSnapshot(gateway(), session);

    expect(snapshot.userpassMounts.map((mount) => mount.path)).toEqual(['userpass']);
    expect(snapshot.roles).toEqual([expect.objectContaining({
      id: 'vc-role-platform-readers',
      name: 'Platform Readers',
    })]);
    expect(snapshot.policies.map((policy) => policy.name)).toContain('legacy-ops');
    expect(snapshot.users[0]).toMatchObject({
      username: 'alice',
      displayName: 'Alice Operator',
      directPolicyNames: ['vc-user-alice'],
      externalPolicyNames: ['legacy-ops'],
    });
    expect(snapshot.users[0].groups.map((group) => group.name)).toEqual(['platform-team']);
  });
});
