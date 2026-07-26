import {
  assessPlanRisk,
  snapshotFingerprint,
} from '@/domain/access-control/lifecycle/change-plan';
import type {
  ChangePlan,
  DependencyVisibility,
  GroupLifecycleSnapshot,
  PermissionDiff,
  RoleDependency,
} from '@/domain/access-control/lifecycle/model';
import { assessIdentityOwnership } from '@/domain/access-control/resource-ownership';
import type {
  VaultAccessControlGateway,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import {
  normalizeVaultError,
  VaultError,
} from '@/domain/vault/errors';

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function visibility(reasons: readonly string[]): DependencyVisibility {
  const uniqueReasons = unique(reasons);
  return { complete: uniqueReasons.length === 0, reasons: uniqueReasons };
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

function snapshotValue(snapshot: Omit<GroupLifecycleSnapshot, 'fingerprint'>): unknown {
  return {
    group: snapshot.group,
    entities: [...snapshot.entities].sort((left, right) => left.id.localeCompare(right.id)),
    parentGroups: snapshot.parentGroups,
    visibility: snapshot.visibility,
  };
}

export async function loadGroupLifecycleSnapshot(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  groupId?: string,
  signal?: AbortSignal,
): Promise<GroupLifecycleSnapshot> {
  const reasons: string[] = [];
  let group: VaultIdentityGroup | null = null;
  if (groupId) group = await gateway.readGroup(session, groupId, signal);
  const groups = await optionalList(
    () => gateway.listGroups(session, signal),
    'Identity groups could not be fully listed.',
    reasons,
  );
  const entities = await optionalList<VaultIdentityEntity>(
    () => gateway.listEntities(session, signal),
    'Identity entities could not be fully listed.',
    reasons,
  );
  const parentGroups: readonly RoleDependency[] = groupId
    ? groups
        .filter((candidate) => candidate.memberGroupIds.includes(groupId))
        .map((candidate) => ({
          kind: 'group',
          id: candidate.id,
          name: candidate.name,
        }))
    : [];
  const base: Omit<GroupLifecycleSnapshot, 'fingerprint'> = {
    group,
    entities,
    parentGroups,
    visibility: visibility(reasons.sort()),
  };
  return {
    ...base,
    fingerprint: snapshotFingerprint(snapshotValue(base)),
  };
}

export interface GroupDraft {
  readonly name: string;
  readonly description: string;
  readonly memberEntityIds: readonly string[];
  readonly managedRolePolicyNames: readonly string[];
  readonly selectedRolePolicyNames: readonly string[];
  readonly permissionDiff: PermissionDiff;
}

function validateDraft(snapshot: GroupLifecycleSnapshot, draft: GroupDraft): void {
  if (!draft.name.trim()) throw new VaultError('invalid-request');
  const entityIds = new Set(snapshot.entities.map(({ id }) => id));
  if (draft.memberEntityIds.some((id) => !entityIds.has(id))) {
    throw new VaultError('invalid-request');
  }
  const managedRoles = new Set(draft.managedRolePolicyNames);
  if (draft.selectedRolePolicyNames.some((name) => !managedRoles.has(name))) {
    throw new VaultError('invalid-request');
  }
}

function managedMetadata(
  current: Readonly<Record<string, string>>,
  description: string,
): Readonly<Record<string, string>> {
  return {
    ...current,
    managed_by: 'vault-console',
    schema: '1',
    ...(description.trim()
      ? { description: description.trim() }
      : { description: '' }),
  };
}

export function buildCreateGroupPlan(
  snapshot: GroupLifecycleSnapshot,
  draft: GroupDraft,
): ChangePlan {
  if (snapshot.group) throw new VaultError('conflict');
  validateDraft(snapshot, draft);
  const operation = {
    id: 'create-group',
    kind: 'create-group' as const,
    label: 'Create managed internal group',
    dependsOn: [],
    requirements: [{
      path: 'identity/group',
      anyOf: ['create', 'update'] as const,
    }],
    effectTiming: 'next-request' as const,
    risk: draft.permissionDiff.added.some(({ capability, pattern }) => (
      capability === 'delete' || pattern.includes('/destroy/')
    )) ? 'typed-confirmation' as const : 'normal' as const,
    group: {
      name: draft.name.trim(),
      policies: unique(draft.selectedRolePolicyNames),
      memberEntityIds: unique(draft.memberEntityIds),
      memberGroupIds: [],
      metadata: managedMetadata({}, draft.description),
    },
  };
  const confirmation = assessPlanRisk({
    resourceId: draft.name.trim(),
    operations: [operation],
    permissionDiff: draft.permissionDiff,
  });
  return {
    id: `group-create:${draft.name.trim()}`,
    resourceKind: 'group',
    resourceId: draft.name.trim(),
    baselineFingerprint: snapshot.fingerprint,
    visibility: snapshot.visibility,
    permissionDiff: draft.permissionDiff,
    operations: [operation],
    confirmation,
  };
}

export function buildUpdateGroupPlan(
  snapshot: GroupLifecycleSnapshot,
  draft: GroupDraft,
): ChangePlan {
  const group = snapshot.group;
  if (
    !group
    || (group.type ?? 'internal') !== 'internal'
    || assessIdentityOwnership(group.metadata) !== 'managed'
  ) throw new VaultError('invalid-request');
  validateDraft(snapshot, draft);
  const managedRoles = new Set(draft.managedRolePolicyNames);
  const externalPolicies = group.policies.filter((name) => !managedRoles.has(name));
  const operation = {
    id: 'update-group',
    kind: 'update-group' as const,
    label: 'Update managed group',
    dependsOn: [],
    requirements: [{
      path: `identity/group/id/${encodeURIComponent(group.id)}`,
      anyOf: ['update'] as const,
    }],
    effectTiming: 'next-request' as const,
    risk: draft.permissionDiff.added.some(({ capability, pattern }) => (
      capability === 'delete' || pattern.includes('/destroy/')
    )) ? 'typed-confirmation' as const : 'normal' as const,
    groupId: group.id,
    group: {
      name: draft.name.trim(),
      policies: unique([...externalPolicies, ...draft.selectedRolePolicyNames]),
      memberEntityIds: unique(draft.memberEntityIds),
      memberGroupIds: group.memberGroupIds,
      metadata: managedMetadata(group.metadata, draft.description),
    },
  };
  return {
    id: `group-update:${group.id}`,
    resourceKind: 'group',
    resourceId: group.name,
    baselineFingerprint: snapshot.fingerprint,
    visibility: snapshot.visibility,
    permissionDiff: draft.permissionDiff,
    operations: [operation],
    confirmation: assessPlanRisk({
      resourceId: group.name,
      operations: [operation],
      permissionDiff: draft.permissionDiff,
    }),
  };
}

export function buildDeleteGroupPlan(
  snapshot: GroupLifecycleSnapshot,
): ChangePlan {
  const group = snapshot.group;
  if (
    !group
    || assessIdentityOwnership(group.metadata) !== 'managed'
  ) throw new VaultError('invalid-request');
  if (!snapshot.visibility.complete) {
    throw new Error('Group dependencies must be completely visible before deletion.');
  }
  if (
    group.memberEntityIds.length > 0
    || group.memberGroupIds.length > 0
    || snapshot.parentGroups.length > 0
  ) {
    throw new Error('The managed group must be empty and detached before deletion.');
  }
  return {
    id: `group-delete:${group.id}`,
    resourceKind: 'group',
    resourceId: group.name,
    baselineFingerprint: snapshot.fingerprint,
    visibility: snapshot.visibility,
    permissionDiff: { added: [], removed: [] },
    operations: [{
      id: 'delete-group',
      kind: 'delete-group',
      label: 'Delete empty managed group',
      dependsOn: [],
      requirements: [{
        path: `identity/group/id/${encodeURIComponent(group.id)}`,
        anyOf: ['delete'],
      }],
      effectTiming: 'destructive-cleanup',
      risk: 'normal',
      groupId: group.id,
    }],
  };
}
