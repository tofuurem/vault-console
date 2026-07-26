import type { UserLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import {
  compileKvV2Policy,
  type LogicalKvAccessRule,
} from '@/domain/access-control/kv-v2-policy-compiler';
import { decompileKvV2Policy } from '@/domain/access-control/kv-v2-policy-decompiler';
import { renderManagedPolicy } from '@/domain/access-control/policy-ownership';
import type { PolicySource } from '@/domain/access-control/types';
import type { CreateUserAccessCatalog, DirectKvAccessRule } from '../create-user/access';

export interface UserEditorDraft {
  readonly displayName: string;
  readonly groupIds: readonly string[];
  readonly directRoleIds: readonly string[];
  readonly directRules: readonly DirectKvAccessRule[];
  readonly adoptDirectPolicy: boolean;
}

export interface UserEditorInitialState {
  readonly draft: UserEditorDraft;
  readonly directPolicySupported: boolean;
}

function directSource(username: string): PolicySource {
  return {
    kind: 'user-rule',
    id: `vc-user-${username}`,
    label: 'Per-user rule',
  };
}

function toDirectRule(rule: LogicalKvAccessRule): DirectKvAccessRule {
  return {
    nodeId: `${rule.mount}:${rule.path}`,
    mount: rule.mount,
    path: rule.path,
    target: rule.target,
    level: rule.level as DirectKvAccessRule['level'],
  };
}

export function createUserEditorInitialState(
  snapshot: UserLifecycleSnapshot,
  catalog: CreateUserAccessCatalog,
): UserEditorInitialState {
  const managedRoleNames = new Set(
    catalog.roles.flatMap(({ policyNames }) => policyNames),
  );
  const directPolicyApplies = Boolean(
    snapshot.directPolicy
    && (
      snapshot.account.tokenPolicies.includes(snapshot.directPolicy.name)
      || snapshot.entity?.policies.includes(snapshot.directPolicy.name)
    )
  );
  const directRules = snapshot.directPolicy && directPolicyApplies
    ? decompileKvV2Policy(
        snapshot.directPolicy.policy,
        catalog.tree.map(({ mount }) => mount),
        directSource(snapshot.account.username),
      )
    : [];
  return {
    draft: {
      displayName: snapshot.entity?.name ?? snapshot.account.username,
      groupIds: snapshot.entity
        ? snapshot.groups
            .filter((group) => (
              (group.type ?? 'internal') === 'internal'
              && group.memberEntityIds.includes(snapshot.entity!.id)
            ))
            .map(({ id }) => id)
        : [],
      directRoleIds: snapshot.account.tokenPolicies.filter(
        (name) => managedRoleNames.has(name),
      ),
      directRules: directRules?.map(toDirectRule) ?? [],
      adoptDirectPolicy: false,
    },
    directPolicySupported: snapshot.directPolicy === null
      || (directPolicyApplies && directRules !== null),
  };
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

export function userEditorDraftKey(draft: UserEditorDraft): string {
  return JSON.stringify({
    displayName: draft.displayName.trim(),
    groupIds: sorted(draft.groupIds),
    directRoleIds: sorted(draft.directRoleIds),
    directRules: [...draft.directRules]
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    adoptDirectPolicy: draft.adoptDirectPolicy,
  });
}

export function editorDirectPolicy(
  snapshot: UserLifecycleSnapshot,
  draft: UserEditorDraft,
  supported: boolean,
) {
  if (!supported || !snapshot.directPolicyEditable) return snapshot.directPolicy;
  if (
    snapshot.directPolicyOwnership === 'unverified'
    && !draft.adoptDirectPolicy
  ) return snapshot.directPolicy;
  if (draft.directRules.length === 0) return null;
  const source = directSource(snapshot.account.username);
  const logical: readonly LogicalKvAccessRule[] = draft.directRules.map((rule) => ({
    mount: rule.mount,
    path: rule.path,
    target: rule.target,
    level: rule.level,
    source,
  }));
  return {
    name: `vc-user-${snapshot.account.username}`,
    policy: renderManagedPolicy(
      { kind: 'user-direct', owner: snapshot.account.username },
      compileKvV2Policy(logical).hcl,
    ),
  };
}
