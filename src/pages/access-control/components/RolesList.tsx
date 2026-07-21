import { useState } from 'react';
import type { VaultRole } from '@/mocks/vault-acl';
import { vaultRoles } from '@/mocks/vault-acl';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';

interface RolesListProps {
  onEditRole: (role: VaultRole) => void;
  onCreateRole: () => void;
}

export default function RolesList({ onEditRole, onCreateRole }: RolesListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = vaultRoles.filter((r) =>
    r.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground-900">Roles</h2>
            <span className="text-xs text-foreground-400">{vaultRoles.length} roles</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search roles..."
                className="h-7 pl-6 pr-2.5 text-xs rounded-md border border-background-300 bg-background-50 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 w-48"
              />
            </div>
            <Button size="sm" variant="primary" onClick={onCreateRole}>
              <i className="ri-add-line" /> Create role
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-background-200 sticky top-0 bg-background-50">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Role name</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Groups</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Direct users</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Access summary</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Managed by</th>
              <th className="w-10 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((role) => (
              <tr
                key={role.name}
                onClick={() => !role.is_external && onEditRole(role)}
                className={`border-b border-background-100 transition-colors ${role.is_external ? 'opacity-60' : 'hover:bg-background-100 cursor-pointer'}`}
              >
                <td className="px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-foreground-800">{role.display_name}</span>
                    <span className="text-[10px] font-mono text-foreground-400 ml-2">{role.name}</span>
                  </div>
                  <p className="text-[11px] text-foreground-400 mt-0.5">{role.description}</p>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-600">{role.groups.length || '—'}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-600">{role.direct_users.length || '—'}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-600">{role.access_summary}</span>
                </td>
                <td className="px-4 py-2.5">
                  {role.is_external ? (
                    <Badge variant="warning">External</Badge>
                  ) : (
                    <Badge variant="info">Vault Console</Badge>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  {!role.is_external && (
                    <button onClick={(e) => { e.stopPropagation(); onEditRole(role); }} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 hover:bg-background-200 cursor-pointer">
                      <i className="ri-more-2-fill text-xs" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}