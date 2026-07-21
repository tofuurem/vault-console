import {
  compileKvV2Rule,
  type LogicalKvAccessRule,
} from './kv-v2-policy-compiler';
import { normalizeVaultPath, resolvePolicyAccess } from './policy-matcher';
import type {
  PolicyRule,
  PolicySource,
  ResolvedPolicyAccess,
  VaultCapability,
} from './types';

export interface AccessPolicyRule {
  readonly pattern: string;
  readonly capabilities: readonly VaultCapability[];
}

export interface AccessPolicy {
  readonly name: string;
  readonly managed: boolean;
  readonly rules: readonly AccessPolicyRule[] | null;
}

export interface AccessRole {
  readonly id: string;
  readonly name: string;
  readonly policyNames: readonly string[];
}

export interface AccessGroup {
  readonly id: string;
  readonly name: string;
  readonly roleIds: readonly string[];
  readonly policyNames: readonly string[];
}

export interface UnresolvedPolicySource {
  readonly policyName: string;
  readonly source: PolicySource;
  readonly reason: 'missing' | 'unsupported';
}

export interface SamePatternDowngrade {
  readonly mount: string;
  readonly path: string;
  readonly requestedLevel: LogicalKvAccessRule['level'];
  readonly patterns: readonly string[];
}

export interface ResolveAccessSelectionInput {
  readonly groups: readonly AccessGroup[];
  readonly roles: readonly AccessRole[];
  readonly policies: readonly AccessPolicy[];
  readonly selectedGroupIds: readonly string[];
  readonly directRoleIds: readonly string[];
  readonly directRules: readonly LogicalKvAccessRule[];
}

export interface ResolvedAccessSelection {
  readonly groupIds: readonly string[];
  readonly inheritedRoleIds: readonly string[];
  readonly directRoleIds: readonly string[];
  readonly duplicateDirectRoleIds: readonly string[];
  readonly policyNames: readonly string[];
  readonly inheritedRules: readonly PolicyRule[];
  readonly directRules: readonly PolicyRule[];
  readonly rules: readonly PolicyRule[];
  readonly unresolvedPolicies: readonly UnresolvedPolicySource[];
  readonly ineffectiveDowngrades: readonly SamePatternDowngrade[];
}

export type EffectiveKvPermissionLevel =
  | 'none'
  | 'view'
  | 'edit'
  | 'manage-versions'
  | 'owner'
  | 'deny'
  | 'custom';

export interface KvAccessTreeNode {
  readonly id: string;
  readonly label: string;
  readonly mount: string;
  readonly path: string;
  readonly target: LogicalKvAccessRule['target'];
  readonly children?: readonly KvAccessTreeNode[];
}

export interface EffectiveKvEndpointAccess {
  readonly data: ResolvedPolicyAccess;
  readonly metadata: ResolvedPolicyAccess;
  readonly metadataList: ResolvedPolicyAccess;
  readonly deleteVersions: ResolvedPolicyAccess;
  readonly undeleteVersions: ResolvedPolicyAccess;
  readonly destroyVersions: ResolvedPolicyAccess;
}

