import { describe, expect, it, vi } from 'vitest';

import type {
  ChangePlan,
  DependencyVisibility,
} from '@/domain/access-control/lifecycle/model';
import type {
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import {
  ChangePlanExecutor,
  preflightChangePlan,
} from './change-plan-executor';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

const complete: DependencyVisibility = { complete: true, reasons: [] };

function policyPlan(): ChangePlan {
  return {
    id: 'plan-role-reader',
    resourceKind: 'role',
    resourceId: 'vc-role-reader',
    baselineFingerprint: 'v1-current',
    visibility: complete,
    permissionDiff: { added: [], removed: [] },
    operations: [
      {
        id: 'write-policy',
        kind: 'write-policy',
        label: 'Write managed policy',
        dependsOn: [],
        requirements: [{
          path: 'sys/policies/acl/vc-role-reader',
          anyOf: ['create', 'update'],
        }],
        effectTiming: 'next-request',
        risk: 'normal',
        policy: {
          name: 'vc-role-reader',
          policy: 'path "secret/data/*" { capabilities = ["read"] }',
        },
        created: true,
      },
    ],
  };
}

describe('access lifecycle preflight and executor', () => {
  it('blocks incomplete, stale, unconfirmed, and unauthorized plans before writes', async () => {
    const plan = {
      ...policyPlan(),
      confirmation: {
        required: true as const,
        value: 'vc-role-reader',
        reasons: ['High-risk change'],
      },
    };
    const gateway = vaultAccessControlGatewayMock({
      getCapabilities: vi.fn(async () => ({
        'sys/policies/acl/vc-role-reader': ['read'] as const,
      })),
    });

    await expect(preflightChangePlan({
      gateway,
      session,
      plan,
      confirmation: '',
      loadFreshState: vi.fn(async () => ({
        fingerprint: 'v1-current',
        visibility: complete,
      })),
    })).resolves.toMatchObject({ ok: false, reason: 'confirmation' });

    await expect(preflightChangePlan({
      gateway,
      session,
      plan,
      confirmation: 'vc-role-reader',
      loadFreshState: vi.fn(async () => ({
        fingerprint: 'v1-new',
        visibility: complete,
      })),
    })).resolves.toMatchObject({ ok: false, reason: 'stale' });

    await expect(preflightChangePlan({
      gateway,
      session,
      plan,
      confirmation: 'vc-role-reader',
      loadFreshState: vi.fn(async () => ({
        fingerprint: 'v1-current',
        visibility: { complete: false, reasons: ['Groups are unreadable.'] },
      })),
    })).resolves.toMatchObject({
      ok: false,
      reason: 'incomplete',
      reasons: ['Groups are unreadable.'],
    });

    await expect(preflightChangePlan({
      gateway,
      session,
      plan,
      confirmation: 'vc-role-reader',
      loadFreshState: vi.fn(async () => ({
        fingerprint: 'v1-current',
        visibility: complete,
      })),
    })).resolves.toMatchObject({
      ok: false,
      reason: 'capabilities',
      missing: [{
        path: 'sys/policies/acl/vc-role-reader',
      }],
    });
    expect(gateway.writePolicy).not.toHaveBeenCalled();
  });

  it('applies, verifies, and deduplicates one plan execution', async () => {
    let policy: { name: string; policy: string } | null = null;
    const gateway = vaultAccessControlGatewayMock({
      getCapabilities: vi.fn(async () => ({
        'sys/policies/acl/vc-role-reader': ['update'] as const,
      })),
      writePolicy: vi.fn(async (_session, next) => {
        policy = next;
      }),
      readPolicy: vi.fn(async () => {
        if (!policy) throw new VaultError('not-found', { status: 404 });
        return policy;
      }),
    });
    const executor = new ChangePlanExecutor({
      gateway,
      session,
      plan: policyPlan(),
      loadFreshState: vi.fn(async () => ({
        fingerprint: 'v1-current',
        visibility: complete,
      })),
    });
    const progress = vi.fn();

    const first = executor.apply({ onProgress: progress });
    const second = executor.apply({ onProgress: progress });

    await expect(first).resolves.toMatchObject({ status: 'completed' });
    await expect(second).resolves.toMatchObject({ status: 'completed' });
    expect(gateway.writePolicy).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith('write-policy', 'running');
    expect(progress).toHaveBeenCalledWith('write-policy', 'completed');
  });

  it('stops at failure, compensates only an unreferenced policy created by the plan, and reports recovery', async () => {
    let policyExists = false;
    const group: VaultIdentityGroup = {
      id: 'group-1',
      name: 'Readers',
      type: 'internal',
      policies: [],
      memberEntityIds: [],
      memberGroupIds: [],
      metadata: { managed_by: 'vault-console' },
    };
    const plan: ChangePlan = {
      ...policyPlan(),
      operations: [
        policyPlan().operations[0],
        {
          id: 'update-group',
          kind: 'update-group',
          label: 'Attach role to group',
          dependsOn: [],
          requirements: [{
            path: 'identity/group/id/group-1',
            anyOf: ['update'],
          }],
          effectTiming: 'next-request',
          risk: 'normal',
          groupId: 'group-1',
          group: {
            name: group.name,
            policies: ['vc-role-reader'],
            memberEntityIds: [],
            memberGroupIds: [],
            metadata: group.metadata,
          },
        },
      ],
    };
    const writtenPolicy = policyPlan().operations[0];
    if (writtenPolicy.kind !== 'write-policy') throw new Error('Expected write policy operation');
    const gateway = vaultAccessControlGatewayMock({
      getCapabilities: vi.fn(async () => ({
        'sys/policies/acl/vc-role-reader': ['create'] as const,
        'identity/group/id/group-1': ['update'] as const,
      })),
      writePolicy: vi.fn(async () => {
        policyExists = true;
      }),
      readPolicy: vi.fn(async () => {
        if (!policyExists) throw new VaultError('not-found', { status: 404 });
        return writtenPolicy.policy;
      }),
      deletePolicy: vi.fn(async () => {
        policyExists = false;
      }),
      updateGroup: vi.fn(async () => {
        throw new VaultError('authorization', { status: 403 });
      }),
    });
    const executor = new ChangePlanExecutor({
      gateway,
      session,
      plan,
      loadFreshState: vi.fn(async () => ({
        fingerprint: 'v1-current',
        visibility: complete,
      })),
    });

    const result = await executor.apply();

    expect(result.status).toBe('partial');
    expect(result.failedOperationId).toBe('update-group');
    expect(result.operations).toContainEqual({
      operationId: 'write-policy',
      state: 'compensated',
    });
    expect(result.recovery.map(({ operationId }) => operationId)).toContain('update-group');
    expect(gateway.deletePolicy).toHaveBeenCalledWith(
      session,
      'vc-role-reader',
      undefined,
    );
  });

  it('does not compensate a created policy after a completed dependent attachment', async () => {
    const base = policyPlan();
    const baseWrite = base.operations[0];
    if (baseWrite.kind !== 'write-policy') throw new Error('Expected write policy operation');
    let readCount = 0;
    const plan: ChangePlan = {
      ...base,
      operations: [
        base.operations[0],
        {
          id: 'attach',
          kind: 'update-userpass-policies',
          label: 'Attach role',
          dependsOn: ['write-policy'],
          requirements: [{
            path: 'auth/userpass/users/alice/policies',
            anyOf: ['update'],
          }],
          effectTiming: 'next-login',
          risk: 'normal',
          mount: 'userpass',
          username: 'alice',
          policies: ['vc-role-reader'],
        },
        {
          id: 'later-failure',
          kind: 'delete-group',
          label: 'Later failure',
          dependsOn: ['attach'],
          requirements: [{
            path: 'identity/group/id/group-1',
            anyOf: ['delete'],
          }],
          effectTiming: 'destructive-cleanup',
          risk: 'normal',
          groupId: 'group-1',
        },
      ],
    };
    const gateway = vaultAccessControlGatewayMock({
      getCapabilities: vi.fn(async () => ({
        'sys/policies/acl/vc-role-reader': ['create'] as const,
        'auth/userpass/users/alice/policies': ['update'] as const,
        'identity/group/id/group-1': ['delete'] as const,
      })),
      readPolicy: vi.fn(async () => baseWrite.policy),
      readUserpassAccount: vi.fn(async () => ({
        username: 'alice',
        mount: 'userpass',
        tokenPolicies: ['vc-role-reader'],
      })),
      deleteGroup: vi.fn(async () => {
        throw new VaultError('authorization', { status: 403 });
      }),
    });
    const executor = new ChangePlanExecutor({
      gateway,
      session,
      plan,
      loadFreshState: vi.fn(async () => ({
        fingerprint: 'v1-current',
        visibility: complete,
      })),
    });

    const result = await executor.apply();

    expect(result.status).toBe('partial');
    expect(gateway.deletePolicy).not.toHaveBeenCalled();
    expect(result.operations).toContainEqual({
      operationId: 'write-policy',
      state: 'completed',
    });
    expect(readCount).toBe(0);
  });
});

function neverValue(): never {
  throw new Error('Unreachable test branch');
}
