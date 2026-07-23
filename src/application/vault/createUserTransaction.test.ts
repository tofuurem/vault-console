import { describe, expect, it, vi } from 'vitest';

import type {
  VaultAccessControlGateway,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { CreateUserTransaction, type CreateUserTransactionInput } from './createUserTransaction';
import type { AccessControlSnapshot } from './useAccessControlData';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};
const group: VaultIdentityGroup = {
  id: 'group-1',
  name: 'platform',
  policies: [],
  memberEntityIds: [],
  memberGroupIds: [],
  metadata: {},
};
const snapshot = {
  userpassMounts: [{
    path: 'userpass',
    accessor: 'stale_accessor',
    type: 'userpass',
    description: '',
  }],
  users: [],
  policies: [],
  groups: [group],
  authMounts: [],
  roles: [],
  warnings: [],
} as AccessControlSnapshot;
const input: CreateUserTransactionInput = {
  username: 'alice',
  displayName: 'Alice',
  userpassMount: 'userpass',
  password: 'memory-only-password',
  directRolePolicyNames: ['vc-role-reader'],
  directPolicy: {
    name: 'vc-user-alice',
    hcl: 'path "secret/data/*" {}',
  },
  groups: [group],
};

interface StatefulGateway {
  readonly api: VaultAccessControlGateway;
  members(): readonly string[];
  setMembers(next: readonly string[]): void;
}

function gateway(options: {
  readonly accountExists?: boolean;
  readonly policyExists?: boolean;
  readonly dropMembershipWrite?: boolean;
} = {}): StatefulGateway {
  let memberEntityIds = ['entity-concurrent'];
  const api: VaultAccessControlGateway = {
    listAuthMounts: vi.fn(async () => [{
      path: 'userpass',
      accessor: 'auth_userpass_fresh',
      type: 'userpass',
      description: '',
    }]),
    listPolicies: vi.fn(),
    readPolicy: vi.fn(async (_session, name) => {
      if (!options.policyExists) throw new VaultError('not-found', { status: 404 });
      return { name, policy: 'existing' };
    }),
    writePolicy: vi.fn(async () => undefined),
    deletePolicy: vi.fn(async () => undefined),
    listGroups: vi.fn(),
    readGroup: vi.fn(async () => ({ ...group, memberEntityIds: [...memberEntityIds] })),
    updateGroupMembers: vi.fn(async (_session, _group, nextMembers) => {
      if (!options.dropMembershipWrite) memberEntityIds = [...nextMembers];
    }),
    listUserpassAccounts: vi.fn(),
    readUserpassAccount: vi.fn(async () => options.accountExists
      ? { username: 'alice', mount: 'userpass', tokenPolicies: ['default'] }
      : null),
    createUserpassAccount: vi.fn(async () => undefined),
    deleteUserpassAccount: vi.fn(async () => undefined),
    readEntityByName: vi.fn(async () => {
      throw new VaultError('not-found', { status: 404 });
    }),
    lookupEntityByAlias: vi.fn(async () => null),
    createEntity: vi.fn(async () => 'entity-1'),
    deleteEntity: vi.fn(async () => undefined),
    createEntityAlias: vi.fn(async () => 'alias-1'),
    deleteEntityAlias: vi.fn(async () => undefined),
  };
  return {
    api,
    members: () => memberEntityIds,
    setMembers: (next) => {
      memberEntityIds = [...next];
    },
  };
}

describe('CreateUserTransaction', () => {
  it('uses live preflight data and merges current group membership before verification', async () => {
    const stateful = gateway();
    const transaction = new CreateUserTransaction(stateful.api, session, snapshot, input);
    const report = vi.fn();
    await transaction.apply({ report, signal: new AbortController().signal });

    expect(stateful.api.readUserpassAccount).toHaveBeenCalledWith(
      session,
      'userpass',
      'alice',
      expect.any(AbortSignal),
    );
    expect(stateful.api.createUserpassAccount).toHaveBeenCalledWith(
      session,
      'userpass',
      expect.objectContaining({
        username: 'alice',
        tokenPolicies: ['default', 'vc-role-reader', 'vc-user-alice'],
      }),
      expect.any(AbortSignal),
    );
    expect(
      (stateful.api.createUserpassAccount as ReturnType<typeof vi.fn>).mock.calls[0][2].password.reveal(),
    ).toBe('memory-only-password');
    expect(stateful.api.createEntityAlias).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ mountAccessor: 'auth_userpass_fresh' }),
      expect.any(AbortSignal),
    );
    expect(stateful.api.updateGroupMembers).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ memberEntityIds: ['entity-concurrent'] }),
      ['entity-concurrent', 'entity-1'],
      expect.any(AbortSignal),
    );
    expect(stateful.members()).toEqual(['entity-concurrent', 'entity-1']);
    expect(report).toHaveBeenCalledWith('groups', 'completed');
  });

  it('rolls back only the created entity from the latest group state', async () => {
    const stateful = gateway();
    const transaction = new CreateUserTransaction(stateful.api, session, snapshot, input);
    await transaction.apply({ report: vi.fn(), signal: new AbortController().signal });
    stateful.setMembers([...stateful.members(), 'entity-added-after-apply']);

    await transaction.rollback({ report: vi.fn(), signal: new AbortController().signal });

    expect(stateful.members()).toEqual(['entity-concurrent', 'entity-added-after-apply']);
    expect(stateful.api.deleteEntityAlias).toHaveBeenCalledWith(
      session,
      'alias-1',
      expect.any(AbortSignal),
    );
    expect(stateful.api.deleteEntity).toHaveBeenCalledWith(
      session,
      'entity-1',
      expect.any(AbortSignal),
    );
    expect(stateful.api.deleteUserpassAccount).toHaveBeenCalledWith(
      session,
      'userpass',
      'alice',
      expect.any(AbortSignal),
    );
    expect(stateful.api.deletePolicy).toHaveBeenCalledWith(
      session,
      'vc-user-alice',
      expect.any(AbortSignal),
    );
  });

  it('stops before writes when a username appears after the UI snapshot', async () => {
    const stateful = gateway({ accountExists: true });
    const transaction = new CreateUserTransaction(stateful.api, session, snapshot, input);

    await expect(
      transaction.apply({ report: vi.fn(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(stateful.api.writePolicy).not.toHaveBeenCalled();
    expect(stateful.api.createUserpassAccount).not.toHaveBeenCalled();
  });

  it('stops before writes when the generated policy name now exists', async () => {
    const stateful = gateway({ policyExists: true });
    const transaction = new CreateUserTransaction(stateful.api, session, snapshot, input);

    await expect(
      transaction.apply({ report: vi.fn(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(stateful.api.writePolicy).not.toHaveBeenCalled();
    expect(stateful.api.createUserpassAccount).not.toHaveBeenCalled();
  });

  it('reports a conflict when Vault does not retain the requested membership', async () => {
    const stateful = gateway({ dropMembershipWrite: true });
    const report = vi.fn();
    const transaction = new CreateUserTransaction(stateful.api, session, snapshot, input);

    await expect(
      transaction.apply({ report, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(report).toHaveBeenCalledWith('groups', 'failed');
  });
});
