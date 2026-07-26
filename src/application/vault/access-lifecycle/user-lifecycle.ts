import {
  assessPlanRisk,
  permissionDiff,
  snapshotFingerprint,
} from '@/domain/access-control/lifecycle/change-plan';
import type {
  ChangeOperation,
  ChangePlan,
  DependencyVisibility,
  IdentityTombstoneSnapshot,
  RoleDependency,
  UserLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import { parseManagedPolicyHcl } from '@/domain/access-control/managed-resources';
import {
  assessPolicyOwnership,
  renderManagedPolicy,
  USER_POLICY_PREFIX,
} from '@/domain/access-control/policy-ownership';
import { assessIdentityOwnership } from '@/domain/access-control/resource-ownership';
import type {
  VaultAccessControlGateway,
  VaultAclPolicy,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import {
  normalizeVaultError,
  VaultError,
} from '@/domain/vault/errors';
import type { VaultPassword } from '@/domain/vault/sensitive-value';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';
import {
  canonicalDependencies,
  canonicalIdentityEntity,
  canonicalIdentityGroup,
  canonicalUserpassAccount,
  canonicalVisibility,
  identityEntityFingerprint,
  userpassAccountFingerprint,
} from './snapshot-normalization';

export interface UserLifecycleRef {
  readonly mount: string;
  readonly mountAccessor: string;
  readonly username: string;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return [...new Set(left)].sort().join('\u0000')
    === [...new Set(right)].sort().join('\u0000');
}

function visibility(reasons: readonly string[]): DependencyVisibility {
  const uniqueReasons = unique(reasons);
  return { complete: uniqueReasons.length === 0, reasons: uniqueReasons };
}

async function optionalResource<T>(
  load: () => Promise<T>,
  reason: string,
  reasons: string[],
  fallback: T,
): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired' || error.code === 'aborted') throw error;
    reasons.push(reason);
    return fallback;
  }
}

function policyReferences(
  policyName: string,
  current: UserLifecycleRef,
  accounts: readonly {
    readonly mount: string;
    readonly username: string;
    readonly tokenPolicies: readonly string[];
  }[],
  groups: readonly VaultIdentityGroup[],
  entities: readonly VaultIdentityEntity[],
): readonly RoleDependency[] {
  return [
    ...accounts.flatMap((account): readonly RoleDependency[] => (
      account.tokenPolicies.includes(policyName)
      && (account.mount !== current.mount || account.username !== current.username)
        ? [{
            kind: 'user',
            id: `${account.mount}:${account.username}`,
            name: account.username,
          }]
        : []
    )),
    ...groups.flatMap((group): readonly RoleDependency[] => (
      group.policies.includes(policyName)
        ? [{ kind: 'group', id: group.id, name: group.name }]
        : []
    )),
    ...entities.flatMap((candidate): readonly RoleDependency[] => (
      candidate.policies.includes(policyName)
        ? [{ kind: 'user', id: candidate.id, name: candidate.name }]
        : []
    )),
  ];
}

async function readOptionalPolicy(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  policyName: string,
  signal?: AbortSignal,
): Promise<VaultAclPolicy | null> {
  try {
    return await gateway.readPolicy(session, policyName, signal);
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'not-found') return null;
    throw error;
  }
}

function snapshotValue(snapshot: Omit<UserLifecycleSnapshot, 'fingerprint'>): unknown {
  return {
    account: canonicalUserpassAccount(snapshot.account),
    mountAccessor: snapshot.mountAccessor,
    entity: snapshot.entity ? canonicalIdentityEntity(snapshot.entity) : null,
    groups: [...snapshot.groups]
      .map(canonicalIdentityGroup)
      .sort((left, right) => left.id.localeCompare(right.id)),
    directPolicy: snapshot.directPolicy,
    directPolicyOwnership: snapshot.directPolicyOwnership,
    policyReferences: canonicalDependencies(snapshot.policyReferences),
    visibility: canonicalVisibility(snapshot.visibility),
  };
}

