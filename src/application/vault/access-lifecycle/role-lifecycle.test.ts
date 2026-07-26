import { describe, expect, it, vi } from 'vitest';

import { renderManagedPolicy } from '@/domain/access-control/policy-ownership';
import type {
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import {
  buildAdoptRolePlan,
  buildCreateRolePlan,
  buildDeleteRolePlan,
  buildUpdateRolePlan,
  loadRoleLifecycleSnapshot,
} from './role-lifecycle';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

const roleName = 'vc-role-platform-reader';
const managedPolicy = {
  name: roleName,
  policy: renderManagedPolicy(
    { kind: 'role' as const, description: 'Platform readers' },
    'path "platform/data/apps/*" { capabilities = ["read"] }',
  ),
};

const group: VaultIdentityGroup = {
  id: 'group-platform',
  name: 'Platform',
  type: 'internal',
  policies: [roleName],
  memberEntityIds: [],
  memberGroupIds: [],
  metadata: { managed_by: 'vault-console' },
};

const entity: VaultIdentityEntity = {
  id: 'entity-service',
  name: 'Deployment service',
  disabled: false,
  policies: [roleName],
  groupIds: [],
  aliases: [],
  metadata: {},
};

function gateway() {
  return vaultAccessControlGatewayMock({
    readPolicy: vi.fn(async () => managedPolicy),
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
      tokenPolicies: [roleName],
    }]),
  });
}

describe('managed role lifecycle use cases', () => {
  it('loads dependencies from users, groups, and entities', async () => {
    const snapshot = await loadRoleLifecycleSnapshot(
      gateway(),
      session,
      roleName,
    );

    expect(snapshot).toMatchObject({
      policy: { name: roleName },
      ownership: 'managed',
      editable: true,
      dependencies: [
        { kind: 'user', id: 'userpass:alice', name: 'alice' },
        { kind: 'group', id: 'group-platform', name: 'Platform' },
        { kind: 'user', id: 'entity-service', name: 'Deployment service' },
      ],
      visibility: { complete: true, reasons: [] },
    });
  });

  it('creates a canonical role and requires typed confirmation for whole-mount access', async () => {
    const gatewayWithMissingPolicy = gateway();
    gatewayWithMissingPolicy.readPolicy = vi.fn(async () => {
      throw new VaultError('not-found', { status: 404 });
    });
    const snapshot = await loadRoleLifecycleSnapshot(
      gatewayWithMissingPolicy,
      session,
      'vc-role-platform-owner',
    );

    const plan = buildCreateRolePlan(snapshot, {
      policyName: 'vc-role-platform-owner',
      description: 'Platform owners',
      hcl: 'path "platform/data/*" { capabilities = ["create", "read", "update", "delete"] }',
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'write-policy',
        created: true,
        policy: expect.objectContaining({
          name: 'vc-role-platform-owner',
        }),
      }),
    ]);
    if (plan.operations[0].kind !== 'write-policy') throw new Error('Expected policy write');
    expect(plan.operations[0].policy.policy).toContain(
      '# vault-console: {"schema":1,"kind":"role","description":"Platform owners"}',
    );
    expect(plan.confirmation?.value).toBe('vc-role-platform-owner');
  });

  it('updates a managed role with a semantic live permission diff', async () => {
    const snapshot = await loadRoleLifecycleSnapshot(
      gateway(),
      session,
      roleName,
    );

    const plan = buildUpdateRolePlan(snapshot, {
      policyName: roleName,
      description: 'Platform read and patch',
      hcl: 'path "platform/data/apps/*" { capabilities = ["read", "patch"] }',
    });

    expect(plan.permissionDiff).toEqual({
      added: [{ pattern: 'platform/data/apps/*', capability: 'patch' }],
      removed: [],
    });
    expect(plan.operations[0]).toMatchObject({
      kind: 'write-policy',
      created: false,
      effectTiming: 'next-request',
    });
  });

  it('adopts a fully supported Unverified role without changing capabilities', async () => {
    const unverifiedGateway = gateway();
    unverifiedGateway.readPolicy = vi.fn(async () => ({
      name: roleName,
      policy: 'path "platform/data/apps/*" { capabilities = ["read"] }',
    }));
    const snapshot = await loadRoleLifecycleSnapshot(
      unverifiedGateway,
      session,
      roleName,
    );

    const plan = buildAdoptRolePlan(snapshot, 'Adopted readers');

    expect(plan.permissionDiff).toEqual({ added: [], removed: [] });
    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'write-policy',
        created: false,
      }),
    ]);
  });

  it('blocks role deletion until every dependency is detached and visible', async () => {
    const snapshot = await loadRoleLifecycleSnapshot(
      gateway(),
      session,
      roleName,
    );
    expect(() => buildDeleteRolePlan(snapshot)).toThrow(/attached/i);

    const plan = buildDeleteRolePlan({
      ...snapshot,
      dependencies: [],
    });
    expect(plan.confirmation?.value).toBe(roleName);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'delete-policy',
        policyName: roleName,
      }),
    ]);
  });
});
