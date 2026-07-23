import { useMemo } from 'react';

import {
  resolveAccessSelection,
  resolveEffectiveKvTree,
  type KvAccessTreeNode,
} from '@/domain/access-control/effective-access';
import type { LogicalKvAccessRule } from '@/domain/access-control/kv-v2-policy-compiler';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';
import type { PolicySource } from '@/domain/access-control/types';
import type { VaultSession } from '@/domain/vault/contracts';
import AccessSourcePicker from './AccessSourcePicker';
import AccessSummary from './AccessSummary';
import EffectivePermissionTree from './EffectivePermissionTree';
import LazyEffectivePermissionTree from './LazyEffectivePermissionTree';
import type { AccessDraft, CreateUserAccessCatalog, DirectKvAccessRule } from './access';

interface AccessScreenProps {
  readonly username: string;
  readonly catalog: CreateUserAccessCatalog;
  readonly value: AccessDraft;
  readonly onChange: (next: AccessDraft) => void;
  readonly lazyTreeSession?: VaultSession;
}

export default function AccessScreen({
  username,
  catalog,
  value,
  onChange,
  lazyTreeSession,
}: AccessScreenProps) {
  const directSource: PolicySource = useMemo(
    () => ({ kind: 'user-rule', id: `vc-user-${username || 'new-user'}`, label: 'Per-user rule' }),
    [username],
  );
  const logicalDirectRules: readonly LogicalKvAccessRule[] = value.directRules.map((rule) => ({
    mount: rule.mount,
    path: rule.path,
    target: rule.target,
    level: rule.level,
    source: directSource,
  }));
  const selection = resolveAccessSelection({
    groups: catalog.groups,
    roles: catalog.roles,
    policies: catalog.policies,
    selectedGroupIds: value.selectedGroupIds,
    directRoleIds: value.directRoleIds,
    directRules: logicalDirectRules,
  });
  const effectiveTree = resolveEffectiveKvTree(catalog.tree, selection.rules);

  const toggle = (values: readonly string[], id: string): readonly string[] =>
    values.includes(id) ? values.filter((valueId) => valueId !== id) : [...values, id];
  const toggleGroup = (groupId: string) => {
    const selectedGroupIds = toggle(value.selectedGroupIds, groupId);
    const inheritedRoleIds = new Set(
      catalog.groups
        .filter((group) => selectedGroupIds.includes(group.id))
        .flatMap((group) => group.roleIds),
    );
    onChange({
      ...value,
      selectedGroupIds,
      directRoleIds: value.directRoleIds.filter((roleId) => !inheritedRoleIds.has(roleId)),
    });
  };
  const updateDirectRule = (node: KvAccessTreeNode, level: KvPermissionLevel) => {
    const withoutNode = value.directRules.filter((rule) => rule.nodeId !== node.id);
    const directRules: readonly DirectKvAccessRule[] = level === 'inherited'
      ? withoutNode
      : [
          ...withoutNode,
          { nodeId: node.id, mount: node.mount, path: node.path, target: node.target, level },
        ];
    onChange({ ...value, directRules });
  };

  return (
    <section aria-labelledby="access-heading" className="w-full px-4 py-5 lg:px-5">
      <div className="mb-4">
        <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">Authorization</p>
        <h2 id="access-heading" className="text-base font-semibold text-foreground-900">Choose access in one place</h2>
        <p className="mt-1 text-xs leading-5 text-foreground-500">Groups provide the baseline. The tree always shows the final Vault result before you create the user.</p>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(430px,1fr)_230px]">
        <AccessSourcePicker
          groups={catalog.groups}
          roles={catalog.roles}
          selectedGroupIds={selection.groupIds}
          directRoleIds={selection.directRoleIds}
          inheritedRoleIds={selection.inheritedRoleIds}
          onToggleGroup={toggleGroup}
          onToggleRole={(roleId) => onChange({ ...value, directRoleIds: toggle(value.directRoleIds, roleId) })}
        />
        {lazyTreeSession ? (
          <LazyEffectivePermissionTree
            nodes={catalog.tree}
            rules={selection.rules}
            directRules={value.directRules}
            session={lazyTreeSession}
            onDirectRuleChange={updateDirectRule}
          />
        ) : (
          <EffectivePermissionTree nodes={effectiveTree} directRules={value.directRules} onDirectRuleChange={updateDirectRule} />
        )}
        <div className="lg:col-span-2 xl:col-span-1">
          <AccessSummary
            groups={catalog.groups}
            roles={catalog.roles}
            selection={selection}
            effectiveTree={effectiveTree}
            directRules={value.directRules}
          />
        </div>
      </div>
    </section>
  );
}