export async function loadUserLifecycleSnapshot(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  reference: UserLifecycleRef,
  signal?: AbortSignal,
): Promise<UserLifecycleSnapshot> {
  const account = await gateway.readUserpassAccount(
    session,
    reference.mount,
    reference.username,
    signal,
  );
  if (!account) throw new VaultError('not-found', { status: 404 });

  const reasons: string[] = [];
  const entity = await optionalResource(
    () => gateway.lookupEntityByAlias(
      session,
      reference.username,
      reference.mountAccessor,
      signal,
    ),
    'The linked Identity entity could not be read.',
    reasons,
    null,
  );
  const groups = await optionalResource(
    () => gateway.listGroups(session, signal),
    'Identity groups could not be fully listed.',
    reasons,
    [],
  );
  const entities = await optionalResource(
    () => gateway.listEntities(session, signal),
    'Identity entities could not be fully listed.',
    reasons,
    [],
  );
  const authMounts = await optionalResource(
    () => gateway.listAuthMounts(session, signal),
    'Userpass mounts could not be fully listed.',
    reasons,
    [],
  );
  const accounts = (
    await mapWithConcurrency(
      authMounts.filter(({ type }) => type === 'userpass'),
      4,
      async (mount) => optionalResource(
        () => gateway.listUserpassAccounts(session, mount.path, signal),
        `Accounts at auth/${mount.path} could not be fully listed.`,
        reasons,
        [],
      ),
    )
  ).flat();

  const directPolicyName = `${USER_POLICY_PREFIX}${reference.username}`;
  const directPolicy = await optionalResource(
    () => readOptionalPolicy(
      gateway,
      session,
      directPolicyName,
      signal,
    ),
    `The reserved policy ${directPolicyName} could not be checked safely.`,
    reasons,
    null,
  );
  const ownership = directPolicy
    ? assessPolicyOwnership(directPolicy.name, directPolicy.policy)
    : null;
  const references = directPolicy
    ? policyReferences(
        directPolicy.name,
        reference,
        accounts,
        groups,
        entities,
      )
    : [];
  const snapshotVisibility = visibility(reasons.sort());
  const directAttachedToAccount = account.tokenPolicies.includes(directPolicyName);
  const base: Omit<UserLifecycleSnapshot, 'fingerprint'> = {
    account,
    mountAccessor: reference.mountAccessor,
    entity,
    groups,
    directPolicy,
    directPolicyOwnership: ownership?.state ?? 'absent',
    directPolicyEditable: directPolicy
      ? Boolean(
          ownership?.editable
          && directAttachedToAccount
          && references.length === 0
          && snapshotVisibility.complete
        )
      : snapshotVisibility.complete,
    policyReferences: references,
    visibility: snapshotVisibility,
  };
  return {
    ...base,
    fingerprint: snapshotFingerprint(snapshotValue(base)),
  };
}

export interface UserEditDraft {
  readonly displayName: string;
  readonly groupIds: readonly string[];
  readonly directRolePolicyNames: readonly string[];
  readonly managedRolePolicyNames: readonly string[];
  readonly directPolicy: VaultAclPolicy | null;
  readonly adoptDirectPolicy: boolean;
}

function capability(
  path: string,
  ...anyOf: Extract<ChangeOperation, { kind: string }>['requirements'][number]['anyOf']
) {
  return [{ path, anyOf }] as const;
}

function policyRules(policy: VaultAclPolicy | null) {
  return policy ? (parseManagedPolicyHcl(policy.policy) ?? []) : [];
}

