import { useState } from 'react';

import type { AccessControlUserRecord } from '@/application/vault/useAccessControlData';
import Button from '@/components/base/Button';

interface UsersListProps {
  readonly users: readonly AccessControlUserRecord[];
  readonly warnings: readonly string[];
  readonly onCreateUser: () => void;
  readonly onViewUser: (user: AccessControlUserRecord) => void;
  readonly onRefresh: () => void;
}

export default function UsersList({ users, warnings, onCreateUser, onViewUser, onRefresh }: UsersListProps) {
  const [search, setSearch] = useState('');
  const filtered = users.filter((user) => [user.username, user.displayName, user.mount]
    .some((value) => value.toLowerCase().includes(search.toLowerCase())));

  return (
    <section aria-labelledby="users-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-background-200 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">Userpass + Identity</p><div className="flex items-center gap-2"><h1 id="users-heading" className="text-sm font-semibold text-foreground-900">Users</h1><span className="text-xs text-foreground-400">{users.length}</span></div></div>
          <div className="flex items-center gap-2">
            <label className="relative"><span className="sr-only">Search users</span><i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="h-7 w-48 rounded-md border border-background-300 bg-background-50 pl-6 pr-2.5 text-xs focus:outline-none focus:border-primary-400" /></label>
            <button type="button" aria-label="Refresh users" onClick={onRefresh} className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700"><i className="ri-refresh-line" aria-hidden="true" /></button>
            <Button size="sm" variant="primary" onClick={onCreateUser}><i className="ri-user-add-line" aria-hidden="true" /> Create user</Button>
          </div>
        </div>
        {warnings.length > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">Some auth mounts or aliases could not be read. The list may be partial.</div>}
      </header>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-background-200"><i className="ri-user-search-line text-xl text-foreground-400" aria-hidden="true" /></div><p className="text-sm font-medium text-foreground-700">{users.length ? 'No users match this search' : 'No userpass accounts found'}</p><p className="mt-1 text-xs text-foreground-400">Accounts are discovered across every readable userpass mount.</p></div>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="sticky top-0 bg-background-50"><tr className="border-b border-background-200"><th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">Username</th><th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">Identity entity</th><th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">Auth mount</th><th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">Groups</th><th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">Direct policies</th></tr></thead>
            <tbody>{filtered.map((user) => (
              <tr key={user.id} tabIndex={0} onClick={() => onViewUser(user)} onKeyDown={(event) => { if (event.key === 'Enter') onViewUser(user); }} className="cursor-pointer border-b border-background-100 hover:bg-background-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-300">
                <td className="px-4 py-2.5"><span className="font-mono text-sm text-foreground-800">{user.username}</span></td>
                <td className="px-4 py-2.5"><span className="text-sm text-foreground-700">{user.entity ? user.displayName : 'No entity alias'}</span></td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground-500">{user.mount}/</td>
                <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{user.groups.length ? user.groups.map((group) => <span key={group.id} className="rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] font-medium text-secondary-700">{group.name}</span>) : <span className="text-xs text-foreground-400">—</span>}</div></td>
                <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{[...user.directRolePolicyNames, ...user.directPolicyNames, ...user.externalPolicyNames].length ? [...user.directRolePolicyNames, ...user.directPolicyNames, ...user.externalPolicyNames].map((policy) => <span key={policy} className="rounded bg-primary-100 px-1.5 py-0.5 font-mono text-[10px] text-primary-700">{policy}</span>) : <span className="text-xs text-foreground-400">default only</span>}</div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}
