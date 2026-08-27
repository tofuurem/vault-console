import { env } from 'node:process';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ChangePlanExecutor,
  type FreshPlanState,
} from '@/application/vault/access-lifecycle/change-plan-executor';
import {
  buildCreateGroupPlan,
  buildDeleteGroupPlan,
  buildUpdateGroupPlan,
  loadGroupLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/group-lifecycle';
import {
  buildAdoptRolePlan,
  buildCreateRolePlan,
  buildDeleteRolePlan,
  buildUpdateRolePlan,
  loadRoleLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/role-lifecycle';
import {
  buildPurgeIdentityPlan,
  buildResetPasswordPlan,
  buildToggleEntityPlan,
  buildUserEditPlan,
  buildUserRemovalPlan,
  loadIdentityTombstoneSnapshot,
  loadUserLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/user-lifecycle';
import {
  identityEntityFingerprint,
  userpassAccountFingerprint,
} from '@/application/vault/access-lifecycle/snapshot-normalization';
import { CreateUserTransaction } from '@/application/vault/createUserTransaction';
import type { AccessControlSnapshot } from '@/application/vault/useAccessControlData';
import type {
  ChangePlan,
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';
import {
  compileKvV2Policy,
  type LogicalKvAccessRule,
} from '@/domain/access-control/kv-v2-policy-compiler';
import { renderManagedPolicy } from '@/domain/access-control/policy-ownership';
import type {
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import {
  vaultPassword,
  vaultToken,
} from '@/domain/vault/sensitive-value';
import { VaultAccessControlAdapter } from '@/infrastructure/vault/access-control/vault-access-control-adapter';
import { VaultAuthAdapter } from '@/infrastructure/vault/auth/vault-auth-adapter';
import { VaultKvV2Adapter } from '@/infrastructure/vault/kv-v2/vault-kv-v2-adapter';

const vaultAddress = env.VAULT_TEST_ADDR;
const rootToken = env.VAULT_TEST_TOKEN;
const runAgainstVault = vaultAddress && rootToken
  ? describe.sequential
  : describe.skip;

runAgainstVault('Vault Community integration', () => {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const kvMount = `console-kv-${suffix}`;
  const userpassMount = `console-userpass-${suffix}`;
  const rolePolicy = `vc-role-integration-${suffix}`;
  const externalPolicy = `console-external-${suffix}`;
  const adoptedRole = `vc-role-adopted-${suffix}`;
  const lifecycleRole = `vc-role-lifecycle-${suffix}`;
  const tokenPolicy = `console-token-${suffix}`;
  const groupName = `console-group-${suffix}`;
  const lifecycleGroupName = `console-lifecycle-group-${suffix}`;
  const nestedGroupName = `console-nested-${suffix}`;
  const username = `console-user-${suffix}`;
  const password = `Vc-${crypto.randomUUID()}-9!`;
  const replacementPassword = `Vr-${crypto.randomUUID()}-8!`;
  const access = new VaultAccessControlAdapter();
  const auth = new VaultAuthAdapter();
  const kv = new VaultKvV2Adapter();
  const rootSession: VaultSession = {
    serverUrl: vaultAddress!,
    token: vaultToken(rootToken!),
    authMethod: 'token',
  };
  let group: VaultIdentityGroup | undefined;
  let nestedGroupId: string | undefined;
  let lifecycleGroupId: string | undefined;
  let transaction: CreateUserTransaction | undefined;
  let userpassAccessor = '';
  let managedEntity: VaultIdentityEntity | undefined;

  function logicalRule(
    policyName: string,
    path: string,
    level: LogicalKvAccessRule['level'] = 'view',
  ): LogicalKvAccessRule {
    return {
      mount: kvMount,
      path,
      target: 'folder',
      level,
      source: {
        kind: 'role',
        id: policyName,
        label: policyName,
      },
    };
  }

  function roleHcl(
    policyName: string,
    path: string,
    description: string,
  ): string {
    return renderManagedPolicy(
      { kind: 'role', description },
      compileKvV2Policy([logicalRule(policyName, path)]).hcl,
    );
  }

  async function setupRequest(
    path: string,
    method: 'POST' | 'DELETE',
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetch(`${vaultAddress}/v1/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Token': rootToken!,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Vault integration fixture ${method} ${path} failed with HTTP ${response.status}.`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function applyPlan(
    plan: ChangePlan,
    loadFreshState: () => Promise<FreshPlanState>,
    confirmation?: string,
  ): Promise<PlanExecutionResult> {
    const result = await new ChangePlanExecutor({
      gateway: access,
      session: rootSession,
      plan,
      loadFreshState,
    }).apply({ confirmation });
    if (result.status !== 'completed') {
      throw new Error(`Vault lifecycle plan ${plan.id} did not complete: ${JSON.stringify(result)}`);
    }
    return result;
  }

  async function waitForEntityMembership(
    groupId: string,
    expected: boolean,
  ): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const entity = await access.readEntity(rootSession, managedEntity!.id);
      if (entity.groupIds.includes(groupId) === expected) return;
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });
    }
    throw new Error(
      `Vault Identity did not converge to group ${groupId} membership=${String(expected)}.`,
    );
  }

  beforeAll(async () => {
    await setupRequest(`sys/mounts/${kvMount}`, 'POST', {
      type: 'kv',
      options: { version: '2' },
    });
    await setupRequest(`sys/auth/${userpassMount}`, 'POST', { type: 'userpass' });
    const mount = (await access.listAuthMounts(rootSession))
      .find((candidate) => candidate.path === userpassMount);
    if (!mount) throw new Error('Vault integration userpass mount was not discoverable.');
    userpassAccessor = mount.accessor;

    await access.writePolicy(rootSession, {
      name: rolePolicy,
      policy: roleHcl(rolePolicy, 'allowed', 'Integration readers'),
    });
    await access.writePolicy(rootSession, {
      name: externalPolicy,
      policy: 'path "sys/health" { capabilities = ["read"] }',
    });
    const nestedResponse = await setupRequest('identity/group', 'POST', {
      name: nestedGroupName,
      type: 'internal',
    }) as { data: { id: string } };
    nestedGroupId = nestedResponse.data.id;
    const groupResponse = await setupRequest('identity/group', 'POST', {
      name: groupName,
      type: 'internal',
      policies: [rolePolicy, externalPolicy],
      member_group_ids: [nestedGroupId],
      metadata: {
        managed_by: 'vault-console',
        schema: '1',
        description: 'Integration group',
        external_marker: 'preserve-me',
      },
    }) as { data: { id: string } };
    group = await access.readGroup(rootSession, groupResponse.data.id);
  });

  afterAll(async () => {
    if (transaction) {
      await transaction.rollback({
        report: vi.fn(),
        signal: new AbortController().signal,
      }).catch(() => undefined);
    }
    if (lifecycleGroupId) {
      await access.deleteGroup(rootSession, lifecycleGroupId).catch(() => undefined);
    }
    if (group) await access.deleteGroup(rootSession, group.id).catch(() => undefined);
    if (nestedGroupId) {
      await access.deleteGroup(rootSession, nestedGroupId).catch(() => undefined);
    }
    await Promise.all([
      rolePolicy,
      externalPolicy,
      adoptedRole,
      lifecycleRole,
      tokenPolicy,
      `vc-user-${username}`,
    ].map((name) => access.deletePolicy(rootSession, name).catch(() => undefined)));
    await setupRequest(`sys/auth/${userpassMount}`, 'DELETE').catch(() => undefined);
    await setupRequest(`sys/mounts/${kvMount}`, 'DELETE').catch(() => undefined);
  });

  it('distinguishes invalid tokens from valid lookup-forbidden tokens', async () => {
    await expect(
      auth.validateToken(vaultAddress!, vaultToken(`invalid-${suffix}`)),
    ).rejects.toMatchObject({ code: 'session-expired', status: 403 });

    await kv.writeSecret(rootSession, kvMount, 'token-check/demo', { status: 'ok' }, { type: 'create-only' });
    await access.writePolicy(rootSession, {
      name: tokenPolicy,
      policy: [
        `path "${kvMount}/data/token-check/demo" {`,
        '  capabilities = ["read"]',
        '}',
      ].join('\n'),
    });
    const created = await setupRequest('auth/token/create', 'POST', {
      policies: [tokenPolicy],
      no_default_policy: true,
      ttl: '5m',
    }) as { auth: { client_token: string } };
    const rawToken = created.auth.client_token;
    const degradedSession = await auth.validateToken(vaultAddress!, vaultToken(rawToken));
    expect(degradedSession).toMatchObject({
      serverUrl: vaultAddress,
      authMethod: 'token',
    });
    expect(degradedSession).not.toHaveProperty('displayName');
    await expect(
      kv.readSecret(degradedSession, kvMount, 'token-check/demo'),
    ).resolves.toMatchObject({ data: { status: 'ok' } });

    await setupRequest('auth/token/revoke', 'POST', { token: rawToken });
    await expect(
      auth.getCapabilities(degradedSession, [`${kvMount}/data/token-check/demo`]),
    ).rejects.toMatchObject({ code: 'session-expired', status: 403 });
  });

  it('creates an identity-backed user and enforces canonical KV v2 access', async () => {
    const userpass = (await access.listAuthMounts(rootSession))
      .find((mount) => mount.path === userpassMount);
    expect(userpass).toBeDefined();
    const snapshot = {
      authMounts: [userpass!],
      userpassMounts: [userpass!],
      groups: [group!],
      policies: [],
      roles: [],
      users: [],
      warnings: [],
    } satisfies AccessControlSnapshot;
    transaction = new CreateUserTransaction(access, rootSession, snapshot, {
      username,
      displayName: `Integration ${suffix}`,
      userpassMount,
      password,
      directRolePolicyNames: [],
      groups: [group!],
    });

    await transaction.apply({
      report: vi.fn(),
      signal: new AbortController().signal,
    });
    managedEntity = await access.lookupEntityByAlias(
      rootSession,
      username,
      userpassAccessor,
    ) ?? undefined;
    expect(managedEntity?.metadata).toMatchObject({ managed_by: 'vault-console' });
    await waitForEntityMembership(group!.id, true);
    await kv.writeSecret(rootSession, kvMount, 'allowed/demo', { status: 'ok' }, { type: 'create-only' });
    await kv.writeSecret(rootSession, kvMount, 'forbidden/demo', { status: 'blocked' }, { type: 'create-only' });

    const userSession = await auth.loginUserpass({
      serverUrl: vaultAddress!,
      mount: userpassMount,
      username,
      password: vaultPassword(password),
    });
    await expect(kv.readSecret(userSession, kvMount, 'allowed/demo')).resolves.toMatchObject({
      data: { status: 'ok' },
    });
    await expect(kv.listPaths(userSession, kvMount, 'allowed')).resolves.toContain('demo');
    await expect(kv.readSecretMetadata(userSession, kvMount, 'allowed/demo')).resolves.toMatchObject({
      currentVersion: 1,
    });
    await expect(kv.readSecret(userSession, kvMount, 'forbidden/demo')).rejects.toBeInstanceOf(
      VaultError,
    );

    const refreshedGroup = await access.readGroup(rootSession, group!.id);
    expect(refreshedGroup.policies).toEqual(expect.arrayContaining([
      rolePolicy,
      externalPolicy,
    ]));
    expect(refreshedGroup.memberGroupIds).toContain(nestedGroupId);
    expect(refreshedGroup.metadata.external_marker).toBe('preserve-me');
  });

  it('executes managed role and group CRUD with adoption and dependency guards', async () => {
    const roleBaseline = await loadRoleLifecycleSnapshot(
      access,
      rootSession,
      lifecycleRole,
    );
    const createRolePlan = buildCreateRolePlan(roleBaseline, {
      policyName: lifecycleRole,
      description: 'Lifecycle readers',
      hcl: compileKvV2Policy([
        logicalRule(lifecycleRole, 'lifecycle'),
      ]).hcl,
    });
    await applyPlan(createRolePlan, async () => {
      const fresh = await loadRoleLifecycleSnapshot(access, rootSession, lifecycleRole);
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    });

    const groupBaseline = await loadGroupLifecycleSnapshot(access, rootSession);
    const createGroupPlan = buildCreateGroupPlan(groupBaseline, {
      name: lifecycleGroupName,
      description: 'Lifecycle integration group',
      memberEntityIds: [managedEntity!.id],
      managedRolePolicyNames: [lifecycleRole],
      selectedRolePolicyNames: [lifecycleRole],
      permissionDiff: { added: [], removed: [] },
    });
    const createGroupResult = await applyPlan(createGroupPlan, async () => {
      const fresh = await loadGroupLifecycleSnapshot(access, rootSession);
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    });
    lifecycleGroupId = createGroupResult.operations.find(
      ({ operationId }) => operationId === 'create-group',
    )?.resourceId;
    expect(lifecycleGroupId).toBeTruthy();
    await waitForEntityMembership(lifecycleGroupId!, true);

    const referencedRole = await loadRoleLifecycleSnapshot(
      access,
      rootSession,
      lifecycleRole,
    );
    expect(referencedRole.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'group',
        id: lifecycleGroupId,
      }),
    ]));
    expect(() => buildDeleteRolePlan(referencedRole)).toThrow(/attached/i);

    const groupWithMember = await loadGroupLifecycleSnapshot(
      access,
      rootSession,
      lifecycleGroupId,
    );
    expect(() => buildDeleteGroupPlan(groupWithMember)).toThrow(/empty/i);
    const updateGroupPlan = buildUpdateGroupPlan(groupWithMember, {
      name: `${lifecycleGroupName}-updated`,
      description: 'Detached lifecycle group',
      memberEntityIds: [],
      managedRolePolicyNames: [lifecycleRole],
      selectedRolePolicyNames: [],
      permissionDiff: { added: [], removed: [] },
    });
    await applyPlan(updateGroupPlan, async () => {
      const fresh = await loadGroupLifecycleSnapshot(
        access,
        rootSession,
        lifecycleGroupId,
      );
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    });
    const updatedGroup = await access.readGroup(rootSession, lifecycleGroupId!);
    expect(updatedGroup).toMatchObject({
      name: `${lifecycleGroupName}-updated`,
      memberEntityIds: [],
      policies: [],
      metadata: {
        managed_by: 'vault-console',
        description: 'Detached lifecycle group',
      },
    });
    await waitForEntityMembership(lifecycleGroupId!, false);

    const deletableGroup = await loadGroupLifecycleSnapshot(
      access,
      rootSession,
      lifecycleGroupId,
    );
    await applyPlan(buildDeleteGroupPlan(deletableGroup), async () => {
      const fresh = await loadGroupLifecycleSnapshot(
        access,
        rootSession,
        lifecycleGroupId,
      );
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    });
    await expect(access.readGroup(rootSession, lifecycleGroupId!)).rejects.toMatchObject({
      code: 'not-found',
    });
    lifecycleGroupId = undefined;

    const managedRole = await loadRoleLifecycleSnapshot(
      access,
      rootSession,
      lifecycleRole,
    );
    const updateRolePlan = buildUpdateRolePlan(managedRole, {
      policyName: lifecycleRole,
      description: 'Lifecycle readers updated',
      hcl: compileKvV2Policy([
        logicalRule(lifecycleRole, 'lifecycle-updated'),
      ]).hcl,
    });
    await applyPlan(updateRolePlan, async () => {
      const fresh = await loadRoleLifecycleSnapshot(access, rootSession, lifecycleRole);
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    });
    expect((await access.readPolicy(rootSession, lifecycleRole)).policy).toContain(
      'Lifecycle readers updated',
    );

    const unverifiedBody = compileKvV2Policy([
      logicalRule(adoptedRole, 'adopted'),
    ]).hcl;
    await access.writePolicy(rootSession, {
      name: adoptedRole,
      policy: unverifiedBody,
    });
    const unverified = await loadRoleLifecycleSnapshot(
      access,
      rootSession,
      adoptedRole,
    );
    const adoptPlan = buildAdoptRolePlan(unverified, 'Adopted integration role');
    await applyPlan(adoptPlan, async () => {
      const fresh = await loadRoleLifecycleSnapshot(access, rootSession, adoptedRole);
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    });
    const adopted = await access.readPolicy(rootSession, adoptedRole);
    expect(adopted.policy).toBe(renderManagedPolicy({
      kind: 'role',
      description: 'Adopted integration role',
    }, unverifiedBody));

    for (const policyName of [lifecycleRole, adoptedRole]) {
      const snapshot = await loadRoleLifecycleSnapshot(
        access,
        rootSession,
        policyName,
      );
      const deletePlan = buildDeleteRolePlan(snapshot);
      await applyPlan(deletePlan, async () => {
        const fresh = await loadRoleLifecycleSnapshot(
          access,
          rootSession,
          policyName,
        );
        return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
      }, policyName);
      await expect(access.readPolicy(rootSession, policyName)).rejects.toMatchObject({
        code: 'not-found',
      });
    }
  });

  it('preserves external userpass state and enforces lifecycle timing and cleanup', async () => {
    await setupRequest(
      `auth/${userpassMount}/users/${encodeURIComponent(username)}`,
      'POST',
      {
        token_policies: [externalPolicy],
        token_ttl: '45m',
        token_max_ttl: '2h',
        token_explicit_max_ttl: '90m',
        token_bound_cidrs: ['0.0.0.0/0'],
        token_type: 'service',
        token_num_uses: 0,
        token_period: 0,
        token_no_default_policy: true,
      },
    );
    const sessionBeforeEdit = await auth.loginUserpass({
      serverUrl: vaultAddress!,
      mount: userpassMount,
      username,
      password: vaultPassword(password),
    });
    await expect(
      kv.readSecret(sessionBeforeEdit, kvMount, 'allowed/demo'),
    ).resolves.toMatchObject({ data: { status: 'ok' } });

    await kv.writeSecret(rootSession, kvMount, 'direct/demo', { source: 'direct' }, { type: 'create-only' });
    const snapshot = await loadUserLifecycleSnapshot(access, rootSession, {
      mount: userpassMount,
      mountAccessor: userpassAccessor,
      username,
    });
    const directPolicyName = `vc-user-${username}`;
    const directPolicy = {
      name: directPolicyName,
      policy: renderManagedPolicy(
        { kind: 'user-direct', owner: username },
        compileKvV2Policy([{
          ...logicalRule(directPolicyName, 'direct'),
          source: {
            kind: 'user-rule',
            id: directPolicyName,
            label: username,
          },
        }]).hcl,
      ),
    };
    const editPlan = buildUserEditPlan(snapshot, {
      displayName: `Lifecycle ${suffix}`,
      groupIds: [],
      directRolePolicyNames: [rolePolicy],
      managedRolePolicyNames: [rolePolicy],
      directPolicy,
      adoptDirectPolicy: false,
    });
    await applyPlan(editPlan, async () => {
      const fresh = await loadUserLifecycleSnapshot(access, rootSession, {
        mount: userpassMount,
        mountAccessor: userpassAccessor,
        username,
      });
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    });

    const editedAccount = await access.readUserpassAccount(
      rootSession,
      userpassMount,
      username,
    );
    expect(editedAccount).toMatchObject({
      tokenPolicies: expect.arrayContaining([
        externalPolicy,
        rolePolicy,
        directPolicyName,
      ]),
      tokenTtlSeconds: 2_700,
      tokenMaxTtlSeconds: 7_200,
      tokenExplicitMaxTtlSeconds: 5_400,
      tokenBoundCidrs: ['0.0.0.0/0'],
      tokenType: 'service',
      tokenNumUses: 0,
      tokenPeriodSeconds: 0,
      tokenNoDefaultPolicy: true,
    });
    expect(editedAccount?.tokenPolicies).not.toContain('default');
    expect((await access.readGroup(rootSession, group!.id)).memberEntityIds)
      .not.toContain(managedEntity!.id);
    expect((await access.readEntity(rootSession, managedEntity!.id)).name)
      .toBe(`Lifecycle ${suffix}`);

    await expect(
      kv.readSecret(sessionBeforeEdit, kvMount, 'allowed/demo'),
    ).rejects.toMatchObject({ code: 'authorization' });
    const sessionAfterEdit = await auth.loginUserpass({
      serverUrl: vaultAddress!,
      mount: userpassMount,
      username,
      password: vaultPassword(password),
    });
    await expect(
      kv.readSecret(sessionAfterEdit, kvMount, 'allowed/demo'),
    ).resolves.toMatchObject({ data: { status: 'ok' } });
    await expect(
      kv.readSecret(sessionAfterEdit, kvMount, 'direct/demo'),
    ).resolves.toMatchObject({ data: { source: 'direct' } });

    const passwordSnapshot = await loadUserLifecycleSnapshot(
      access,
      rootSession,
      {
        mount: userpassMount,
        mountAccessor: userpassAccessor,
        username,
      },
    );
    const passwordPlan = buildResetPasswordPlan(
      passwordSnapshot,
      vaultPassword(replacementPassword),
    );
    await applyPlan(passwordPlan, async () => {
      const fresh = await access.readUserpassAccount(
        rootSession,
        userpassMount,
        username,
      );
      if (!fresh) throw new Error('The integration user unexpectedly disappeared.');
      return {
        fingerprint: userpassAccountFingerprint(fresh),
        visibility: { complete: true, reasons: [] },
      };
    });
    await expect(auth.loginUserpass({
      serverUrl: vaultAddress!,
      mount: userpassMount,
      username,
      password: vaultPassword(password),
    })).rejects.toMatchObject({ code: 'authentication' });
    await expect(
      kv.readSecret(sessionAfterEdit, kvMount, 'allowed/demo'),
    ).resolves.toMatchObject({ data: { status: 'ok' } });
    const sessionAfterPasswordReset = await auth.loginUserpass({
      serverUrl: vaultAddress!,
      mount: userpassMount,
      username,
      password: vaultPassword(replacementPassword),
    });

    const enabledSnapshot = await loadUserLifecycleSnapshot(
      access,
      rootSession,
      {
        mount: userpassMount,
        mountAccessor: userpassAccessor,
        username,
      },
    );
    const disablePlan = buildToggleEntityPlan(enabledSnapshot, true);
    await applyPlan(disablePlan, async () => {
      const fresh = await access.readEntity(rootSession, managedEntity!.id);
      return {
        fingerprint: identityEntityFingerprint(fresh),
        visibility: { complete: true, reasons: [] },
      };
    });
    await expect(
      kv.readSecret(sessionAfterPasswordReset, kvMount, 'allowed/demo'),
    ).rejects.toMatchObject({ code: 'authorization' });

    const disabledSnapshot = await loadUserLifecycleSnapshot(
      access,
      rootSession,
      {
        mount: userpassMount,
        mountAccessor: userpassAccessor,
        username,
      },
    );
    const enablePlan = buildToggleEntityPlan(disabledSnapshot, false);
    await applyPlan(enablePlan, async () => {
      const fresh = await access.readEntity(rootSession, managedEntity!.id);
      return {
        fingerprint: identityEntityFingerprint(fresh),
        visibility: { complete: true, reasons: [] },
      };
    });
    await expect(
      kv.readSecret(sessionAfterPasswordReset, kvMount, 'allowed/demo'),
    ).resolves.toMatchObject({ data: { status: 'ok' } });

    const removalSnapshot = await loadUserLifecycleSnapshot(
      access,
      rootSession,
      {
        mount: userpassMount,
        mountAccessor: userpassAccessor,
        username,
      },
    );
    const removal = buildUserRemovalPlan(removalSnapshot);
    expect(removal.mode).toBe('managed-tombstone');
    await applyPlan(removal.plan, async () => {
      const fresh = await loadUserLifecycleSnapshot(access, rootSession, {
        mount: userpassMount,
        mountAccessor: userpassAccessor,
        username,
      });
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    }, username);
    expect(await access.readUserpassAccount(
      rootSession,
      userpassMount,
      username,
    )).toBeNull();
    const tombstoneEntity = await access.readEntity(rootSession, managedEntity!.id);
    expect(tombstoneEntity).toMatchObject({
      disabled: true,
      policies: [],
      aliases: [],
      metadata: {
        managed_by: 'vault-console',
        lifecycle_state: 'login-removed',
        username,
        auth_mount: userpassMount,
      },
    });
    await expect(
      kv.readSecret(sessionAfterPasswordReset, kvMount, 'allowed/demo'),
    ).rejects.toMatchObject({ code: 'authorization' });

    const tombstone = await loadIdentityTombstoneSnapshot(
      access,
      rootSession,
      managedEntity!.id,
    );
    const purgePlan = buildPurgeIdentityPlan(tombstone);
    await applyPlan(purgePlan, async () => {
      const fresh = await loadIdentityTombstoneSnapshot(
        access,
        rootSession,
        managedEntity!.id,
      );
      return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
    }, tombstone.entity.name);
    await expect(
      access.readEntity(rootSession, managedEntity!.id),
    ).rejects.toMatchObject({ code: 'not-found' });
    transaction = undefined;
  });
});