export function buildUserEditPlan(
  snapshot: UserLifecycleSnapshot,
  draft: UserEditDraft,
): ChangePlan {
  const operations: ChangeOperation[] = [];
  const username = snapshot.account.username;
  const directName = `${USER_POLICY_PREFIX}${username}`;
  const currentDirect = snapshot.directPolicy;
  const directAttachedToAccount = snapshot.account.tokenPolicies.includes(directName);
  let nextDirect = draft.directPolicy;

  if (
    (currentDirect && currentDirect.name !== directName)
    || (nextDirect && nextDirect.name !== directName)
  ) {
    throw new VaultError('invalid-request');
  }
  if (snapshot.directPolicyOwnership === 'unverified') {
    if (draft.adoptDirectPolicy) {
      if (
        !snapshot.directPolicyEditable
        || snapshot.policyReferences.length > 0
        || !snapshot.visibility.complete
        || !currentDirect
      ) throw new VaultError('invalid-request');
      nextDirect = {
        name: currentDirect.name,
        policy: renderManagedPolicy(
          { kind: 'user-direct', owner: username },
          currentDirect.policy,
        ),
      };
    } else if (
      !currentDirect
      || nextDirect?.policy !== currentDirect.policy
    ) {
      throw new VaultError('invalid-request');
    }
  }
  const preservingUnverified = snapshot.directPolicyOwnership === 'unverified'
    && !draft.adoptDirectPolicy
    && nextDirect?.policy === currentDirect?.policy;
  if (nextDirect && !preservingUnverified) {
    const nextOwnership = assessPolicyOwnership(nextDirect.name, nextDirect.policy);
    if (
      nextOwnership.state !== 'managed'
      || nextOwnership.header?.kind !== 'user-direct'
      || nextOwnership.header.owner !== username
      || !nextOwnership.editable
    ) throw new VaultError('invalid-request');
  }

  const policyChanged = (currentDirect?.policy.trim() ?? '')
    !== (nextDirect?.policy.trim() ?? '');
  if (
    currentDirect
    && policyChanged
    && !snapshot.directPolicyEditable
  ) {
    throw new VaultError('invalid-request');
  }
  if (nextDirect && policyChanged) {
    operations.push({
      id: 'write-direct-policy',
      kind: 'write-policy',
      label: currentDirect ? 'Update direct KV policy' : 'Create direct KV policy',
      dependsOn: [],
      requirements: capability(
        `sys/policies/acl/${encodeURIComponent(directName)}`,
        'create',
        'update',
      ),
      effectTiming: 'next-request',
      risk: 'normal',
      policy: nextDirect,
      created: !currentDirect,
    });
  }

  const entityId = snapshot.entity?.id;
  const currentDirectGroups = entityId
    ? snapshot.groups.filter((group) => (
        (group.type ?? 'internal') === 'internal'
        && group.memberEntityIds.includes(entityId)
      ))
    : [];
  const requestedGroups = new Set(draft.groupIds);
  if (!entityId && draft.groupIds.length > 0) throw new VaultError('invalid-request');

  const groupChanges = snapshot.groups
    .filter((group) => (group.type ?? 'internal') === 'internal')
    .flatMap((group): readonly ChangeOperation[] => {
      const hasMember = entityId ? group.memberEntityIds.includes(entityId) : false;
      const wantsMember = requestedGroups.has(group.id);
      if (hasMember === wantsMember || !entityId) return [];
      return [{
        id: `${wantsMember ? 'add' : 'remove'}-group-${group.id}`,
        kind: 'update-group',
        label: `${wantsMember ? 'Add user to' : 'Remove user from'} ${group.name}`,
        dependsOn: [],
        requirements: capability(
          `identity/group/id/${encodeURIComponent(group.id)}`,
          'update',
        ),
        effectTiming: 'next-request',
        risk: 'normal',
        groupId: group.id,
        group: {
          name: group.name,
          policies: group.policies,
          memberEntityIds: wantsMember
            ? unique([...group.memberEntityIds, entityId])
            : group.memberEntityIds.filter((id) => id !== entityId),
          memberGroupIds: group.memberGroupIds,
          metadata: group.metadata,
        },
      }];
    })
    .sort((left, right) => {
      const leftRemoval = left.id.startsWith('remove-') ? 0 : 1;
      const rightRemoval = right.id.startsWith('remove-') ? 0 : 1;
      return leftRemoval - rightRemoval || left.id.localeCompare(right.id);
    });
  operations.push(...groupChanges);

  const managedRoles = new Set(draft.managedRolePolicyNames);
  if (draft.directRolePolicyNames.some((name) => !managedRoles.has(name))) {
    throw new VaultError('invalid-request');
  }
  const ownedDirectName = currentDirect && (
    snapshot.directPolicyOwnership === 'managed' || draft.adoptDirectPolicy
  ) ? directName : null;
  const preservedTokenPolicies = snapshot.account.tokenPolicies.filter((name) => (
    !managedRoles.has(name) && name !== ownedDirectName
  ));
  const nextPolicies = unique([
    ...preservedTokenPolicies,
    ...draft.directRolePolicyNames,
    ...(nextDirect && (directAttachedToAccount || !currentDirect) ? [directName] : []),
  ]);
  if (!sameStrings(snapshot.account.tokenPolicies, nextPolicies)) {
    operations.push({
      id: 'update-userpass-policies',
      kind: 'update-userpass-policies',
      label: 'Update policies issued on the next login',
      dependsOn: nextDirect && policyChanged ? ['write-direct-policy'] : [],
      requirements: capability(
        `auth/${snapshot.account.mount}/users/${encodeURIComponent(username)}/policies`,
        'update',
      ),
      effectTiming: 'next-login',
      risk: 'normal',
      mount: snapshot.account.mount,
      username,
      policies: nextPolicies,
    });
  }

  if (
    snapshot.entity
    && assessIdentityOwnership(snapshot.entity.metadata) === 'managed'
    && draft.displayName.trim()
    && draft.displayName.trim() !== snapshot.entity.name
  ) {
    operations.push({
      id: 'update-entity-profile',
      kind: 'update-entity',
      label: 'Update Identity display name',
      dependsOn: [],
      requirements: capability(
        `identity/entity/id/${encodeURIComponent(snapshot.entity.id)}`,
        'update',
      ),
      effectTiming: 'next-request',
      risk: 'normal',
      entityId: snapshot.entity.id,
      entity: {
        name: draft.displayName.trim(),
        disabled: snapshot.entity.disabled,
        policies: snapshot.entity.policies,
        metadata: snapshot.entity.metadata ?? {},
      },
    });
  }

  if (currentDirect && !nextDirect && snapshot.directPolicyOwnership === 'managed') {
    operations.push({
      id: 'delete-direct-policy',
      kind: 'delete-policy',
      label: 'Delete the detached direct KV policy',
      dependsOn: operations.some(({ id }) => id === 'update-userpass-policies')
        ? ['update-userpass-policies']
        : [],
      requirements: capability(
        `sys/policies/acl/${encodeURIComponent(directName)}`,
        'delete',
      ),
      effectTiming: 'destructive-cleanup',
      risk: 'normal',
      policyName: directName,
    });
  }

  const diff = permissionDiff(policyRules(currentDirect), policyRules(nextDirect));
  return {
    id: `user-edit:${snapshot.account.mount}:${username}`,
    resourceKind: 'user',
    resourceId: username,
    baselineFingerprint: snapshot.fingerprint,
    visibility: snapshot.visibility,
    permissionDiff: diff,
    operations,
    confirmation: assessPlanRisk({
      resourceId: username,
      operations,
      permissionDiff: diff,
    }),
  };
}

