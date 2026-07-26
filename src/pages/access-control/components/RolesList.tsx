import {
  useEffect,
  useRef,
} from 'react';

import type { AccessPolicyRecord } from '@/application/vault/useAccessControlData';
import Button from '@/components/base/Button';
import { managedRoleName } from '@/domain/access-control/managed-resources';

interface RolesListProps {
  readonly roles: readonly AccessPolicyRecord[];
  readonly onCreate: () => void;
  readonly onView: (policyName: string) => void;
  readonly onRefresh: () => void;
  readonly restoreFocusRoleName?: string;
  readonly onFocusRestored?: () => void;
}

function ownershipBadge(role: AccessPolicyRecord): {
  readonly label: string;
  readonly classes: string;
} {
  if (!role.readable) {
    return {
      label: 'Unreadable',
      classes: 'bg-danger-100 text-danger-800',
    };
  }
  if (role.ownership === 'managed') {
    return {
      label: 'Managed',
      classes: 'bg-success-100 text-success-800',
    };
  }
  return {
    label: 'Unverified',
    classes: 'bg-warning-100 text-warning-800',
  };
}

export default function RolesList({
  roles,
  onCreate,
  onView,
  onRefresh,
  restoreFocusRoleName,
  onFocusRestored,
}: RolesListProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!restoreFocusRoleName) return;
    const button = buttons.current.get(restoreFocusRoleName);
    if (!button) return;
    button.focus();
    onFocusRestored?.();
  }, [onFocusRestored, restoreFocusRoleName, roles]);

  return (
    <section aria-labelledby="roles-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-background-200 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
              Reserved ACL policies
            </p>
            <div className="flex items-center gap-2">
              <h1 id="roles-heading" className="text-sm font-semibold text-foreground-900">
                Roles
              </h1>
              <span className="text-xs text-foreground-400">{roles.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={onRefresh} aria-label="Refresh roles">
              <i className="ri-refresh-line" aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" variant="primary" onClick={onCreate}>
              <i className="ri-shield-keyhole-line" aria-hidden="true" /> Create role
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {roles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background-200 text-foreground-400">
              <i className="ri-shield-keyhole-line text-xl" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground-700">No role policies</p>
            <p className="mt-1 text-xs text-foreground-400">
              Roles use an immutable <span className="font-mono">vc-role-*</span> policy name.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="sticky top-0 bg-background-50">
              <tr className="border-b border-background-200">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Role
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Ownership
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Visual rules
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const badge = ownershipBadge(role);
                return (
                  <tr
                    key={role.name}
                    className="border-b border-background-100 hover:bg-background-100 focus-within:bg-background-100"
                  >
                    <td className="px-4 py-1.5">
                      <button
                        ref={(node) => {
                          if (node) buttons.current.set(role.name, node);
                          else buttons.current.delete(role.name);
                        }}
                        type="button"
                        aria-label={`Open role ${role.name}`}
                        onClick={() => onView(role.name)}
                        className="min-h-11 w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-8"
                      >
                        <span className="block text-sm font-semibold text-foreground-800">
                          {managedRoleName(role.name)}
                        </span>
                        <span className="mt-0.5 block font-mono text-[9px] text-foreground-400">
                          {role.name}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground-600">
                      {role.rules?.length ?? '—'}
                    </td>
                    <td className="max-w-[360px] truncate px-4 py-2.5 text-xs text-foreground-500">
                      {role.ownershipHeader?.kind === 'role'
                        ? role.ownershipHeader.description || 'No description'
                        : 'Ownership header required'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
