import { describe, expect, it, vi } from 'vitest';

import type {
  VaultAccessControlGateway,
  VaultAuthMount,
  VaultSession,
} from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { VaultError } from '@/domain/vault/errors';
import {
  loadUserDetails,
  loadUserpassUsers,
  type AccessControlUserRecord,
} from './useAccessControlData';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

function gateway(): VaultAccessControlGateway {
  return {
    listAuthMounts: vi.fn(),
    listPolicies: vi.fn(),
    readPolicy: vi.fn(),
    writePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    listGroups: vi.fn(),
    readGroup: vi.fn(),
    updateGroupMembers: vi.fn(),
    listUserpassAccounts: vi.fn(async (_session, mount) => [{
      username: `${mount}-alice`,
      mount,
      tokenPolicies: ['default', 'vc-role-platform-readers'],
    }]),
    readUserpassAccount: vi.fn(),
    createUserpassAccount: vi.fn(),
    deleteUserpassAccount: vi.fn(),
    readEntityByName: vi.fn(),
    lookupEntityByAlias: vi.fn(async () => ({
      id: 'entity-1',
      name: 'Alice Operator',
      disabled: false,
      policies: ['vc-user-alice', 'legacy-ops'],
      groupIds: ['group-1'],
      aliases: [{
        id: 'alias-1',
        name: 'alice',
        canonicalId: 'entity-1',
        mountAccessor: 'auth_userpass_123',
      }],
    })),
    createEntity: vi.fn(),
    deleteEntity: vi.fn(),
    createEntityAlias: vi.fn(),
    deleteEntityAlias: vi.fn(),
  };
}

describe('access-control resource loading', () => {
  it('lists users without reading policy bodies or identity details', async () => {
    const access = gateway();
    const mounts: readonly VaultAuthMount[] = [{
      path: 'userpass',
      accessor: 'auth_userpass_123',
      type: 'userpass',
      description: '',
    }];

    const result = await loadUserpassUsers(access, session, mounts);

    expect(result.users[0]).toMatchObject({
      username: 'userpass-alice',
      displayName: 'userpass-alice',
      entity: null,
      directRolePolicyNames: ['vc-role-platform-readers'],
    });
    expect(access.listUserpassAccounts).toHaveBeenCalledOnce();
    expect(access.listPolicies).not.toHaveBeenCalled();
    expect(access.readPolicy).not.toHaveBeenCalled();
    expect(access.listGroups).not.toHaveBeenCalled();
    expect(access.lookupEntityByAlias).not.toHaveBeenCalled();
  });

  it('bounds account-list fan-out to four auth mounts at a time', async () => {
    const access = gateway();
    let active = 0;
    let maximumActive = 0;
    access.listUserpassAccounts = vi.fn(async (_session, mount) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      return [{ username: 'alice', mount, tokenPolicies: ['default'] }];
    });
    const mounts = Array.from({ length: 12 }, (_, index): VaultAuthMount => ({
      path: `userpass-${index}`,
      accessor: `auth_${index}`,
      type: 'userpass',
      description: '',
    }));

    await loadUserpassUsers(access, session, mounts);

    expect(access.listUserpassAccounts).toHaveBeenCalledTimes(12);
    expect(maximumActive).toBeLessThanOrEqual(4);
  });

  it('loads one selected user identity and joins its groups on demand', async () => {
    const access = gateway();
    const user: AccessControlUserRecord = {
      id: 'userpass:alice',
      username: 'alice',
      displayName: 'alice',
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      tokenPolicies: ['default'],
      entity: null,
      groups: [],
      directRolePolicyNames: [],
      directPolicyNames: [],
      externalPolicyNames: [],
    };
    const groups = [{
      id: 'group-1',
      name: 'platform-team',
      policies: ['vc-role-platform-readers'],
      memberEntityIds: ['entity-1'],
      memberGroupIds: [],
      metadata: {},
    }];

    const result = await loadUserDetails(access, session, user, groups);

    expect(result).toMatchObject({
      displayName: 'Alice Operator',
      directPolicyNames: ['vc-user-alice'],
      externalPolicyNames: ['legacy-ops'],
    });
    expect(result.groups.map((group) => group.name)).toEqual(['platform-team']);
    expect(access.lookupEntityByAlias).toHaveBeenCalledOnce();
  });

  it('keeps account data available when selected identity details are forbidden', async () => {
    const access = gateway();
    access.lookupEntityByAlias = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    const user: AccessControlUserRecord = {
      id: 'userpass:alice',
      username: 'alice',
      displayName: 'alice',
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      tokenPolicies: ['default'],
      entity: null,
      groups: [],
      directRolePolicyNames: [],
      directPolicyNames: [],
      externalPolicyNames: [],
    };

    const result = await loadUserDetails(access, session, user, []);

    expect(result.username).toBe('alice');
    expect(result.detailWarning).toContain('not readable');
  });
});