export function buildResetPasswordPlan(
  snapshot: UserLifecycleSnapshot,
  password: VaultPassword,
): ChangePlan {
  return {
    id: `user-password:${snapshot.account.mount}:${snapshot.account.username}`,
    resourceKind: 'user',
    resourceId: snapshot.account.username,
    baselineFingerprint: userpassAccountFingerprint(snapshot.account),
    visibility: { complete: true, reasons: [] },
    permissionDiff: { added: [], removed: [] },
    operations: [{
      id: 'reset-userpass-password',
      kind: 'reset-userpass-password',
      label: 'Replace the userpass password',
      dependsOn: [],
      requirements: capability(
        `auth/${snapshot.account.mount}/users/${encodeURIComponent(snapshot.account.username)}/password`,
        'update',
      ),
      effectTiming: 'does-not-revoke',
      risk: 'normal',
      mount: snapshot.account.mount,
      username: snapshot.account.username,
      password,
    }],
  };
}

export function buildToggleEntityPlan(
  snapshot: UserLifecycleSnapshot,
  disabled: boolean,
): ChangePlan {
  if (
    !snapshot.entity
    || assessIdentityOwnership(snapshot.entity.metadata) !== 'managed'
  ) throw new VaultError('invalid-request');
  const entity = snapshot.entity;
  return {
    id: `user-${disabled ? 'disable' : 'enable'}:${entity.id}`,
    resourceKind: 'user',
    resourceId: snapshot.account.username,
    baselineFingerprint: identityEntityFingerprint(entity),
    visibility: { complete: true, reasons: [] },
    permissionDiff: { added: [], removed: [] },
    operations: [{
      id: disabled ? 'disable-entity' : 'enable-entity',
      kind: 'update-entity',
      label: disabled ? 'Disable Identity entity' : 'Enable Identity entity',
      dependsOn: [],
      requirements: capability(
        `identity/entity/id/${encodeURIComponent(entity.id)}`,
        'update',
      ),
      effectTiming: 'next-request',
      risk: 'normal',
      entityId: entity.id,
      entity: {
        name: entity.name,
        disabled,
        policies: entity.policies,
        metadata: entity.metadata ?? {},
      },
    }],
  };
}

