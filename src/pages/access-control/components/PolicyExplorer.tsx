import { useState } from 'react';
import type { VaultPolicy } from '@/mocks/vault-acl';
import { vaultPolicies } from '@/mocks/vault-acl';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';

export default function PolicyExplorer() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<VaultPolicy | null>(null);
  const [showHCL, setShowHCL] = useState(false);

  const filtered = vaultPolicies.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.paths.some((pt) => pt.path.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const typeBadge = (policy: VaultPolicy) => {
    if (policy.is_external) return <Badge variant="warning">External</Badge>;
    switch (policy.type) {
      case 'role': return <Badge variant="info">UI Role</Badge>;
      case 'user-direct': return <Badge variant="default">Per-user</Badge>;
      default: return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground-900">Policy Explorer</h2>
            <span className="text-xs text-foreground-400">{vaultPolicies.length} policies</span>
          </div>
          <div className="relative">
            <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or path..."
              className="h-7 pl-6 pr-2.5 text-xs rounded-md border border-background-300 bg-background-50 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 w-56"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-[360px] shrink-0 border-r border-background-200 overflow-y-auto">
          {filtered.map((policy) => (
            <button
              key={policy.name}
              onClick={() => { setSelectedPolicy(policy); setShowHCL(false); }}
              className={`w-full text-left px-4 py-3 border-b border-background-100 cursor-pointer transition-colors ${
                selectedPolicy?.name === policy.name ? 'bg-primary-50 border-l-2 border-l-primary-500' : 'hover:bg-background-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium text-foreground-800">{policy.name}</span>
                {typeBadge(policy)}
              </div>
              <p className="text-[11px] text-foreground-500 mt-0.5">{policy.description}</p>
              <div className="flex items-center gap-2 mt-1 text-[10px]">
                {policy.affected_users.length > 0 && policy.affected_users[0] !== '*' && (
                  <span className="text-foreground-400">
                    <i className="ri-user-line text-[9px] mr-0.5" />
                    {policy.affected_users.length} user{policy.affected_users.length > 1 ? 's' : ''}
                  </span>
                )}
                {policy.affected_groups.length > 0 && policy.affected_groups[0] !== '*' && (
                  <span className="text-foreground-400">
                    <i className="ri-group-line text-[9px] mr-0.5" />
                    {policy.affected_groups.length} group{policy.affected_groups.length > 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-foreground-400">
                  <i className="ri-git-branch-line text-[9px] mr-0.5" />
                  {policy.paths.length} path{policy.paths.length > 1 ? 's' : ''}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {selectedPolicy ? (
            <div className="p-5 space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground-900">{selectedPolicy.name}</h3>
                  {typeBadge(selectedPolicy)}
                </div>
                <p className="text-xs text-foreground-500 mt-1">{selectedPolicy.description}</p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Paths & Capabilities</span>
                <div className="mt-2 space-y-1">
                  {selectedPolicy.paths.map((pt, idx) => (
                    <div key={idx} className="px-3 py-2 rounded-md border border-background-200 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-foreground-800">{pt.path}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {pt.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className={`text-[10px] px-1.5 py-0 rounded font-medium ${
                              cap === 'deny' ? 'bg-red-100 text-red-700' :
                              cap === 'sudo' ? 'bg-violet-100 text-violet-700' :
                              cap === 'delete' ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Affected entities</span>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="border border-background-200 rounded-md p-3">
                    <span className="text-[10px] font-medium text-foreground-500">Users</span>
                    <div className="mt-1 space-y-0.5">
                      {selectedPolicy.affected_users.length === 0 ? (
                        <span className="text-xs text-foreground-400">None</span>
                      ) : selectedPolicy.affected_users[0] === '*' ? (
                        <span className="text-xs text-foreground-600">All users</span>
                      ) : (
                        selectedPolicy.affected_users.map((u) => (
                          <div key={u} className="text-xs font-mono text-foreground-700">{u}</div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="border border-background-200 rounded-md p-3">
                    <span className="text-[10px] font-medium text-foreground-500">Groups</span>
                    <div className="mt-1 space-y-0.5">
                      {selectedPolicy.affected_groups.length === 0 ? (
                        <span className="text-xs text-foreground-400">None</span>
                      ) : selectedPolicy.affected_groups[0] === '*' ? (
                        <span className="text-xs text-foreground-600">All groups</span>
                      ) : (
                        selectedPolicy.affected_groups.map((g) => (
                          <div key={g} className="text-xs font-mono text-foreground-700">{g}</div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <button onClick={() => setShowHCL(!showHCL)} className="text-xs text-foreground-500 hover:text-foreground-700 cursor-pointer flex items-center gap-1">
                  <i className="ri-arrow-down-s-line text-sm" />
                  Raw HCL
                </button>
                {showHCL && (
                  <pre className="mt-2 text-[11px] font-mono text-foreground-700 bg-background-100 border border-background-200 rounded-md p-3 whitespace-pre overflow-x-auto">
                    {selectedPolicy.hcl}
                  </pre>
                )}
              </div>

              {!selectedPolicy.is_external && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary">
                    <i className="ri-pencil-line" /> Edit in role editor
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 mb-3 flex items-center justify-center rounded-full bg-background-200">
                <i className="ri-file-code-line text-xl text-foreground-400" />
              </div>
              <p className="text-sm text-foreground-600">Select a policy</p>
              <p className="text-xs text-foreground-400 mt-1">View policy details, HCL, and affected entities</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}