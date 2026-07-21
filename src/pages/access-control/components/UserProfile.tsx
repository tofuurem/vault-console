import { useState } from 'react';

import type { AccessControlUserRecord } from '@/application/vault/useAccessControlData';
import Button from '@/components/base/Button';
import Tabs from '@/components/base/Tabs';
import { resolveAccessSelection, resolveEffectiveKvTree, type AccessRole } from '@/domain/access-control/effective-access';
import type { CreateUserAccessCatalog } from './create-user/access';
import EffectivePermissionTree from './create-user/EffectivePermissionTree';

interface UserProfileProps {
  readonly user: AccessControlUserRecord;
  readonly catalog: CreateUserAccessCatalog;
  readonly onBack: () => void;
}

export default function UserProfile({ user, catalog, onBack }: UserProfileProps) {
  const [tab, setTab] = useState('overview');
  const policyRoleIds = [...user.directPolicyNames, ...user.externalPolicyNames].map((name) => `policy:${name}`);
  const policyRoles: readonly AccessRole[] = policyRoleIds.map((id) => ({
    id,
    name: id.replace('policy:', ''),
    policyNames: [id.replace('policy:', '')],
  }));
  const selection = resolveAccessSelection({
    groups: catalog.groups,
    roles: [...catalog.roles, ...policyRoles],
    policies: catalog.policies,
    selectedGroupIds: user.groups.map((group) => group.id),
    directRoleIds: [...user.directRolePolicyNames, ...policyRoleIds],
    directRules: [],
  });
  const effectiveTree = resolveEffectiveKvTree(catalog.tree, selection.rules);
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'ri-dashboard-line' },
    { key: 'effective', label: 'Effective access', icon: 'ri-shield-check-line' },
    { key: 'identity', label: 'Identity', icon: 'ri-fingerprint-line' },
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-background-200 px-5 py-3"><Button size="sm" onClick={onBack}><i className="ri-arrow-left-line" aria-hidden="true" /> Users</Button><div><h1 className="text-sm font-semibold text-foreground-900">{user.displayName}</h1><p className="font-mono text-[10px] text-foreground-400">{user.mount}/{user.username}</p></div></header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Tabs tabs={tabs} activeTab={tab} onChange={setTab}>
          {tab === 'overview' && <div className="space-y-5 p-5"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">{user.displayName.charAt(0).toUpperCase()}</div><div><h2 className="text-sm font-semibold text-foreground-900">{user.displayName}</h2><p className="font-mono text-xs text-foreground-500">{user.username}</p></div></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Summary label="Auth mount" values={[`${user.mount}/`]} mono /><Summary label="Groups" values={user.groups.map((group) => group.name)} /><Summary label="Direct roles" values={user.directRolePolicyNames} mono /><Summary label="Other policies" values={[...user.directPolicyNames, ...user.externalPolicyNames]} mono /></div>{selection.unresolvedPolicies.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><p className="font-semibold">Effective access includes unresolved HCL</p><p className="mt-1">{selection.unresolvedPolicies.map((item) => item.policyName).join(', ')}</p></div>}</div>}
          {tab === 'effective' && <div className="p-5"><EffectivePermissionTree nodes={effectiveTree} directRules={[]} onDirectRuleChange={() => undefined} readOnly /></div>}
          {tab === 'identity' && <div className="space-y-3 p-5"><IdentityRow label="Entity ID" value={user.entity?.id ?? 'No identity entity'} /><IdentityRow label="Alias ID" value={user.entity?.aliases.find((alias) => alias.mountAccessor === user.mountAccessor)?.id ?? 'No alias'} /><IdentityRow label="Mount accessor" value={user.mountAccessor} /><IdentityRow label="Token policies" value={user.tokenPolicies.join(', ') || 'None'} /></div>}
        </Tabs>
      </div>
    </section>
  );
}

function Summary({ label, values, mono = false }: { label: string; values: readonly string[]; mono?: boolean }) {
  return <div className="rounded-md border border-background-200 p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-foreground-400">{label}</p><div className="mt-2 flex flex-wrap gap-1">{values.length ? values.map((value) => <span key={value} className={`rounded bg-background-100 px-1.5 py-0.5 text-[10px] text-foreground-700 ${mono ? 'font-mono' : ''}`}>{value}</span>) : <span className="text-xs text-foreground-400">None</span>}</div></div>;
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return <div className="flex max-w-2xl justify-between gap-6 border-b border-background-200 pb-3 text-xs"><span className="text-foreground-500">{label}</span><span className="break-all text-right font-mono text-foreground-800">{value}</span></div>;
}