export interface UserRemovalPlan {
  readonly mode: 'managed-tombstone' | 'account-only';
  readonly plan: ChangePlan;
  readonly preservedReasons: readonly string[];
}

export function buildUserRemovalPlan(
  snapshot: UserLifecycleSnapshot,
): UserRemovalPlan {
  const username = snapshot.account.username;
  const entity = snapshot.entity;
  const matchingAliases = entity?.aliases.filter((alias) => (
    alias.name === username && alias.mountAccessor === snapshot.mountAccessor
  )) ?? [];
  const externalAliases = entity?.aliases.filter((alias) => (
    !matchingAliases.some(({ id }) => id === alias.id)
  )) ?? [];
  const preservedReasons = [
    ...(assessIdentityOwnership(entity?.metadata) !== 'managed'
      ? ['The linked identity is not managed by Vault Console.']
      : []),
    ...(entity?.policies.length
      ? ['The identity has external policies.']
      : []),
    ...(externalAliases.length
      ? ['The identity has external aliases.']
      : []),
    ...(matchingAliases.length !== 1
      ? ['The userpass alias cannot be identified uniquely.']
      : []),
    ...(!snapshot.visibility.complete
      ? snapshot.visibility.reasons
      : []),
  ];
  const preservedPolicyReasons = [
    ...(snapshot.directPolicy && snapshot.directPolicyOwnership !== 'managed'
      ? ['The direct policy is not managed and will be preserved.']
      : []),
    ...(snapshot.policyReferences.some((reference) => (
      reference.kind !== 'user' || reference.id !== entity?.id
    ))
      ? ['The direct policy is referenced by another resource and will be preserved.']
      : []),
  ];
  const accountDelete: ChangeOperation = {
    id: 'delete-userpass-account',
    kind: 'delete-userpass-account',
    label: 'Delete the userpass login',
    dependsOn: [],
    requirements: capability(
      `auth/${snapshot.account.mount}/users/${encodeURIComponent(username)}`,
      'delete',
    ),
    effectTiming: 'does-not-revoke',
    risk: 'typed-confirmation',
    mount: snapshot.account.mount,
    username,
  };
  if (!entity || preservedReasons.length > 0) {
    const operations = [accountDelete];
    return {
      mode: 'account-only',
      preservedReasons,
      plan: {
        id: `user-remove-account:${snapshot.account.mount}:${username}`,
        resourceKind: 'user',
        resourceId: username,
        baselineFingerprint: userpassAccountFingerprint(snapshot.account),
        visibility: { complete: true, reasons: [] },
        permissionDiff: { added: [], removed: [] },
        operations,
        confirmation: {
          required: true,
          value: username,
          reasons: ['Deleting a login does not revoke existing tokens.'],
        },
      },
    };
  }

  const entityPath = `identity/entity/id/${encodeURIComponent(entity.id)}`;
  const disable: ChangeOperation = {
    id: 'disable-entity',
    kind: 'update-entity',
    label: 'Disable Identity before removing login',
    dependsOn: [],
    requirements: capability(entityPath, 'update'),
    effectTiming: 'next-request',
    risk: 'typed-confirmation',
    entityId: entity.id,
    entity: {
      name: entity.name,
      disabled: true,
      policies: entity.policies,
      metadata: entity.metadata ?? {},
    },
  };
  const deleteAccount = { ...accountDelete, dependsOn: ['disable-entity'] };
  const alias = matchingAliases[0];
  const deleteAlias: ChangeOperation = {
    id: 'delete-userpass-alias',
    kind: 'delete-entity-alias',
    label: 'Delete the removed login alias',
    dependsOn: ['delete-userpass-account'],
    requirements: capability(
      `identity/entity-alias/id/${encodeURIComponent(alias.id)}`,
      'delete',
    ),
    effectTiming: 'destructive-cleanup',
    risk: 'normal',
    aliasId: alias.id,
    entityId: entity.id,
  };
  const groupRemovals: ChangeOperation[] = snapshot.groups.flatMap(
    (group): readonly ChangeOperation[] => (
      (group.type ?? 'internal') === 'internal'
      && group.memberEntityIds.includes(entity.id)
        ? [{
            id: `remove-group-${group.id}`,
            kind: 'update-group',
            label: `Remove disabled identity from ${group.name}`,
            dependsOn: ['delete-userpass-alias'],
            requirements: capability(
              `identity/group/id/${encodeURIComponent(group.id)}`,
              'update',
            ),
            effectTiming: 'next-request',
            risk: 'normal',
            groupId: group.id,
            group: {
              name: group.name,
              policies: group.policies,
              memberEntityIds: group.memberEntityIds.filter((id) => id !== entity.id),
              memberGroupIds: group.memberGroupIds,
              metadata: group.metadata,
            },
          }]
        : []
    ),
  );
  const tombstoneDependencies = groupRemovals.length > 0
    ? groupRemovals.map(({ id }) => id)
    : ['delete-userpass-alias'];
  const tombstone: ChangeOperation = {
    id: 'write-disabled-tombstone',
    kind: 'update-entity',
    label: 'Retain a minimal disabled Identity tombstone',
    dependsOn: tombstoneDependencies,
    requirements: capability(entityPath, 'update'),
    effectTiming: 'next-request',
    risk: 'normal',
    entityId: entity.id,
    entity: {
      name: entity.name,
      disabled: true,
      policies: [],
      metadata: {
        ...(entity.metadata ?? {}),
        managed_by: 'vault-console',
        lifecycle_state: 'login-removed',
        username,
        auth_mount: snapshot.account.mount,
      },
    },
  };
  const operations: ChangeOperation[] = [
    disable,
    deleteAccount,
    deleteAlias,
    ...groupRemovals,
    tombstone,
  ];
  if (
    snapshot.directPolicy?.name === `${USER_POLICY_PREFIX}${username}`
    && snapshot.directPolicyOwnership === 'managed'
    && snapshot.policyReferences.every((reference) => (
      reference.kind === 'user' && reference.id === entity.id
    ))
  ) {
    operations.push({
      id: 'delete-direct-policy',
      kind: 'delete-policy',
      label: 'Delete the unreferenced per-user policy',
      dependsOn: ['write-disabled-tombstone'],
      requirements: capability(
        `sys/policies/acl/${encodeURIComponent(snapshot.directPolicy.name)}`,
        'delete',
      ),
      effectTiming: 'destructive-cleanup',
      risk: 'normal',
      policyName: snapshot.directPolicy.name,
    });
  }
  return {
    mode: 'managed-tombstone',
    preservedReasons: preservedPolicyReasons,
    plan: {
      id: `user-remove-managed:${snapshot.account.mount}:${username}`,
      resourceKind: 'user',
      resourceId: username,
      baselineFingerprint: snapshot.fingerprint,
      visibility: snapshot.visibility,
      permissionDiff: {
        added: [],
        removed: policyRules(snapshot.directPolicy).flatMap((rule) => (
          rule.capabilities.map((capability) => ({
            pattern: rule.pattern,
            capability,
          }))
        )),
      },
      operations,
      confirmation: {
        required: true,
        value: username,
        reasons: [
          'The login and its managed access will be removed.',
          'Existing tokens are blocked by the retained disabled Identity tombstone, not revoked.',
        ],
      },
    },
  };
}

