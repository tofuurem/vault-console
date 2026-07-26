import { describe, expect, it, vi } from 'vitest';

import { renderManagedPolicy } from '@/domain/access-control/policy-ownership';
import type {
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultPassword, vaultToken } from '@/domain/vault/sensitive-value';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import {
  buildPurgeIdentityPlan,
  buildResetPasswordPlan,
  buildToggleEntityPlan,
  buildUserEditPlan,
  buildUserRemovalPlan,
  loadIdentityTombstoneSnapshot,
  loadUserLifecycleSnapshot,
} from './user-lifecycle';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

const entity: VaultIdentityEntity = {
  id: 'entity-alice',
  name: 'Alice Operator',
  disabled: false,
  policies: [],
  groupIds: ['group-platform'],
  aliases: [{
    id: 'alias-alice',
    name: 'alice',
    canonicalId: 'entity-alice',
    mountAccessor: 'auth_userpass_123',
  }],
  metadata: {
    managed_by: 'vault-console',
    username: 'alice',
    auth_mount: 'userpass',
  },
};

const group: VaultIdentityGroup = {
  id: 'group-platform',
  name: 'Platform',
  type: 'internal',
  policies: ['vc-role-platform-reader', 'external-audit'],
  memberEntityIds: ['entity-alice'],
  memberGroupIds: ['nested-readers'],
  metadata: { managed_by: 'vault-console', owner: 'platform' },
};

const directPolicy = {
  name: 'vc-user-alice',
  policy: renderManagedPolicy(
    { kind: 'user-direct' as const, owner: 'alice' },
    'path "applications/data/team/*" { capabilities = ["read"] }',
  ),
};

function lifecycleGateway() {
  return vaultAccessControlGatewayMock({
    readUserpassAccount: vi.fn(async () => ({
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: [
        'default',
        'external-audit',
        'vc-role-platform-reader',
        'vc-user-alice',
      ],
      tokenTtlSeconds: 3600,
    })),
    lookupEntityByAlias: vi.fn(async () => entity),
    listGroups: vi.fn(async () => [group]),
    listEntities: vi.fn(async () => [entity]),
    listAuthMounts: vi.fn(async () => [{
      path: 'userpass',
      accessor: 'auth_userpass_123',
      type: 'userpass',
      description: '',
    }]),
    listUserpassAccounts: vi.fn(async () => [{
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: ['default', 'vc-user-alice'],
    }]),
    readPolicy: vi.fn(async () => directPolicy),
  });
}

