import {
  assessPlanRisk,
  permissionDiff,
  snapshotFingerprint,
} from '@/domain/access-control/lifecycle/change-plan';
import type {
  ChangeOperation,
  ChangePlan,
  DependencyVisibility,
  RoleDependency,
  RoleLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import { parseManagedPolicyHcl } from '@/domain/access-control/managed-resources';
import {
  assessPolicyOwnership,
  renderManagedPolicy,
  ROLE_POLICY_PREFIX,
} from '@/domain/access-control/policy-ownership';
import type {
  VaultAccessControlGateway,
  VaultAclPolicy,
  VaultSession,
} from '@/domain/vault/contracts';
import {
  normalizeVaultError,
  VaultError,
} from '@/domain/vault/errors';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';

function uniqueDependencies(
  values: readonly RoleDependency[],
): readonly RoleDependency[] {
  const result = new Map<string, RoleDependency>();
  values.forEach((value) => result.set(`${value.kind}:${value.id}`, value));
  return [...result.values()];
}

function visibility(reasons: readonly string[]): DependencyVisibility {
  const unique = [...new Set(reasons)];
  return { complete: unique.length === 0, reasons: unique };
}

async function optionalList<T>(
  load: () => Promise<readonly T[]>,
  reason: string,
  reasons: string[],
): Promise<readonly T[]> {
  try {
    return await load();
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired' || error.code === 'aborted') throw error;
    reasons.push(reason);
    return [];
  }
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

function snapshotValue(snapshot: Omit<RoleLifecycleSnapshot, 'fingerprint'>): unknown {
  return {
    policy: snapshot.policy,
    ownership: snapshot.ownership,
    editable: snapshot.editable,
    dependencies: snapshot.dependencies,
    visibility: snapshot.visibility,
  };
}

export async function loadRoleLifecycleSnapshot(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  policyName: string,
  signal?: AbortSignal,
): Promise<RoleLifecycleSnapshot> {
  const reasons: string[] = [];
  const policy = await readOptionalPolicy(gateway, session, policyName, signal);
  const groups = await optionalList(
    () => gateway.listGroups(session, signal),
    'Identity groups could not be fully listed.',
    reasons,
  );
  const entities = await optionalList(
    () => gateway.listEntities(session, signal),
    'Identity entities could not be fully listed.',
    reasons,
  );
  const authMounts = await optionalList(
    () => gateway.listAuthMounts(session, signal),
    'Userpass mounts could not be fully listed.',
    reasons,
  );
  const accounts = (
    await mapWithConcurrency(
      authMounts.filter(({ type }) => type === 'userpass'),
      4,
      async (mount) => optionalList(
        () => gateway.listUserpassAccounts(session, mount.path, signal),
        `Accounts at auth/${mount.path} could not be fully listed.`,
        reasons,
      ),
    )
  ).flat();
  const dependencies = uniqueDependencies([
    ...accounts.flatMap((account): readonly RoleDependency[] => (
      account.tokenPolicies.includes(policyName)
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
    ...entities.flatMap((entity): readonly RoleDependency[] => (
      entity.policies.includes(policyName)
        ? [{ kind: 'user', id: entity.id, name: entity.name }]
        : []
    )),
  ]);
  const ownership = policy
    ? assessPolicyOwnership(policy.name, policy.policy)
    : null;
  const base: Omit<RoleLifecycleSnapshot, 'fingerprint'> = {
    policy,
    ownership: ownership?.state ?? 'absent',
    editable: ownership?.editable ?? false,
    dependencies,
    visibility: visibility(reasons.sort()),
  };
  return {
    ...base,
    fingerprint: snapshotFingerprint(snapshotValue(base)),
  };
}

export interface RoleDraft {
  readonly policyName: string;
  readonly description: string;
  readonly hcl: string;
}

function validateRoleDraft(
  draft: RoleDraft,
): NonNullable<ReturnType<typeof parseManagedPolicyHcl>> {
  if (
    !new RegExp(`^${ROLE_POLICY_PREFIX}[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`).test(
      draft.policyName,
    )
  ) throw new VaultError('invalid-request');
  const rules = parseManagedPolicyHcl(draft.hcl);
  if (!rules) throw new VaultError('invalid-request');
  return rules;
}

function broadOrDestructive(
  rules: NonNullable<ReturnType<typeof parseManagedPolicyHcl>>,
): boolean {
  return rules.some((rule) => {
    const parts = rule.pattern.split('/');
    const wholeMount = parts.length === 3
      && ['data', 'metadata', 'delete', 'undelete', 'destroy'].includes(parts[1])
      && parts[2] === '*';
    return wholeMount
      || rule.capabilities.includes('delete')
      || rule.pattern.includes('/destroy/');
  });
}

function writeRolePlan(input: {
  readonly snapshot: RoleLifecycleSnapshot;
  readonly draft: RoleDraft;
  readonly created: boolean;
}): ChangePlan {
  const rules = validateRoleDraft(input.draft);
  const before = input.snapshot.policy
    ? parseManagedPolicyHcl(input.snapshot.policy.policy) ?? []
    : [];
  const diff = permissionDiff(before, rules);
  const operation: ChangeOperation = {
    id: 'write-role-policy',
    kind: 'write-policy',
    label: input.created ? 'Create managed role policy' : 'Update managed role policy',
    dependsOn: [],
    requirements: [{
      path: `sys/policies/acl/${encodeURIComponent(input.draft.policyName)}`,
      anyOf: input.created ? ['create', 'update'] : ['update'],
    }],
    effectTiming: 'next-request',
    risk: broadOrDestructive(rules) ? 'typed-confirmation' : 'normal',
    policy: {
      name: input.draft.policyName,
      policy: renderManagedPolicy({
        kind: 'role',
        description: input.draft.description,
      }, input.draft.hcl),
    },
    created: input.created,
  };
  return {
    id: `role-${input.created ? 'create' : 'update'}:${input.draft.policyName}`,
    resourceKind: 'role',
    resourceId: input.draft.policyName,
    baselineFingerprint: input.snapshot.fingerprint,
    visibility: input.snapshot.visibility,
    permissionDiff: diff,
    operations: [operation],
    confirmation: assessPlanRisk({
      resourceId: input.draft.policyName,
      operations: [operation],
      permissionDiff: diff,
    }),
  };
}

export function buildCreateRolePlan(
  snapshot: RoleLifecycleSnapshot,
  draft: RoleDraft,
): ChangePlan {
  if (snapshot.policy) throw new VaultError('conflict');
  return writeRolePlan({ snapshot, draft, created: true });
}

export function buildUpdateRolePlan(
  snapshot: RoleLifecycleSnapshot,
  draft: RoleDraft,
): ChangePlan {
  if (
    !snapshot.policy
    || snapshot.ownership !== 'managed'
    || !snapshot.editable
    || snapshot.policy.name !== draft.policyName
  ) throw new VaultError('invalid-request');
  return writeRolePlan({ snapshot, draft, created: false });
}

export function buildAdoptRolePlan(
  snapshot: RoleLifecycleSnapshot,
  description: string,
): ChangePlan {
  if (
    !snapshot.policy
    || snapshot.ownership !== 'unverified'
    || !snapshot.editable
    || !snapshot.visibility.complete
  ) throw new VaultError('invalid-request');
  const policy = snapshot.policy;
  const operation: ChangeOperation = {
    id: 'adopt-role-policy',
    kind: 'write-policy',
    label: 'Adopt the supported role policy',
    dependsOn: [],
    requirements: [{
      path: `sys/policies/acl/${encodeURIComponent(policy.name)}`,
      anyOf: ['update'],
    }],
    effectTiming: 'next-request',
    risk: 'normal',
    policy: {
      name: policy.name,
      policy: renderManagedPolicy({
        kind: 'role',
        description,
      }, policy.policy),
    },
    created: false,
  };
  return {
    id: `role-adopt:${policy.name}`,
    resourceKind: 'role',
    resourceId: policy.name,
    baselineFingerprint: snapshot.fingerprint,
    visibility: snapshot.visibility,
    permissionDiff: { added: [], removed: [] },
    operations: [operation],
  };
}

export function buildDeleteRolePlan(
  snapshot: RoleLifecycleSnapshot,
): ChangePlan {
  const policy = snapshot.policy;
  if (
    !policy
    || snapshot.ownership !== 'managed'
    || !snapshot.editable
  ) throw new VaultError('invalid-request');
  if (!snapshot.visibility.complete) {
    throw new Error('Role dependencies must be completely visible before deletion.');
  }
  if (snapshot.dependencies.length > 0) {
    throw new Error('The role is still attached to users or groups.');
  }
  return {
    id: `role-delete:${policy.name}`,
    resourceKind: 'role',
    resourceId: policy.name,
    baselineFingerprint: snapshot.fingerprint,
    visibility: snapshot.visibility,
    permissionDiff: {
      added: [],
      removed: (parseManagedPolicyHcl(policy.policy) ?? []).flatMap((rule) => (
        rule.capabilities.map((capability) => ({
          pattern: rule.pattern,
          capability,
        }))
      )),
    },
    operations: [{
      id: 'delete-role-policy',
      kind: 'delete-policy',
      label: 'Delete the empty managed role',
      dependsOn: [],
      requirements: [{
        path: `sys/policies/acl/${encodeURIComponent(policy.name)}`,
        anyOf: ['delete'],
      }],
      effectTiming: 'destructive-cleanup',
      risk: 'typed-confirmation',
      policyName: policy.name,
    }],
    confirmation: {
      required: true,
      value: policy.name,
      reasons: ['Deleting a role policy is irreversible.'],
    },
  };
}
