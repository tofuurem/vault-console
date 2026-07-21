import { describe, expect, it, vi } from 'vitest';

import type { VaultAccessControlGateway, VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { CreateUserTransaction, type CreateUserTransactionInput } from './createUserTransaction';
import type { AccessControlSnapshot } from './useAccessControlData';

const session: VaultSession = { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.admin'), authMethod: 'token' };
const group = { id: 'group-1', name: 'platform', policies: [], memberEntityIds: [], memberGroupIds: [], metadata: {} };
const snapshot = {
  userpassMounts: [{ path: 'userpass', accessor: 'auth_userpass_123', type: 'userpass', description: '' }],
  users: [], policies: [], groups: [group], authMounts: [], roles: [], warnings: [],
} as AccessControlSnapshot;
const input: CreateUserTransactionInput = {
  username: 'alice', displayName: 'Alice', userpassMount: 'userpass', password: 'memory-only-password',
  directRolePolicyNames: ['vc-role-reader'],
  directPolicy: { name: 'vc-user-alice', hcl: 'path "secret/data/*" {}' },
  groups: [group],
};

function gateway(): VaultAccessControlGateway {
  return {
    lookupEntityByAlias: vi.fn(async () => null),
    readEntityByName: vi.fn(async () => { throw new VaultError('not-found'); }),
    writePolicy: vi.fn(async () => undefined),
    createUserpassAccount: vi.fn(async () => undefined),
    createEntity: vi.fn(async () => 'entity-1'),
    createEntityAlias: vi.fn(async () => 'alias-1'),
    updateGroupMembers: vi.fn(async () => undefined),
    deleteEntityAlias: vi.fn(async () => undefined),
    deleteEntity: vi.fn(async () => undefined),
    deleteUserpassAccount: vi.fn(async () => undefined),
    deletePolicy: vi.fn(async () => undefined),
  } as unknown as VaultAccessControlGateway;
}

describe('CreateUserTransaction', () => {
  it('preflights and creates policy, account, entity, alias, and group membership in order', async () => {
    const api = gateway();
    const transaction = new CreateUserTransaction(api, session, snapshot, input);
    const report = vi.fn();
    await transaction.apply({ report, signal: new AbortController().signal });

    expect(api.createUserpassAccount).toHaveBeenCalledWith(session, 'userpass', expect.objectContaining({
      username: 'alice', tokenPolicies: ['default', 'vc-role-reader', 'vc-user-alice'],
    }), expect.any(AbortSignal));
    expect((api.createUserpassAccount as ReturnType<typeof vi.fn>).mock.calls[0][2].password.reveal()).toBe('memory-only-password');
    expect(api.createEntity).toHaveBeenCalledWith(session, expect.objectContaining({
      policies: [],
    }), expect.any(AbortSignal));
    expect(api.updateGroupMembers).toHaveBeenCalledWith(session, group, ['entity-1'], expect.any(AbortSignal));
    expect(report).toHaveBeenCalledWith('groups', 'completed');
  });

  it('rolls back only resources created by this transaction in reverse dependency order', async () => {
    const api = gateway();
    const transaction = new CreateUserTransaction(api, session, snapshot, input);
    await transaction.apply({ report: vi.fn(), signal: new AbortController().signal });
    await transaction.rollback({ report: vi.fn(), signal: new AbortController().signal });

    expect(api.deleteEntityAlias).toHaveBeenCalledWith(session, 'alias-1', expect.any(AbortSignal));
    expect(api.deleteEntity).toHaveBeenCalledWith(session, 'entity-1', expect.any(AbortSignal));
    expect(api.deleteUserpassAccount).toHaveBeenCalledWith(session, 'userpass', 'alice', expect.any(AbortSignal));
    expect(api.deletePolicy).toHaveBeenCalledWith(session, 'vc-user-alice', expect.any(AbortSignal));
  });

  it('stops before writes when the username already exists', async () => {
    const api = gateway();
    const collision = { ...snapshot, users: [{ mount: 'userpass', username: 'alice' }] } as unknown as AccessControlSnapshot;
    const transaction = new CreateUserTransaction(api, session, collision, input);

    await expect(transaction.apply({ report: vi.fn(), signal: new AbortController().signal })).rejects.toMatchObject({ code: 'conflict' });
    expect(api.writePolicy).not.toHaveBeenCalled();
  });
});
