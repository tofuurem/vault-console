import { describe, expect, it } from 'vitest';

import {
  resolveAccessSelection,
  resolveEffectiveKvTree,
  type AccessGroup,
  type AccessPolicy,
  type AccessRole,
  type KvAccessTreeNode,
  type ResolveAccessSelectionInput,
} from './effective-access';
import type { LogicalKvAccessRule } from './kv-v2-policy-compiler';
import type { PolicySource } from './types';

const roles: readonly AccessRole[] = [
  { id: 'reader', name: 'Platform reader', policyNames: ['platform-reader'] },
  { id: 'editor', name: 'Billing editor', policyNames: ['billing-editor'] },
];
const groups: readonly AccessGroup[] = [
  { id: 'platform', name: 'Platform team', roleIds: ['reader'], policyNames: ['legacy-audit'] },
];
const policies: readonly AccessPolicy[] = [
  {
    name: 'platform-reader',
    managed: true,
    rules: [
      { pattern: 'secret/data/apps/billing/*', capabilities: ['read'] },
      { pattern: 'secret/metadata', capabilities: ['list'] },
      { pattern: 'secret/metadata/apps', capabilities: ['list'] },
      { pattern: 'secret/metadata/apps/billing/*', capabilities: ['read', 'list'] },
    ],
  },
  {
    name: 'billing-editor',
    managed: true,
    rules: [
      { pattern: 'secret/data/apps/billing/*', capabilities: ['create', 'read', 'update', 'patch'] },
      { pattern: 'secret/metadata/apps/billing/*', capabilities: ['read', 'list'] },
      { pattern: 'secret/metadata/apps/billing', capabilities: ['list'] },
    ],
  },
  { name: 'legacy-audit', managed: false, rules: null },
];
const directSource: PolicySource = {
  kind: 'user-rule',
  id: 'alice-rule',
  label: 'Alice direct access',
};
const tree: readonly KvAccessTreeNode[] = [
  {
    id: 'billing',
    label: 'Billing',
    mount: 'secret',
    path: 'apps/billing',
    target: 'folder',
  },
];

function directRule(overrides: Partial<LogicalKvAccessRule> = {}): LogicalKvAccessRule {
  return {
    mount: 'secret',
    path: 'apps/billing',
    target: 'folder',
    level: 'view',
    source: directSource,
    ...overrides,
  };
}

function input(overrides: Partial<ResolveAccessSelectionInput> = {}): ResolveAccessSelectionInput {
  return {
    groups,
    roles,
    policies,
    selectedGroupIds: [],
    directRoleIds: [],
    directRules: [],
    ...overrides,
  };
}

describe('resolveAccessSelection', () => {
  it('removes a direct role already inherited through a selected group', () => {
    const result = resolveAccessSelection(
      input({ selectedGroupIds: ['platform'], directRoleIds: ['reader', 'editor'] }),
    );

    expect(result.inheritedRoleIds).toEqual(['reader']);
    expect(result.directRoleIds).toEqual(['editor']);
    expect(result.duplicateDirectRoleIds).toEqual(['reader']);
    expect(result.policyNames).toEqual(['legacy-audit', 'platform-reader', 'billing-editor']);
  });

  it('reports unsupported external policies with their group provenance', () => {
    const result = resolveAccessSelection(input({ selectedGroupIds: ['platform'] }));

    expect(result.unresolvedPolicies).toEqual([
      {
        policyName: 'legacy-audit',
        reason: 'unsupported',
        source: { kind: 'group', id: 'platform', label: 'Platform team', via: 'legacy-audit' },
      },
    ]);
  });

  it('detects a same-pattern direct downgrade that Vault would union with inherited grants', () => {
    const result = resolveAccessSelection(
      input({ directRoleIds: ['editor'], directRules: [directRule()] }),
    );

    expect(result.ineffectiveDowngrades).toEqual([
      {
        mount: 'secret',
        path: 'apps/billing',
        requestedLevel: 'view',
        patterns: ['secret/data/apps/billing/*'],
      },
    ]);
    expect(resolveEffectiveKvTree(tree, result.rules)[0].level).toBe('edit');
  });
});

describe('resolveEffectiveKvTree', () => {
  it('resolves group and direct-role policies into one tree with provenance', () => {
    const selection = resolveAccessSelection(
      input({ selectedGroupIds: ['platform'], directRoleIds: ['editor'] }),
    );
    const [billing] = resolveEffectiveKvTree(tree, selection.rules);

    expect(billing.level).toBe('edit');
    expect(billing.sources).toContainEqual({
      kind: 'group',
      id: 'platform',
      label: 'Platform team',
      via: 'Platform reader',
    });
    expect(billing.sources).toContainEqual({ kind: 'role', id: 'editor', label: 'Billing editor' });
  });

  it('shows a direct deny distinctly and retains its source', () => {
    const selection = resolveAccessSelection(
      input({ directRoleIds: ['editor'], directRules: [directRule({ level: 'deny' })] }),
    );
    const [billing] = resolveEffectiveKvTree(tree, selection.rules);

    expect(billing.level).toBe('deny');
    expect(billing.sources).toContainEqual(directSource);
  });
});