export function buildPurgeIdentityPlan(
  snapshot: IdentityTombstoneSnapshot,
): ChangePlan {
  const entity = snapshot.entity;
  const hasMembership = entity.groupIds.length > 0
    || snapshot.groups.some((group) => group.memberEntityIds.includes(entity.id));
  if (
    assessIdentityOwnership(entity.metadata) !== 'managed'
    || entity.metadata?.lifecycle_state !== 'login-removed'
    || !entity.disabled
    || entity.aliases.length > 0
    || entity.policies.length > 0
    || hasMembership
    || !snapshot.accountAbsent
    || !snapshot.visibility.complete
  ) {
    throw new Error('Only a complete empty disabled tombstone can be purged.');
  }
  return {
    id: `identity-purge:${entity.id}`,
    resourceKind: 'user',
    resourceId: entity.name,
    baselineFingerprint: snapshot.fingerprint,
    visibility: snapshot.visibility,
    permissionDiff: { added: [], removed: [] },
    operations: [{
      id: 'purge-identity',
      kind: 'delete-entity',
      label: 'Permanently purge the disabled Identity tombstone',
      dependsOn: [],
      requirements: capability(
        `identity/entity/id/${encodeURIComponent(entity.id)}`,
        'delete',
      ),
      effectTiming: 'destructive-cleanup',
      risk: 'typed-confirmation',
      entityId: entity.id,
    }],
    confirmation: {
      required: true,
      value: entity.name,
      reasons: [
        'Deleting an Identity entity does not revoke existing tokens.',
        'Confirm that issued tokens were revoked or have expired.',
      ],
    },
  };
}

