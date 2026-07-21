import { useState, type MouseEvent } from 'react';
import type { VaultUserAccess } from '@/mocks/vault-acl';
import { vaultUsers } from '@/mocks/vault-acl';
import type { VaultConnection } from '@/mocks/vault';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import Tooltip from '@/components/base/Tooltip';

interface UsersListProps {
  onCreateUser: () => void;
  onViewUser: (user: VaultUserAccess) => void;
  connection: VaultConnection;
}

function permissionSummary(user: VaultUserAccess): string {
  const sources: string[] = [];
  if (user.groups.length > 0) sources.push(`${user.groups.length} group${user.groups.length > 1 ? 's' : ''}`);
  if (user.direct_roles.length > 0) sources.push(`${user.direct_roles.length} role${user.direct_roles.length > 1 ? 's' : ''}`);
  if (user.direct_access.length > 0) sources.push('direct access');
  return sources.length > 0 ? sources.join(', ') : 'No access';
}

export default function UsersList({ onCreateUser, onViewUser, connection }: UsersListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; user: VaultUserAccess } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VaultUserAccess | null>(null);

  const filteredUsers = vaultUsers.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleContextMenu = (e: MouseEvent, user: VaultUserAccess) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, user });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground-900">Users</h2>
            <span className="text-xs text-foreground-400">{vaultUsers.length} users</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="h-7 pl-6 pr-2.5 text-xs rounded-md border border-background-300 bg-background-50 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 w-48"
              />
            </div>
            <Button size="sm" variant="primary" onClick={onCreateUser}>
              <i className="ri-user-add-line" />
              Create user
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-background-200 sticky top-0 bg-background-50">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Username</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Display name</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Auth Mount</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Groups</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Roles</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-foreground-500">Access</th>
              <th className="w-10 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr
                key={user.username}
                onClick={() => onViewUser(user)}
                onContextMenu={(e) => handleContextMenu(e, user)}
                className="border-b border-background-100 hover:bg-background-100 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span className="text-sm font-mono text-foreground-800">{user.username}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-sm text-foreground-700">{user.display_name}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs font-mono text-foreground-500">{user.auth_mount}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    {user.groups.length === 0 ? (
                      <span className="text-xs text-foreground-400">—</span>
                    ) : (
                      user.groups.map((g) => (
                        <span key={g} className="text-[11px] px-1.5 py-0 rounded bg-secondary-100 text-secondary-700 font-medium">{g}</span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    {user.direct_roles.length === 0 ? (
                      <span className="text-xs text-foreground-400">—</span>
                    ) : (
                      user.direct_roles.map((r) => (
                        <span key={r} className="text-[11px] px-1.5 py-0 rounded bg-primary-100 text-primary-700 font-medium">{r.replace('vc-role-', '')}</span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground-600">{permissionSummary(user)}</span>
                </td>
                <td className="px-2 py-2.5">
                  <Tooltip content="More actions">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleContextMenu(e, user); }}
                      className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 hover:bg-background-200 cursor-pointer"
                    >
                      <i className="ri-more-2-fill text-xs" />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-10 h-10 mb-2 flex items-center justify-center rounded-full bg-background-200">
              <i className="ri-user-search-line text-lg text-foreground-400" />
            </div>
            <p className="text-sm text-foreground-600">No users match your search</p>
          </div>
        )}
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 w-44 rounded-md border border-background-300 bg-background-50 py-1 shadow-sm"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: contextMenu.y }}
          >
            <button onClick={() => { onViewUser(contextMenu.user); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2">
              <i className="ri-user-line text-sm" /> Open profile
            </button>
            <button onClick={() => { navigator.clipboard.writeText(contextMenu.user.username); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2">
              <i className="ri-file-copy-line text-sm" /> Copy username
            </button>
            <div className="border-t border-background-200 my-1" />
            <button onClick={() => { setConfirmDelete(contextMenu.user); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 cursor-pointer flex items-center gap-2">
              <i className="ri-delete-bin-line text-sm" /> Delete account
            </button>
          </div>
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-[420px] bg-background-50 rounded-lg border border-background-300 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-foreground-900">Delete user account</h3>
            <p className="text-xs text-foreground-600 mt-2">
              This will remove the userpass account <span className="font-mono font-medium">{confirmDelete.username}</span>, its identity entity, and any associated policies. This action cannot be undone.
            </p>
            <p className="text-xs text-foreground-500 mt-2">
              Type <span className="font-mono font-medium">{confirmDelete.username}</span> to confirm:
            </p>
            <input
              type="text"
              placeholder={confirmDelete.username}
              className="w-full h-8 mt-2 px-2.5 text-sm font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-red-400"
              onChange={(e) => {
                if (e.target.value === confirmDelete.username) {
                  setConfirmDelete(null);
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button size="sm" variant="danger">Delete account</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
