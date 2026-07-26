import { decompileKvV2Policy } from '@/domain/access-control/kv-v2-policy-decompiler';
import {
  compileKvV2Policy,
  type LogicalKvAccessRule,
} from '@/domain/access-control/kv-v2-policy-compiler';
import type { RoleLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import { parseManagedPolicyHeader } from '@/domain/access-control/policy-ownership';
import type { PolicySource } from '@/domain/access-control/types';
import type {
  CreateUserAccessCatalog,
  DirectKvAccessRule,
} from '../create-user/access';

export interface RoleEditorDraft {
  readonly policyName: string;
  readonly description: string;
  readonly directRules: readonly DirectKvAccessRule[];
}

export interface RoleEditorInitialState {
  readonly draft: RoleEditorDraft;
  readonly visualSupported: boolean;
}

export function roleSource(policyName: string): PolicySource {
  return {
    kind: 'role',
    id: policyName || 'new-role',
    label: policyName || 'New managed role',
  };
}

export function initialRoleEditorState(
  snapshot: RoleLifecycleSnapshot,
  catalog: CreateUserAccessCatalog,
): RoleEditorInitialState {
  const policyName = snapshot.policy?.name ?? '';
  const header = snapshot.policy
    ? parseManagedPolicyHeader(snapshot.policy.policy)
    : null;
  const logical = snapshot.policy
    ? decompileKvV2Policy(
        snapshot.policy.policy,
        catalog.tree.map(({ mount }) => mount),
        roleSource(policyName),
      )
    : [];
  return {
    draft: {
      policyName,
      description: header?.kind === 'role' ? header.description ?? '' : '',
      directRules: (logical ?? []).map((rule) => ({
        nodeId: `${rule.mount}:${rule.path}`,
        mount: rule.mount,
        path: rule.path,
        target: rule.target,
        level: rule.level as Exclude<typeof rule.level, 'inherited'>,
      })),
    },
    visualSupported: logical !== null,
  };
}

export function roleEditorDraftKey(draft: RoleEditorDraft): string {
  return JSON.stringify({
    policyName: draft.policyName,
    description: draft.description,
    directRules: [...draft.directRules].sort((left, right) => (
      left.nodeId.localeCompare(right.nodeId)
    )),
  });
}

export function logicalRoleRules(
  draft: RoleEditorDraft,
): readonly LogicalKvAccessRule[] {
  const source = roleSource(draft.policyName);
  return draft.directRules.map((rule) => ({
    mount: rule.mount,
    path: rule.path,
    target: rule.target,
    level: rule.level,
    source,
  }));
}

export function roleDraftHcl(draft: RoleEditorDraft): string {
  return compileKvV2Policy(logicalRoleRules(draft)).hcl;
}
