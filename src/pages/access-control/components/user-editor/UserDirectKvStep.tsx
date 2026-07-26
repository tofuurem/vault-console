import {
  useMemo,
} from 'react';

import {
  resolveAccessSelection,
  resolveEffectiveKvTree,
  type KvAccessTreeNode,
} from '@/domain/access-control/effective-access';
import type { UserLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type { LogicalKvAccessRule } from '@/domain/access-control/kv-v2-policy-compiler';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';
import type { PolicySource } from '@/domain/access-control/types';
import type { VaultSession } from '@/domain/vault/contracts';
import AccessSummary from '../create-user/AccessSummary';
import CustomAccessTarget from '../create-user/CustomAccessTarget';
import LazyEffectivePermissionTree from '../create-user/LazyEffectivePermissionTree';
import type {
  CreateUserAccessCatalog,
  DirectKvAccessRule,
} from '../create-user/access';
import type { UserEditorDraft } from './user-editor-draft';

interface UserDirectKvStepProps {
  readonly snapshot: UserLifecycleSnapshot;
  readonly catalog: CreateUserAccessCatalog;
  readonly session: VaultSession;
  readonly draft: UserEditorDraft;
  readonly supported: boolean;
  readonly onChange: (draft: UserEditorDraft) => void;
}

export default function UserDirectKvStep({
  snapshot,
  catalog,
  session,
  draft,
  supported,
  onChange,
}: UserDirectKvStepProps) {
  const source: PolicySource = useMemo(() => ({
    kind: 'user-rule',
    id: `vc-user-${snapshot.account.username}`,
    label: 'Per-user rule',
  }), [snapshot.account.username]);
  const logicalRules: readonly LogicalKvAccessRule[] = draft.directRules.map((rule) => ({
    mount: rule.mount,
    path: rule.path,
    target: rule.target,
    level: rule.level,
    source,
  }));
  const selection = resolveAccessSelection({
    groups: catalog.groups,
    roles: catalog.roles,
    policies: catalog.policies,
    selectedGroupIds: draft.groupIds,
    directRoleIds: draft.directRoleIds,
    directRules: logicalRules,
  });
  const effectiveTree = resolveEffectiveKvTree(catalog.tree, selection.rules);
  const editable = supported && snapshot.directPolicyEditable && (
    snapshot.directPolicyOwnership !== 'unverified'
    || draft.adoptDirectPolicy
  );
  const updateDirectRule = (node: KvAccessTreeNode, level: KvPermissionLevel) => {
    const withoutNode = draft.directRules.filter((rule) => rule.nodeId !== node.id);
    const directRules: readonly DirectKvAccessRule[] = level === 'inherited'
      ? withoutNode
      : [
          ...withoutNode,
          {
            nodeId: node.id,
            mount: node.mount,
            path: node.path,
            target: node.target,
            level,
          },
        ];
    onChange({ ...draft, directRules });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Effective KV v2
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Direct paths and final access
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          The tree combines selected groups, direct roles, and this user’s own policy. Only the
          per-user layer is editable here.
        </p>
      </div>

      {!supported && (
        <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-4 text-warning-900">
          <p className="text-xs font-semibold">Direct policy cannot be represented safely</p>
          <p className="mt-1 text-[10px] leading-4">
            Its HCL remains preserved and read-only. Remove unsupported constructs through an
            administrator workflow before visual editing.
          </p>
        </div>
      )}

      {supported
        && snapshot.directPolicyOwnership === 'unverified'
        && snapshot.directPolicyEditable
        && (
        <label className="flex items-start gap-3 rounded-lg border border-warning-300 bg-warning-50 p-4">
          <input
            type="checkbox"
            checked={draft.adoptDirectPolicy}
            onChange={(event) => onChange({
              ...draft,
              adoptDirectPolicy: event.target.checked,
            })}
            className="mt-0.5 h-4 w-4 rounded border-warning-400 text-primary-600 focus:ring-primary-400"
          />
          <span>
            <strong className="block text-xs text-warning-900">
              Adopt the legacy 0.5.0 per-user policy
            </strong>
            <span className="mt-1 block text-[10px] leading-4 text-warning-800">
              Review will add an ownership header without changing capabilities. Editing unlocks
              only after the dependency preflight remains complete.
            </span>
          </span>
        </label>
        )}

      {supported && !snapshot.directPolicyEditable && (
        <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-4 text-warning-900">
          <p className="text-xs font-semibold">Direct policy is preserved read-only</p>
          <p className="mt-1 text-[10px] leading-4">
            Safe editing requires this policy to be attached directly to the userpass account,
            have no other resource references, and have complete dependency visibility.
          </p>
        </div>
      )}

      {editable ? (
        <>
          <CustomAccessTarget
            mounts={catalog.tree}
            source={source}
            directRules={draft.directRules}
            onDirectRuleChange={updateDirectRule}
          />
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
            <LazyEffectivePermissionTree
              nodes={catalog.tree}
              rules={selection.rules}
              directRules={draft.directRules}
              session={session}
              onDirectRuleChange={updateDirectRule}
            />
            <AccessSummary
              groups={catalog.groups}
              roles={catalog.roles}
              selection={selection}
              effectiveTree={effectiveTree}
              directRules={draft.directRules}
            />
          </div>
        </>
      ) : supported && snapshot.directPolicyEditable ? (
        <div className="rounded-lg border border-background-300 bg-background-50 p-6 text-center">
          <i className="ri-lock-line text-xl text-foreground-300" aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold text-foreground-700">
            Adopt this supported policy to edit it visually
          </p>
          <p className="mt-1 text-[10px] text-foreground-400">
            Until then it is treated as external and preserved byte-for-byte.
          </p>
        </div>
      ) : null}
    </div>
  );
}
