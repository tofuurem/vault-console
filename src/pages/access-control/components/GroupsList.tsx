import { useState } from 'react';
import type { VaultGroup } from '@/mocks/vault-acl';
import { vaultGroups, vaultRoles } from '@/mocks/vault-acl';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';

interface GroupsListProps {
  onViewGroup: (group: VaultGroup) => void;
}

export default function GroupsList({ onViewGroup }: GroupsListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = vaultGroups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground-900">Internal Groups</h2>
            <span className="text-xs text-foreground-400">{vaultGroups.length} groups</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search groups..."
                className="h-7 pl-6 pr-2.5 text-xs rounded-md border border-background-300 bg-background-50 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 w-48"
              />
            </div>
            <Button size="sm" variant="primary">
              <i className="ri-add-line" /> Create group
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-background-200 sticky top-0 bg-background-50">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Group name</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Members</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Roles</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Nested groups</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Access summary</th>
              <th className="w-10 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((group) => (
              <tr
                key={group.name}
                onClick={() => onViewGroup(group)}
                className="border-b border-background-100 hover:bg-background-100 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span className="text-sm font-medium text-foreground-800">{group.name}</span>
                  <p className="text-[11px] text-foreground-400 mt-0.5">{group.description}</p>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-600">{group.member_count}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    {group.roles.map((r) => (
                      <span key={r} className="text-[11px] px-1.5 py-0 rounded bg-primary-100 text-primary-700 font-medium">
                        {vaultRoles.find((x) => x.name === r)?.display_name || r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-400">{group.child_groups.length || '—'}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-600">
                    {group.roles.length} role{group.roles.length !== 1 ? 's' : ''}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <button onClick={(e) => { e.stopPropagation(); onViewGroup(group); }} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 hover:bg-background-200 cursor-pointer">
                    <i className="ri-more-2-fill text-xs" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}