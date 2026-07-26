import { describe, expect, it, vi } from 'vitest';

import type {
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import {
  buildCreateGroupPlan,
  buildDeleteGroupPlan,
  buildUpdateGroupPlan,
  loadGroupLifecycleSnapshot,
} from './group-lifecycle';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

const alice: VaultIdentityEntity = {
  id: 'entity-alice',
  name: 'Alice',
  disabled: false,
  policies: [],
  groupIds: ['group-platform'],
  aliases: [],
  metadata: { managed_by: 'vault-console' },
};

const group: VaultIdentityGroup = {
  id: 'group-platform',
  name: 'Platform',
  type: 'internal',
  policies: ['vc-role-reader', 'external-audit'],
  memberEntityIds: ['entity-alice'],
  memberGroupIds: ['nested-observers'],
  metadata: {
    managed_by: 'vault-console',
    schema: '1',
    description: 'Platform access',
    owner: 'platform',
  },
};

const parentGroup: VaultIdentityGroup = {
  id: 'parent-group',
  name: 'Engineering',
  type: 'internal',
  policies: [],
  memberEntityIds: [],
  memberGroupIds: ['group-platform'],
  metadata: {},
};

function gateway() {
  return vaultAccessControlGatewayMock({
    readGroup: vi.fn(async () => group),
    listGroups: vi.fn(async () => [group, parentGroup]),
    listEntities: vi.fn(async () => [alice]),
  });
}

describe('managed group lifecycle use cases', () => {
  it('loads direct members and parent dependencies with a stable fingerprint', async () => {
    const snapshot = await loadGroupLifecycleSnapshot(
      gateway(),
      session,
      'group-platform',
    );

    expect(snapshot).toMatchObject({
      group: { id: 'group-platform' },
      entities: [{ id: 'entity-alice' }],
      parentGroups: [{
        kind: 'group',
        id: 'parent-group',
        name: 'Engineering',
      }],
      visibility: { complete: true, reasons: [] },
    });
    expect(snapshot.fingerprint).toMatch(/^v1-/);
  });

  it('creates a managed internal group with owned metadata and a staged risk review', async () => {
    const snapshot = await loadGroupLifecycleSnapshot(gateway(), session);

    const plan = buildCreateGroupPlan(snapshot, {
      name: 'Billing team',
      description: 'Billing production access',
      memberEntityIds: ['entity-alice'],
      managedRolePolicyNames: ['vc-role-reader', 'vc-role-owner'],
      selectedRolePolicyNames: ['vc-role-owner'],
      permissionDiff: {
        added: [{
          pattern: 'billing/destroy/*',
          capability: 'update',
        }],
        removed: [],
      },
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'create-group',
        group: {
          name: 'Billing team',
          policies: ['vc-role-owner'],
          memberEntityIds: ['entity-alice'],
          memberGroupIds: [],
          metadata: {
            managed_by: 'vault-console',
            schema: '1',
            description: 'Billing production access',
          },
        },
      }),
    ]);
    expect(plan.confirmation?.value).toBe('Billing team');
  });

  it('updates only owned fields while preserving external policies, nested groups, and metadata', async () => {
    const snapshot = await loadGroupLifecycleSnapshot(
      gateway(),
      session,
      'group-platform',
    );

    const plan = buildUpdateGroupPlan(snapshot, {
      name: 'Platform engineering',
      description: 'Core platform access',
      memberEntityIds: [],
      managedRolePolicyNames: ['vc-role-reader', 'vc-role-editor'],
      selectedRolePolicyNames: ['vc-role-editor'],
      permissionDiff: { added: [], removed: [] },
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'update-group',
        groupId: 'group-platform',
        group: {
          name: 'Platform engineering',
          policies: ['external-audit', 'vc-role-editor'],
          memberEntityIds: [],
          memberGroupIds: ['nested-observers'],
          metadata: {
            managed_by: 'vault-console',
            schema: '1',
            description: 'Core platform access',
            owner: 'platform',
          },
        },
      }),
    ]);
  });

  it('blocks deletion until members, nested groups, and parent dependencies are removed', async () => {
    const snapshot = await loadGroupLifecycleSnapshot(
      gateway(),
      session,
      'group-platform',
    );

    expect(() => buildDeleteGroupPlan(snapshot)).toThrow(/empty/i);

    const emptySnapshot = {
      ...snapshot,
      group: {
        ...group,
        memberEntityIds: [],
        memberGroupIds: [],
      },
      parentGroups: [],
    };
    const plan = buildDeleteGroupPlan(emptySnapshot);

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'delete-group',
        groupId: 'group-platform',
      }),
    ]);
    expect(plan.confirmation).toBeUndefined();
  });
});