export async function loadIdentityTombstoneSnapshot(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  entityId: string,
  signal?: AbortSignal,
): Promise<IdentityTombstoneSnapshot> {
  const entity = await gateway.readEntity(session, entityId, signal);
  const reasons: string[] = [];
  const groups = await optionalResource(
    () => gateway.listGroups(session, signal),
    'Identity groups could not be fully listed.',
    reasons,
    [],
  );
  const username = entity.metadata?.username;
  const mount = entity.metadata?.auth_mount;
  let accountAbsent = false;
  if (!username || !mount) {
    reasons.push('The removed login coordinates are missing from the tombstone.');
  } else {
    const account = await optionalResource(
      () => gateway.readUserpassAccount(session, mount, username, signal),
      'The removed userpass login could not be verified as absent.',
      reasons,
      undefined,
    );
    if (account === null) accountAbsent = true;
    if (account) reasons.push('A userpass login still exists for this Identity tombstone.');
  }
  const snapshotVisibility = visibility(reasons.sort());
  const fingerprintValue = {
    entity: canonicalIdentityEntity(entity),
    groups: [...groups]
      .map(canonicalIdentityGroup)
      .sort((left, right) => left.id.localeCompare(right.id)),
    accountAbsent,
    visibility: canonicalVisibility(snapshotVisibility),
  };
  return {
    entity,
    groups,
    accountAbsent,
    visibility: snapshotVisibility,
    fingerprint: snapshotFingerprint(fingerprintValue),
  };
}
