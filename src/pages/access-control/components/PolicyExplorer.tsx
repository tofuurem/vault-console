import { useState } from 'react';

import type { AccessPolicyRecord } from '@/application/vault/useAccessControlData';
import Badge from '@/components/base/Badge';

function PolicyBadge({ policy }: { readonly policy: AccessPolicyRecord }) {
  if (policy.kind === 'role') return <Badge variant="info">Managed role</Badge>;
  if (policy.kind === 'user-direct') return <Badge variant="default">Per-user</Badge>;
  return <Badge variant="warning">External</Badge>;
}

export default function PolicyExplorer({ policies }: { readonly policies: readonly AccessPolicyRecord[] }) {
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string>();
  const [showHcl, setShowHcl] = useState(false);
  const filtered = policies.filter((policy) => policy.name.toLowerCase().includes(search.toLowerCase()));
  const selected = policies.find((policy) => policy.name === selectedName);

  return (
    <section aria-labelledby="policies-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-background-200 px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">Vault ACL</p><div className="flex items-center gap-2"><h1 id="policies-heading" className="text-sm font-semibold text-foreground-900">Policy explorer</h1><span className="text-xs text-foreground-400">{policies.length}</span></div></div><label className="relative"><span className="sr-only">Search policies</span><i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search policy names" className="h-7 w-56 rounded-md border border-background-300 bg-background-50 pl-6 pr-2.5 text-xs focus:outline-none focus:border-primary-400" /></label></div></header>
      <div className="flex min-h-0 flex-1">
        <div className="w-[340px] shrink-0 overflow-y-auto border-r border-background-200">{filtered.map((policy) => <button key={policy.name} type="button" onClick={() => { setSelectedName(policy.name); setShowHcl(false); }} className={`w-full border-b border-background-100 px-4 py-3 text-left transition-colors ${selectedName === policy.name ? 'border-l-2 border-l-primary-500 bg-primary-50' : 'hover:bg-background-100'}`}><div className="flex items-center gap-2"><span className="truncate font-mono text-xs font-medium text-foreground-800">{policy.name}</span><PolicyBadge policy={policy} /></div><p className="mt-1 text-[10px] text-foreground-400">{policy.readable ? `${policy.rules?.length ?? 0} visual paths` : 'Policy body not readable'}</p></button>)}</div>
        <div className="flex-1 overflow-y-auto">{selected ? <div className="space-y-5 p-5"><div><div className="flex items-center gap-2"><h2 className="font-mono text-sm font-semibold text-foreground-900">{selected.name}</h2><PolicyBadge policy={selected} /></div>{selected.kind === 'external' && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">External policies are read-only. Vault Console never rewrites HCL it did not create.</p>}</div>{selected.rules ? <div><h3 className="text-[10px] font-semibold uppercase tracking-wider text-foreground-500">Paths and capabilities</h3><div className="mt-2 space-y-2">{selected.rules.map((rule) => <div key={rule.pattern} className="rounded-md border border-background-200 p-3"><p className="break-all font-mono text-xs text-foreground-800">{rule.pattern}</p><div className="mt-2 flex flex-wrap gap-1">{rule.capabilities.map((capability) => <span key={capability} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${capability === 'deny' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{capability}</span>)}</div></div>)}</div></div> : <div className="rounded-md border border-background-200 bg-background-100 p-3 text-xs leading-5 text-foreground-500">This policy cannot be represented safely in the visual editor. Use the raw HCL view for inspection.</div>}{selected.hcl && <div><button type="button" onClick={() => setShowHcl((current) => !current)} className="text-xs font-medium text-primary-600">{showHcl ? 'Hide' : 'Show'} raw HCL</button>{showHcl && <pre className="mt-2 overflow-x-auto whitespace-pre rounded-md border border-background-200 bg-background-100 p-3 font-mono text-[11px] text-foreground-700">{selected.hcl}</pre>}</div>}</div> : <div className="flex h-full flex-col items-center justify-center text-center"><i className="ri-file-code-line mb-2 text-2xl text-foreground-300" aria-hidden="true" /><p className="text-sm text-foreground-600">Select a policy</p><p className="mt-1 text-xs text-foreground-400">External policies remain visible and read-only.</p></div>}</div>
      </div>
    </section>
  );
}