describe('user access lifecycle use cases', () => {
  it('loads a complete editor snapshot and proves direct policy references', async () => {
    const gateway = lifecycleGateway();

    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });

    expect(snapshot).toMatchObject({
      mountAccessor: 'auth_userpass_123',
      account: {
        username: 'alice',
        tokenTtlSeconds: 3600,
      },
      entity: { id: 'entity-alice' },
      directPolicyOwnership: 'managed',
      directPolicyEditable: true,
      policyReferences: [],
      visibility: { complete: true, reasons: [] },
    });
    expect(snapshot.fingerprint).toMatch(/^v1-/);
  });

  it('keeps a partial snapshot readable but records every unsafe missing dependency', async () => {
    const gateway = lifecycleGateway();
    gateway.listEntities = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    gateway.listGroups = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });

    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });

    expect(snapshot.account.username).toBe('alice');
    expect(snapshot.visibility.complete).toBe(false);
    expect(snapshot.visibility.reasons).toEqual([
      'Identity entities could not be fully listed.',
      'Identity groups could not be fully listed.',
    ]);
  });

  it('builds a staged edit that preserves external policies and complete group state', async () => {
    const snapshot = await loadUserLifecycleSnapshot(
      lifecycleGateway(),
      session,
      {
        mount: 'userpass',
        mountAccessor: 'auth_userpass_123',
        username: 'alice',
      },
    );
    const newPolicy = {
      name: 'vc-user-alice',
      policy: renderManagedPolicy(
        { kind: 'user-direct' as const, owner: 'alice' },
        'path "applications/data/team/*" { capabilities = ["read", "update"] }',
      ),
    };

    const plan = buildUserEditPlan(snapshot, {
      displayName: 'Alice Platform',
      groupIds: [],
      directRolePolicyNames: ['vc-role-billing-reader'],
      managedRolePolicyNames: [
        'vc-role-platform-reader',
        'vc-role-billing-reader',
      ],
      directPolicy: newPolicy,
      adoptDirectPolicy: false,
    });

    expect(plan.operations.map(({ id }) => id)).toEqual([
      'write-direct-policy',
      'remove-group-group-platform',
      'update-userpass-policies',
      'update-entity-profile',
    ]);
    const accountOperation = plan.operations.find(
      (operation) => operation.kind === 'update-userpass-policies',
    );
    expect(accountOperation).toMatchObject({
      policies: [
        'default',
        'external-audit',
        'vc-role-billing-reader',
        'vc-user-alice',
      ],
      effectTiming: 'next-login',
    });
    const groupOperation = plan.operations.find(
      (operation) => operation.kind === 'update-group',
    );
    expect(groupOperation).toMatchObject({
      group: {
        policies: ['vc-role-platform-reader', 'external-audit'],
        memberEntityIds: [],
        memberGroupIds: ['nested-readers'],
        metadata: { managed_by: 'vault-console', owner: 'platform' },
      },
    });
    expect(plan.permissionDiff).toEqual({
      added: [{
        pattern: 'applications/data/team/*',
        capability: 'update',
      }],
      removed: [],
    });
  });

  it('creates the first canonical per-user policy for an account without one', async () => {
    const gateway = lifecycleGateway();
    gateway.readUserpassAccount = vi.fn(async () => ({
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: ['default', 'external-audit'],
    }));
    gateway.listUserpassAccounts = vi.fn(async () => [{
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: ['default', 'external-audit'],
    }]);
    gateway.readPolicy = vi.fn(async () => {
      throw new VaultError('not-found', { status: 404 });
    });
    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });
    const policy = {
      name: 'vc-user-alice',
      policy: renderManagedPolicy(
        { kind: 'user-direct' as const, owner: 'alice' },
        'path "applications/data/personal/*" { capabilities = ["read"] }',
      ),
    };

    const plan = buildUserEditPlan(snapshot, {
      displayName: entity.name,
      groupIds: ['group-platform'],
      directRolePolicyNames: [],
      managedRolePolicyNames: ['vc-role-platform-reader'],
      directPolicy: policy,
      adoptDirectPolicy: false,
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        id: 'write-direct-policy',
        kind: 'write-policy',
        created: true,
        policy,
      }),
      expect.objectContaining({
        id: 'update-userpass-policies',
        kind: 'update-userpass-policies',
        policies: ['default', 'external-audit', 'vc-user-alice'],
      }),
    ]);
  });

  it('does not attach an existing reserved policy during an unrelated edit', async () => {
    const gateway = lifecycleGateway();
    gateway.readUserpassAccount = vi.fn(async () => ({
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: ['default', 'external-audit'],
    }));
    gateway.listUserpassAccounts = vi.fn(async () => [{
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: ['default', 'external-audit'],
    }]);
    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });

    expect(snapshot.directPolicy?.name).toBe('vc-user-alice');
    expect(snapshot.directPolicyEditable).toBe(false);
    const plan = buildUserEditPlan(snapshot, {
      displayName: 'Alice Renamed',
      groupIds: ['group-platform'],
      directRolePolicyNames: [],
      managedRolePolicyNames: ['vc-role-platform-reader'],
      directPolicy: snapshot.directPolicy,
      adoptDirectPolicy: false,
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        id: 'update-entity-profile',
        kind: 'update-entity',
      }),
    ]);
    expect(plan.operations.some(({ kind }) => kind === 'update-userpass-policies'))
      .toBe(false);
  });

  it('blocks direct-policy mutation while another Identity reference exists', async () => {
    const gateway = lifecycleGateway();
    const entityWithDirectPolicy = {
      ...entity,
      policies: ['vc-user-alice'],
    };
    gateway.lookupEntityByAlias = vi.fn(async () => entityWithDirectPolicy);
    gateway.listEntities = vi.fn(async () => [entityWithDirectPolicy]);
    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });

    expect(snapshot.policyReferences).toEqual([
      { kind: 'user', id: entity.id, name: entity.name },
    ]);
    expect(snapshot.directPolicyEditable).toBe(false);
    expect(() => buildUserEditPlan(snapshot, {
      displayName: entity.name,
      groupIds: ['group-platform'],
      directRolePolicyNames: ['vc-role-platform-reader'],
      managedRolePolicyNames: ['vc-role-platform-reader'],
      directPolicy: {
        ...directPolicy,
        policy: renderManagedPolicy(
          { kind: 'user-direct' as const, owner: 'alice' },
          'path "applications/data/team/*" { capabilities = ["read", "update"] }',
        ),
      },
      adoptDirectPolicy: false,
    })).toThrow();
  });

  it('adopts an eligible 0.5.0 direct policy without changing its permissions', async () => {
    const gateway = lifecycleGateway();
    gateway.readPolicy = vi.fn(async () => ({
      name: 'vc-user-alice',
      policy: 'path "applications/data/team/*" { capabilities = ["read"] }',
    }));
    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });

    const plan = buildUserEditPlan(snapshot, {
      displayName: entity.name,
      groupIds: ['group-platform'],
      directRolePolicyNames: ['vc-role-platform-reader'],
      managedRolePolicyNames: ['vc-role-platform-reader'],
      directPolicy: snapshot.directPolicy,
      adoptDirectPolicy: true,
    });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({
      kind: 'write-policy',
      policy: {
        name: 'vc-user-alice',
      },
    });
    if (plan.operations[0].kind !== 'write-policy') throw new Error('Expected policy write');
    expect(plan.operations[0].policy.policy).toContain(
      '# vault-console: {"schema":1,"kind":"user-direct","owner":"alice"}',
    );
    expect(plan.permissionDiff).toEqual({ added: [], removed: [] });
  });

  it('preserves an unverified per-user policy while editing unrelated managed state', async () => {
    const gateway = lifecycleGateway();
    gateway.readPolicy = vi.fn(async () => ({
      name: 'vc-user-alice',
      policy: 'path "applications/data/team/*" { capabilities = ["read"] }',
    }));
    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });

    const plan = buildUserEditPlan(snapshot, {
      displayName: 'Alice Renamed',
      groupIds: ['group-platform'],
      directRolePolicyNames: ['vc-role-platform-reader'],
      managedRolePolicyNames: ['vc-role-platform-reader'],
      directPolicy: snapshot.directPolicy,
      adoptDirectPolicy: false,
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        id: 'update-entity-profile',
        kind: 'update-entity',
      }),
    ]);
    expect(plan.operations.some(({ kind }) => kind === 'write-policy')).toBe(false);
    expect(plan.operations.some(({ kind }) => kind === 'delete-policy')).toBe(false);
  });

  it('builds scoped reset and toggle plans with honest token timing', async () => {
    const snapshot = await loadUserLifecycleSnapshot(
      lifecycleGateway(),
      session,
      {
        mount: 'userpass',
        mountAccessor: 'auth_userpass_123',
        username: 'alice',
      },
    );

    expect(buildResetPasswordPlan(
      snapshot,
      vaultPassword('new-memory-only'),
    ).operations[0]).toMatchObject({
      kind: 'reset-userpass-password',
      effectTiming: 'does-not-revoke',
    });
    expect(buildToggleEntityPlan(snapshot, true).operations[0]).toMatchObject({
      kind: 'update-entity',
      entity: { disabled: true },
      effectTiming: 'next-request',
    });
  });

  it('removes a managed login through disable, cleanup, and a retained tombstone', async () => {
    const snapshot = await loadUserLifecycleSnapshot(
      lifecycleGateway(),
      session,
      {
        mount: 'userpass',
        mountAccessor: 'auth_userpass_123',
        username: 'alice',
      },
    );

    const result = buildUserRemovalPlan(snapshot);

    expect(result.mode).toBe('managed-tombstone');
    expect(result.plan.confirmation?.value).toBe('alice');
    expect(result.plan.operations.map(({ id }) => id)).toEqual([
      'disable-entity',
      'delete-userpass-account',
      'delete-userpass-alias',
      'remove-group-group-platform',
      'write-disabled-tombstone',
      'delete-direct-policy',
    ]);
    const tombstone = result.plan.operations.find(
      ({ id }) => id === 'write-disabled-tombstone',
    );
    expect(tombstone).toMatchObject({
      kind: 'update-entity',
      entity: {
        disabled: true,
        policies: [],
        metadata: {
          managed_by: 'vault-console',
          lifecycle_state: 'login-removed',
        },
      },
    });
  });

  it('falls back to account-only removal when the identity graph is external', async () => {
    const gateway = lifecycleGateway();
    gateway.lookupEntityByAlias = vi.fn(async () => ({
      ...entity,
      policies: ['external-identity-policy'],
    }));
    const snapshot = await loadUserLifecycleSnapshot(gateway, session, {
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      username: 'alice',
    });

    const result = buildUserRemovalPlan(snapshot);

    expect(result.mode).toBe('account-only');
    expect(result.preservedReasons).toContain('The identity has external policies.');
    expect(result.plan.operations).toEqual([
      expect.objectContaining({ kind: 'delete-userpass-account' }),
    ]);
  });

  it('purges only an empty disabled managed tombstone', () => {
    const tombstone = {
      ...entity,
      disabled: true,
      policies: [],
      aliases: [],
      groupIds: [],
      metadata: {
        managed_by: 'vault-console',
        lifecycle_state: 'login-removed',
      },
    };

    const plan = buildPurgeIdentityPlan({
      entity: tombstone,
      groups: [],
      accountAbsent: true,
      visibility: { complete: true, reasons: [] },
      fingerprint: 'v1-tombstone',
    });

    expect(plan.confirmation?.value).toBe('Alice Operator');
    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'delete-entity',
        entityId: 'entity-alice',
      }),
    ]);
    expect(() => buildPurgeIdentityPlan({
      entity: { ...tombstone, disabled: false },
      groups: [],
      accountAbsent: true,
      visibility: { complete: true, reasons: [] },
      fingerprint: 'v1-active',
    })).toThrow(/disabled tombstone/i);
  });

  it('verifies that the former login is absent before allowing tombstone purge', async () => {
    const tombstone = {
      ...entity,
      disabled: true,
      policies: [],
      aliases: [],
      groupIds: [],
      metadata: {
        managed_by: 'vault-console',
        lifecycle_state: 'login-removed',
        username: 'alice',
        auth_mount: 'userpass',
      },
    };
    const gateway = vaultAccessControlGatewayMock({
      readEntity: vi.fn(async () => tombstone),
      listGroups: vi.fn(async () => []),
      readUserpassAccount: vi.fn(async () => null),
    });

    const snapshot = await loadIdentityTombstoneSnapshot(
      gateway,
      session,
      tombstone.id,
    );

    expect(snapshot.accountAbsent).toBe(true);
    expect(snapshot.visibility).toEqual({ complete: true, reasons: [] });
    expect(buildPurgeIdentityPlan(snapshot).operations[0]).toMatchObject({
      kind: 'delete-entity',
      entityId: tombstone.id,
    });

    gateway.readUserpassAccount = vi.fn(async () => ({
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: ['default'],
    }));
    const unsafe = await loadIdentityTombstoneSnapshot(
      gateway,
      session,
      tombstone.id,
    );
    expect(unsafe.accountAbsent).toBe(false);
    expect(unsafe.visibility.complete).toBe(false);
    expect(() => buildPurgeIdentityPlan(unsafe)).toThrow(/disabled tombstone/i);
  });
});