export interface EffectiveKvAccessTreeNode extends KvAccessTreeNode {
  readonly level: EffectiveKvPermissionLevel;
  readonly sources: readonly PolicySource[];
  readonly endpointAccess: EffectiveKvEndpointAccess;
  readonly children: readonly EffectiveKvAccessTreeNode[];
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function roleSource(role: AccessRole): PolicySource {
  return { kind: 'role', id: role.id, label: role.name };
}

function groupSource(group: AccessGroup, via: string): PolicySource {
  return { kind: 'group', id: group.id, label: group.name, via };
}

function sourceKey(source: PolicySource): string {
  return `${source.kind}:${source.id}:${source.via ?? ''}`;
}

function findIneffectiveDowngrades(
  directRules: readonly LogicalKvAccessRule[],
  inheritedRules: readonly PolicyRule[],
): readonly SamePatternDowngrade[] {
  return directRules.flatMap((logicalRule) => {
    if (logicalRule.level === 'inherited' || logicalRule.level === 'deny') return [];

    const affectedPatterns = compileKvV2Rule(logicalRule)
      .filter((directRule) => {
        const inheritedCapabilities = new Set(
          inheritedRules
            .filter(
              (inheritedRule) =>
                normalizeVaultPath(inheritedRule.pattern) === normalizeVaultPath(directRule.pattern),
            )
            .flatMap((inheritedRule) => inheritedRule.capabilities),
        );
        return [...inheritedCapabilities].some(
          (capability) => !directRule.capabilities.includes(capability),
        );
      })
      .map((rule) => normalizeVaultPath(rule.pattern));

    if (affectedPatterns.length === 0) return [];
    return [
      {
        mount: logicalRule.mount,
        path: logicalRule.path,
        requestedLevel: logicalRule.level,
        patterns: unique(affectedPatterns),
      },
    ];
  });
}

export function resolveAccessSelection(input: ResolveAccessSelectionInput): ResolvedAccessSelection {
  const groupsById = new Map(input.groups.map((group) => [group.id, group]));
  const rolesById = new Map(input.roles.map((role) => [role.id, role]));
  const policiesByName = new Map(input.policies.map((policy) => [policy.name, policy]));
  const selectedGroups = input.selectedGroupIds.flatMap((id) => {
    const group = groupsById.get(id);
    return group ? [group] : [];
  });
  const inheritedRoleIds = unique(selectedGroups.flatMap((group) => group.roleIds));
  const inheritedRoleIdSet = new Set(inheritedRoleIds);
  const duplicateDirectRoleIds = unique(
    input.directRoleIds.filter((roleId) => inheritedRoleIdSet.has(roleId)),
  );
  const directRoleIds = unique(
    input.directRoleIds.filter((roleId) => !inheritedRoleIdSet.has(roleId) && rolesById.has(roleId)),
  );
  const inheritedRules: PolicyRule[] = [];
  const policyNames: string[] = [];
  const unresolvedPolicies: UnresolvedPolicySource[] = [];
  const unresolvedKeys = new Set<string>();

  const appendPolicy = (policyName: string, source: PolicySource) => {
    policyNames.push(policyName);
    const policy = policiesByName.get(policyName);
    if (!policy || policy.rules === null) {
      const reason = policy ? 'unsupported' : 'missing';
      const key = `${policyName}:${reason}:${sourceKey(source)}`;
      if (!unresolvedKeys.has(key)) {
        unresolvedKeys.add(key);
        unresolvedPolicies.push({ policyName, source, reason });
      }
      return;
    }

    inheritedRules.push(
      ...policy.rules.map((rule) => ({
        pattern: rule.pattern,
        capabilities: rule.capabilities,
        source,
      })),
    );
  };

  selectedGroups.forEach((group) => {
    group.policyNames.forEach((policyName) => appendPolicy(policyName, groupSource(group, policyName)));
    group.roleIds.forEach((roleId) => {
      const role = rolesById.get(roleId);
      if (!role) return;
      role.policyNames.forEach((policyName) => appendPolicy(policyName, groupSource(group, role.name)));
    });
  });
  directRoleIds.forEach((roleId) => {
    const role = rolesById.get(roleId);
    if (!role) return;
    role.policyNames.forEach((policyName) => appendPolicy(policyName, roleSource(role)));
  });

  const directRules = input.directRules.flatMap(compileKvV2Rule);

  return {
    groupIds: selectedGroups.map((group) => group.id),
    inheritedRoleIds,
    directRoleIds,
    duplicateDirectRoleIds,
    policyNames: unique(policyNames),
    inheritedRules,
    directRules,
    rules: [...inheritedRules, ...directRules],
    unresolvedPolicies,
    ineffectiveDowngrades: findIneffectiveDowngrades(input.directRules, inheritedRules),
  };
}

function includesAll(
  access: ResolvedPolicyAccess,
  capabilities: readonly VaultCapability[],
): boolean {
  return capabilities.every((capability) => access.capabilities.includes(capability));
}

function permissionLevel(access: EffectiveKvEndpointAccess): EffectiveKvPermissionLevel {
  const endpoints = Object.values(access);
  if (endpoints.some((endpoint) => endpoint.denied)) return 'deny';

  const canView =
    includesAll(access.data, ['read']) &&
    includesAll(access.metadata, ['read']) &&
    includesAll(access.metadataList, ['list']);
  const canEdit = canView && includesAll(access.data, ['create', 'update', 'patch']);
  const canManageVersions =
    canEdit &&
    includesAll(access.data, ['delete']) &&
    includesAll(access.deleteVersions, ['update']) &&
    includesAll(access.undeleteVersions, ['update']);
  const isOwner =
    canManageVersions &&
    includesAll(access.metadata, ['delete']) &&
    includesAll(access.destroyVersions, ['update']);

  if (isOwner) return 'owner';
  if (canManageVersions) return 'manage-versions';
  if (canEdit) return 'edit';
  if (canView) return 'view';
  if (endpoints.some((endpoint) => endpoint.capabilities.length > 0)) return 'custom';
  return 'none';
}

function uniqueSources(endpoints: EffectiveKvEndpointAccess): readonly PolicySource[] {
  const seen = new Set<string>();
  return Object.values(endpoints).flatMap((endpoint) =>
    endpoint.sources.filter((source) => {
      const key = sourceKey(source);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function endpointPaths(node: KvAccessTreeNode): Record<keyof EffectiveKvEndpointAccess, string> {
  const mount = normalizeVaultPath(node.mount).replace(/\/+$/, '');
  const path = normalizeVaultPath(node.path).replace(/\/+$/, '');
  const probePath = node.target === 'folder' ? [path, '__vault_console_probe__'].filter(Boolean).join('/') : path;
  const endpoint = (name: string, value = probePath) =>
    [mount, name, value].filter(Boolean).join('/');

  return {
    data: endpoint('data'),
    metadata: endpoint('metadata'),
    metadataList: endpoint('metadata', node.target === 'folder' ? path : path.split('/').slice(0, -1).join('/')),
    deleteVersions: endpoint('delete'),
    undeleteVersions: endpoint('undelete'),
    destroyVersions: endpoint('destroy'),
  };
}

export function resolveEffectiveKvTree(
  nodes: readonly KvAccessTreeNode[],
  rules: readonly PolicyRule[],
): readonly EffectiveKvAccessTreeNode[] {
  return nodes.map((node) => {
    const paths = endpointPaths(node);
    const endpointAccess: EffectiveKvEndpointAccess = {
      data: resolvePolicyAccess(paths.data, rules),
      metadata: resolvePolicyAccess(paths.metadata, rules),
      metadataList: resolvePolicyAccess(paths.metadataList, rules),
      deleteVersions: resolvePolicyAccess(paths.deleteVersions, rules),
      undeleteVersions: resolvePolicyAccess(paths.undeleteVersions, rules),
      destroyVersions: resolvePolicyAccess(paths.destroyVersions, rules),
    };

    return {
      ...node,
      level: permissionLevel(endpointAccess),
      sources: uniqueSources(endpointAccess),
      endpointAccess,
      children: resolveEffectiveKvTree(node.children ?? [], rules),
    };
  });
}
