import type { AccessPolicyRule } from './effective-access';
import { classifyPolicyName, managedRoleName } from './managed-resources';
import { resolvePolicyAccess } from './policy-matcher';
import type {
  PolicyRule,
  PolicySource,
  ResolvedPolicyAccess,
  VaultPolicyCapability,
} from './types';

export type SecretAccessCapability = 'read' | 'write' | 'delete' | 'list' | 'destroy';

export const SECRET_ACCESS_CAPABILITIES: readonly SecretAccessCapability[] = [
  'read',
  'write',
  'delete',
  'list',
  'destroy',
];

export type SecretAccessPolicyStatus =
  | 'resolved'
  | 'missing'
  | 'unsupported'
  | 'denied'
  | 'unreadable';

export interface SecretAccessPolicy {
  readonly name: string;
  readonly status: SecretAccessPolicyStatus;
  readonly rules?: readonly AccessPolicyRule[];
}

export interface SecretAccessGroup {
  readonly id: string;
  readonly name: string;
  readonly policies: readonly string[];
  readonly memberEntityIds: readonly string[];
  readonly memberGroupIds: readonly string[];
}

export interface SecretAccessEntity {
  readonly id: string;
  readonly name: string;
  readonly disabled: boolean;
  readonly policies: readonly string[];
  readonly groupIds: readonly string[];
}

export type SecretAccessIdentity =
  | { readonly status: 'available'; readonly entity: SecretAccessEntity }
  | { readonly status: 'absent' | 'unknown' };

export interface SecretAccessUser {
  readonly username: string;
  readonly mount: string;
  readonly tokenPolicies: readonly string[];
  readonly noDefaultPolicy: boolean;
  readonly identity: SecretAccessIdentity;
}

export type SecretAccessSourceReason = 'denied' | 'unavailable';

export type SecretAccessGap =
  | {
      readonly source: 'auth-mounts' | 'groups' | 'entities' | 'policy-list';
      readonly reason: SecretAccessSourceReason;
    }
  | {
      readonly source: 'userpass-mount';
      readonly id: string;
      readonly reason: SecretAccessSourceReason;
    }
  | {
      readonly source: 'policy';
      readonly id: string;
      readonly reason: 'denied' | 'unreadable' | 'unsupported';
    };

export interface SecretAccessInput {
  readonly mount: string;
  readonly path: string;
  readonly users: readonly SecretAccessUser[];
  readonly groups: readonly SecretAccessGroup[];
  /** Every known `vc-role-*` policy name, attached or not. */
  readonly rolePolicyNames: readonly string[];
  readonly policies: readonly SecretAccessPolicy[];
  /** Sources the loader could not read completely. */
  readonly gaps: readonly SecretAccessGap[];
}

export type SecretAccessVia =
  | { readonly kind: 'policy'; readonly policyName: string }
  | { readonly kind: 'role'; readonly policyName: string; readonly roleName: string }
  | {
      readonly kind: 'group';
      readonly groupId: string;
      readonly groupName: string;
      readonly policyName: string;
      readonly roleName?: string;
    };

export type SecretAccessSubjectKind = 'user' | 'group' | 'role';

export interface SecretAccessSubject {
  readonly kind: SecretAccessSubjectKind;
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly capabilities: readonly SecretAccessCapability[];
  readonly via: readonly SecretAccessVia[];
  /** Attached policies whose rules could not be evaluated. */
  readonly unresolvedPolicies: readonly string[];
  /** Identity policies or group membership could not be read. */
  readonly membershipUnknown: boolean;
  readonly incomplete: boolean;
}

export interface SecretAccessReport {
  readonly users: readonly SecretAccessSubject[];
  readonly groups: readonly SecretAccessSubject[];
  readonly roles: readonly SecretAccessSubject[];
  /** Subjects with no confirmed access whose access could not be fully checked. */
  readonly unverified: readonly SecretAccessSubject[];
  readonly completeness: {
    readonly state: 'complete' | 'partial';
    readonly gaps: readonly SecretAccessGap[];
  };
}

interface PolicyAttachment {
  readonly policyName: string;
  readonly via: SecretAccessVia;
}

