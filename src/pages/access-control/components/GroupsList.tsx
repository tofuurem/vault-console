import type { VaultIdentityGroup } from '@/domain/vault/contracts';
import { classifyPolicyName, managedRoleName } from '@/domain/access-control/managed-resources';

export default function GroupsList({ groups }: { readonly groups: readonly VaultIdentityGroup[] }) {
  return (
    <section aria-labelledby="groups-heading" className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-background-200 px-5 py-3"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">Vault Identity</p><div className="flex items-center gap-2"><h1 id="groups-heading" className="text-sm font-semibold text-foreground-900">Internal groups</h1><span className="text-xs text-foreground-400">{groups.length}</span></div></header>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const roles = group.policies.filter((policy) => classifyPolicyName(policy) === 'role');
          const external = group.policies.filter((policy) => classifyPolicyName(policy) !== 'role');
          return <article key={group.id} className="rounded-lg border border-background-300 bg-background-50 p-4"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-foreground-900">{group.name}</h2><p className="mt-0.5 font-mono text-[10px] text-foreground-400">{group.id}</p></div><span className="rounded bg-secondary-100 px-2 py-1 text-[10px] font-medium text-secondary-700">{group.memberEntityIds.length} members</span></div><div className="mt-4"><p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Managed roles</p><div className="flex flex-wrap gap-1">{roles.length ? roles.map((role) => <span key={role} className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700">{managedRoleName(role)}</span>) : <span className="text-xs text-foreground-400">None</span>}</div></div>{external.length > 0 && <div className="mt-3"><p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">External policies</p>{external.map((policy) => <p key={policy} className="font-mono text-[10px] text-amber-700">{policy}</p>)}</div>}</article>;
        })}
        {groups.length === 0 && <div className="col-span-full py-16 text-center text-sm text-foreground-500">No readable internal identity groups.</div>}
      </div>
    </section>
  );
}
