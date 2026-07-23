import { useState } from 'react';

import type { AccessPolicyRecord } from '@/application/vault/useAccessControlData';
import type { VaultQueryState } from '@/application/vault/useKvExplorerData';
import Badge from '@/components/base/Badge';
import { classifyPolicyName } from '@/domain/access-control/managed-resources';

function PolicyBadge({ kind }: { readonly kind: AccessPolicyRecord['kind'] }) {
  if (kind === 'role') return <Badge variant="info">Managed role</Badge>;
  if (kind === 'user-direct') return <Badge variant="default">Per-user</Badge>;
  return <Badge variant="warning">External</Badge>;
}

interface PolicyExplorerProps {
  readonly policyNames: readonly string[];
  readonly selectedName?: string;
  readonly selectedPolicy: VaultQueryState<AccessPolicyRecord>;
  readonly onSelect: (name: string | undefined) => void;
}

export default function PolicyExplorer({
  policyNames,
  selectedName,
  selectedPolicy,
  onSelect,
}: PolicyExplorerProps) {
  const [search, setSearch] = useState('');
  const [showHcl, setShowHcl] = useState(false);
  const filtered = policyNames.filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  const selected = selectedPolicy.status === 'success' ? selectedPolicy.data : undefined;

  return (
    <section aria-labelledby="policies-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-background-200 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">Vault ACL</p>
            <div className="flex items-center gap-2">
              <h1 id="policies-heading" className="text-sm font-semibold text-foreground-900">Policy explorer</h1>
              <span className="text-xs text-foreground-400">{policyNames.length}</span>
            </div>
          </div>
          <label className="relative">
            <span className="sr-only">Search policies</span>
            <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search policy names" className="h-7 w-56 rounded-md border border-background-300 bg-background-50 pl-6 pr-2.5 text-xs focus:border-primary-400 focus:outline-none" />
          </label>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className={`${selectedName ? 'hidden sm:block' : 'w-full'} shrink-0 overflow-y-auto border-r border-background-200 sm:w-[340px]`}>
          {filtered.map((name) => {
            const kind = classifyPolicyName(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onSelect(name);
                  setShowHcl(false);
                }}
                className={`w-full border-b border-background-100 px-4 py-3 text-left transition-colors ${selectedName === name ? 'border-l-2 border-l-primary-500 bg-primary-50' : 'hover:bg-background-100'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs font-medium text-foreground-800">{name}</span>
                  <PolicyBadge kind={kind} />
                </div>
                <p className="mt-1 text-[10px] text-foreground-400">Select to read policy body</p>
              </button>
            );
          })}
        </div>
        <div className={`${selectedName ? 'flex-1' : 'hidden sm:block'} min-w-0 overflow-y-auto`}>
          {!selectedName && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <i className="ri-file-code-line mb-2 text-2xl text-foreground-300" aria-hidden="true" />
              <p className="text-sm text-foreground-600">Select a policy</p>
              <p className="mt-1 text-xs text-foreground-400">The HCL body loads only after selection.</p>
            </div>
          )}
          {selectedName && selectedPolicy.status === 'loading' && (
            <div role="status" className="flex h-full items-center justify-center text-xs text-foreground-500">
              <i className="ri-loader-4-line mr-1 animate-spin" aria-hidden="true" /> Loading policy…
            </div>
          )}
          {selectedName && selectedPolicy.status === 'error' && (
            <div role="alert" className="m-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              This policy could not be loaded: {selectedPolicy.error.message}
            </div>
          )}
          {selected && (
            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <button type="button" onClick={() => onSelect(undefined)} className="mb-3 text-xs font-medium text-primary-600 sm:hidden">
                  <i className="ri-arrow-left-line mr-1" aria-hidden="true" />All policies
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-all font-mono text-sm font-semibold text-foreground-900">{selected.name}</h2>
                  <PolicyBadge kind={selected.kind} />
                </div>
                {selected.kind === 'external' && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                    External policies are read-only. Vault Console never rewrites HCL it did not create.
                  </p>
                )}
              </div>
              {selected.rules ? (
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-foreground-500">Paths and capabilities</h3>
                  <div className="mt-2 space-y-2">
                    {selected.rules.map((rule) => (
                      <div key={rule.pattern} className="rounded-md border border-background-200 p-3">
                        <p className="break-all font-mono text-xs text-foreground-800">{rule.pattern}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {rule.capabilities.map((capability) => (
                            <span key={capability} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${capability === 'deny' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {capability}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-background-200 bg-background-100 p-3 text-xs leading-5 text-foreground-500">
                  This policy cannot be represented safely in the visual editor. Use the raw HCL view for inspection.
                </div>
              )}
              {selected.hcl && (
                <div>
                  <button type="button" onClick={() => setShowHcl((current) => !current)} className="text-xs font-medium text-primary-600">
                    {showHcl ? 'Hide' : 'Show'} raw HCL
                  </button>
                  {showHcl && <pre className="mt-2 overflow-x-auto whitespace-pre rounded-md border border-background-200 bg-background-100 p-3 font-mono text-[11px] text-foreground-700">{selected.hcl}</pre>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