interface SecretEndpoints {
  readonly data: string;
  readonly delete: string;
  readonly destroy: string;
  readonly list: readonly string[];
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function secretAccessEndpoints(mount: string, path: string): SecretEndpoints {
  const normalizedMount = trimSlashes(mount);
  const normalizedPath = trimSlashes(path);
  const parent = normalizedPath.split('/').slice(0, -1).join('/');
  const listPath = [normalizedMount, 'metadata', parent].filter(Boolean).join('/');
  return {
    data: `${normalizedMount}/data/${normalizedPath}`,
    delete: `${normalizedMount}/delete/${normalizedPath}`,
    destroy: `${normalizedMount}/destroy/${normalizedPath}`,
    list: [listPath, `${listPath}/`],
  };
}

function viaKey(via: SecretAccessVia): string {
  if (via.kind === 'group') return `group\u001f${via.groupId}\u001f${via.policyName}`;
  return `${via.kind}\u001f${via.policyName}`;
}

function directVia(policyName: string): SecretAccessVia {
  return classifyPolicyName(policyName) === 'role'
    ? { kind: 'role', policyName, roleName: managedRoleName(policyName) }
    : { kind: 'policy', policyName };
}

function groupVia(group: SecretAccessGroup, policyName: string): SecretAccessVia {
  return {
    kind: 'group',
    groupId: group.id,
    groupName: group.name,
    policyName,
    ...(classifyPolicyName(policyName) === 'role' ? { roleName: managedRoleName(policyName) } : {}),
  };
}

/** Adds every group that (transitively) contains one of the selected groups. */
function withAncestorGroups(
  selected: ReadonlySet<string>,
  groups: readonly SecretAccessGroup[],
): ReadonlySet<string> {
  const result = new Set(selected);
  let added = true;
  while (added) {
    added = false;
    for (const group of groups) {
      if (!result.has(group.id) && group.memberGroupIds.some((id) => result.has(id))) {
        result.add(group.id);
        added = true;
      }
    }
  }
  return result;
}

function capabilitySources(
  access: ResolvedPolicyAccess,
  capabilities: readonly VaultPolicyCapability[],
): readonly PolicySource[] {
  if (access.denied) return [];
  return capabilities.flatMap((capability) => access.capabilitySources[capability] ?? []);
}

function listSources(endpoints: SecretEndpoints, rules: readonly PolicyRule[]): readonly PolicySource[] {
  return endpoints.list.flatMap((path) => capabilitySources(resolvePolicyAccess(path, rules), ['list']));
}

function grantedCapabilities(
  endpoints: SecretEndpoints,
  rules: readonly PolicyRule[],
): ReadonlyMap<SecretAccessCapability, readonly PolicySource[]> {
  const data = resolvePolicyAccess(endpoints.data, rules);
  const sources: Record<SecretAccessCapability, readonly PolicySource[]> = {
    read: capabilitySources(data, ['read']),
    write: capabilitySources(data, ['create', 'update']),
    delete: [
      ...capabilitySources(data, ['delete']),
      ...capabilitySources(resolvePolicyAccess(endpoints.delete, rules), ['update']),
    ],
    list: listSources(endpoints, rules),
    destroy: capabilitySources(resolvePolicyAccess(endpoints.destroy, rules), ['update']),
  };
  return new Map(
    SECRET_ACCESS_CAPABILITIES
      .filter((capability) => sources[capability].length > 0)
      .map((capability) => [capability, sources[capability]]),
  );
}

interface SubjectBase {
  readonly kind: SecretAccessSubjectKind;
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly membershipUnknown: boolean;
}

function evaluateSubject(
  base: SubjectBase,
  attachments: readonly PolicyAttachment[],
  policiesByName: ReadonlyMap<string, SecretAccessPolicy>,
  endpoints: SecretEndpoints,
): SecretAccessSubject {
  const viaByKey = new Map<string, SecretAccessVia>();
  const unresolved = new Set<string>();
  const rules: PolicyRule[] = [];
  for (const attachment of attachments) {
    const policy = policiesByName.get(attachment.policyName);
    if (policy?.status === 'missing') continue;
    if (!policy || policy.status !== 'resolved' || !policy.rules) {
      unresolved.add(attachment.policyName);
      continue;
    }
    const key = viaKey(attachment.via);
    viaByKey.set(key, attachment.via);
    const source: PolicySource = { kind: 'policy', id: key, label: attachment.policyName };
    policy.rules.forEach((rule) => rules.push({ ...rule, source }));
  }
  const granted = grantedCapabilities(endpoints, rules);
  const usedKeys = new Set([...granted.values()].flat().map((source) => source.id));
  const unresolvedPolicies = [...unresolved].sort((left, right) => left.localeCompare(right));
  return {
    ...base,
    capabilities: [...granted.keys()],
    via: [...usedKeys]
      .sort((left, right) => left.localeCompare(right))
      .flatMap((key) => {
        const via = viaByKey.get(key);
        return via ? [via] : [];
      }),
    unresolvedPolicies,
    incomplete: base.membershipUnknown || unresolvedPolicies.length > 0,
  };
}

function entityGroupIds(
  entity: SecretAccessEntity,
  groups: readonly SecretAccessGroup[],
): ReadonlySet<string> {
  const direct = new Set(entity.groupIds);
  groups.forEach((group) => {
    if (group.memberEntityIds.includes(entity.id)) direct.add(group.id);
  });
  return withAncestorGroups(direct, groups);
}

function groupAttachments(
  groupIds: ReadonlySet<string>,
  groups: readonly SecretAccessGroup[],
): readonly PolicyAttachment[] {
  return groups
    .filter((group) => groupIds.has(group.id))
    .flatMap((group) => group.policies.map((policyName) => ({
      policyName,
      via: groupVia(group, policyName),
    })));
}

function userAttachments(
  user: SecretAccessUser,
  groups: readonly SecretAccessGroup[],
): readonly PolicyAttachment[] {
  const tokenPolicies = user.noDefaultPolicy || user.tokenPolicies.includes('default')
    ? user.tokenPolicies
    : [...user.tokenPolicies, 'default'];
  const entity = user.identity.status === 'available' ? user.identity.entity : undefined;
  const direct = [...new Set([...tokenPolicies, ...(entity?.policies ?? [])])];
  return [
    ...direct.map((policyName) => ({ policyName, via: directVia(policyName) })),
    ...(entity ? groupAttachments(entityGroupIds(entity, groups), groups) : []),
  ];
}

function userSubjects(
  input: SecretAccessInput,
  policiesByName: ReadonlyMap<string, SecretAccessPolicy>,
  endpoints: SecretEndpoints,
  groupsKnown: boolean,
): readonly SecretAccessSubject[] {
  return input.users
    .filter((user) => user.identity.status !== 'available' || !user.identity.entity.disabled)
    .map((user) => evaluateSubject(
      {
        kind: 'user',
        id: `${user.mount}:${user.username}`,
        label: user.username,
        detail: `auth/${user.mount}`,
        membershipUnknown: user.identity.status === 'unknown'
          || (user.identity.status === 'available' && !groupsKnown),
      },
      userAttachments(user, input.groups),
      policiesByName,
      endpoints,
    ));
}

function groupSubjects(
  input: SecretAccessInput,
  policiesByName: ReadonlyMap<string, SecretAccessPolicy>,
  endpoints: SecretEndpoints,
): readonly SecretAccessSubject[] {
  return input.groups.map((group) => {
    const ancestors = withAncestorGroups(new Set([group.id]), input.groups);
    const inherited = groupAttachments(
      new Set([...ancestors].filter((id) => id !== group.id)),
      input.groups,
    );
    return evaluateSubject(
      { kind: 'group', id: group.id, label: group.name, membershipUnknown: false },
      [
        ...group.policies.map((policyName) => ({ policyName, via: directVia(policyName) })),
        ...inherited,
      ],
      policiesByName,
      endpoints,
    );
  });
}

function roleSubjects(
  input: SecretAccessInput,
  policiesByName: ReadonlyMap<string, SecretAccessPolicy>,
  endpoints: SecretEndpoints,
): readonly SecretAccessSubject[] {
  const attached = [
    ...input.users.flatMap((user) => [
      ...user.tokenPolicies,
      ...(user.identity.status === 'available' ? user.identity.entity.policies : []),
    ]),
    ...input.groups.flatMap((group) => group.policies),
  ].filter((name) => classifyPolicyName(name) === 'role');
  const names = [...new Set([...input.rolePolicyNames, ...attached])];
  return names.map((policyName) => evaluateSubject(
    {
      kind: 'role',
      id: policyName,
      label: managedRoleName(policyName),
      detail: policyName,
      membershipUnknown: false,
    },
    [{ policyName, via: directVia(policyName) }],
    policiesByName,
    endpoints,
  ));
}

function bySubjectLabel(left: SecretAccessSubject, right: SecretAccessSubject): number {
  return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function gapKey(gap: SecretAccessGap): string {
  return `${gap.source}\u001f${'id' in gap ? gap.id : ''}`;
}

function policyGaps(
  subjects: readonly SecretAccessSubject[],
  policiesByName: ReadonlyMap<string, SecretAccessPolicy>,
): readonly SecretAccessGap[] {
  const names = [...new Set(subjects.flatMap((subject) => subject.unresolvedPolicies))];
  return names.sort((left, right) => left.localeCompare(right)).map((name) => {
    const status = policiesByName.get(name)?.status;
    const reason = status === 'denied' || status === 'unsupported' ? status : 'unreadable';
    return { source: 'policy', id: name, reason };
  });
}

/**
 * Computes who can reach one exact KV v2 secret from the visible
 * access-control model. Vault merges every policy attached to a token and
 * applies the most specific matching path, so each subject is evaluated with
 * all of its attached policies together, never policy by policy.
 */
export function resolveSecretAccess(input: SecretAccessInput): SecretAccessReport {
  const policiesByName = new Map(input.policies.map((policy) => [policy.name, policy]));
  const endpoints = secretAccessEndpoints(input.mount, input.path);
  const groupsKnown = !input.gaps.some((gap) => gap.source === 'groups');
  const subjects = [
    ...userSubjects(input, policiesByName, endpoints, groupsKnown),
    ...groupSubjects(input, policiesByName, endpoints),
    ...roleSubjects(input, policiesByName, endpoints),
  ];
  const granted = subjects.filter((subject) => subject.capabilities.length > 0);
  const gaps = new Map(
    [...input.gaps, ...policyGaps(subjects, policiesByName)].map((gap) => [gapKey(gap), gap]),
  );
  return {
    users: granted.filter((subject) => subject.kind === 'user').sort(bySubjectLabel),
    groups: granted.filter((subject) => subject.kind === 'group').sort(bySubjectLabel),
    roles: granted.filter((subject) => subject.kind === 'role').sort(bySubjectLabel),
    unverified: subjects
      .filter((subject) => subject.capabilities.length === 0 && subject.incomplete)
      .sort(bySubjectLabel),
    completeness: {
      state: gaps.size > 0 ? 'partial' : 'complete',
      gaps: [...gaps.values()],
    },
  };
}
