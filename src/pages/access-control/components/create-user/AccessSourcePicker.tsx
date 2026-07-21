import { useMemo, useState } from 'react';

import type { AccessGroup, AccessRole } from '@/domain/access-control/effective-access';

interface AccessSourcePickerProps {
  readonly groups: readonly AccessGroup[];
  readonly roles: readonly AccessRole[];
  readonly selectedGroupIds: readonly string[];
  readonly directRoleIds: readonly string[];
  readonly inheritedRoleIds: readonly string[];
  readonly onToggleGroup: (groupId: string) => void;
  readonly onToggleRole: (roleId: string) => void;
}

export default function AccessSourcePicker({
  groups,
  roles,
  selectedGroupIds,
  directRoleIds,
  inheritedRoleIds,
  onToggleGroup,
  onToggleRole,
}: AccessSourcePickerProps) {
  const [search, setSearch] = useState('');
  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section aria-labelledby="access-sources-heading" className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <div className="border-b border-background-200 px-3.5 py-3">
        <h3 id="access-sources-heading" className="text-xs font-semibold text-foreground-800">Access sources</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-foreground-400">Start with groups. Add a direct role only for exceptions.</p>
      </div>

      <div className="p-3">
        <label htmlFor="group-search" className="sr-only">Search groups</label>
        <div className="relative">
          <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground-400" aria-hidden="true" />
          <input
            id="group-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search groups"
            className="h-8 w-full rounded-md border border-background-300 bg-background-50 pl-8 pr-2.5 text-xs outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
          />
        </div>

        <div className="mt-3 space-y-1" role="group" aria-label="Internal groups">
          {filteredGroups.map((group) => {
            const checked = selectedGroupIds.includes(group.id);
            return (
              <label
                key={group.id}
                className={`block cursor-pointer rounded-md border px-2.5 py-2 transition ${
                  checked
                    ? 'border-primary-200 bg-primary-50/70'
                    : 'border-transparent hover:border-background-200 hover:bg-background-100'
                }`}
              >
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleGroup(group.id)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-background-400 text-primary-500 focus:ring-primary-400"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground-800">{group.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {group.roleIds.map((roleId) => (
                        <span key={roleId} className="rounded bg-background-200 px-1.5 py-0.5 text-[9px] text-foreground-500">
                          {rolesById.get(roleId)?.name ?? roleId}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
          {filteredGroups.length === 0 && <p className="py-4 text-center text-[11px] text-foreground-400">No groups found</p>}
        </div>
      </div>

      <details className="border-t border-background-200">
        <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[11px] font-medium text-foreground-600 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400">
          Advanced · Direct roles
          {directRoleIds.length > 0 && <span className="ml-1.5 rounded bg-primary-100 px-1.5 text-[10px] text-primary-700">{directRoleIds.length}</span>}
        </summary>
        <div className="space-y-1 px-3 pb-3" role="group" aria-label="Direct roles">
          {roles.map((role) => {
            const inherited = inheritedRoleIds.includes(role.id);
            return (
              <label key={role.id} className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${inherited ? 'cursor-not-allowed bg-background-100' : 'cursor-pointer hover:bg-background-100'}`}>
                <input
                  type="checkbox"
                  checked={inherited || directRoleIds.includes(role.id)}
                  disabled={inherited}
                  onChange={() => onToggleRole(role.id)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-background-400 text-primary-500 focus:ring-primary-400"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground-700">{role.name}</span>
                  <span className="block truncate font-mono text-[9px] text-foreground-400">{role.policyNames.join(', ')}</span>
                </span>
                {inherited && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">Via group</span>}
              </label>
            );
          })}
        </div>
      </details>
    </section>
  );
}
