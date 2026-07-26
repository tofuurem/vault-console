import {
  useEffect,
  useRef,
} from 'react';

import Button from '@/components/base/Button';
import { assessIdentityOwnership } from '@/domain/access-control/resource-ownership';
import type { VaultIdentityGroup } from '@/domain/vault/contracts';

interface GroupsListProps {
  readonly groups: readonly VaultIdentityGroup[];
  readonly onCreate: () => void;
  readonly onView: (groupId: string) => void;
  readonly onRefresh: () => void;
  readonly restoreFocusGroupId?: string;
  readonly onFocusRestored?: () => void;
}

function groupState(group: VaultIdentityGroup): {
  readonly label: string;
  readonly classes: string;
} {
  if ((group.type ?? 'internal') === 'external') {
    return {
      label: 'External',
      classes: 'bg-warning-100 text-warning-800',
    };
  }
  if (assessIdentityOwnership(group.metadata) === 'managed') {
    return {
      label: 'Managed',
      classes: 'bg-success-100 text-success-800',
    };
  }
  return {
    label: 'Read-only',
    classes: 'bg-background-200 text-foreground-600',
  };
}

export default function GroupsList({
  groups,
  onCreate,
  onView,
  onRefresh,
  restoreFocusGroupId,
  onFocusRestored,
}: GroupsListProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!restoreFocusGroupId) return;
    const button = buttons.current.get(restoreFocusGroupId);
    if (!button) return;
    button.focus();
    onFocusRestored?.();
  }, [groups, onFocusRestored, restoreFocusGroupId]);

  return (
    <section aria-labelledby="groups-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-background-200 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
              Vault Identity
            </p>
            <div className="flex items-center gap-2">
              <h1 id="groups-heading" className="text-sm font-semibold text-foreground-900">
                Internal groups
              </h1>
              <span className="text-xs text-foreground-400">{groups.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={onRefresh} aria-label="Refresh groups">
              <i className="ri-refresh-line" aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" variant="primary" onClick={onCreate}>
              <i className="ri-group-2-line" aria-hidden="true" /> Create group
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background-200 text-foreground-400">
              <i className="ri-node-tree text-xl" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground-700">
              No readable Identity groups
            </p>
            <p className="mt-1 text-xs text-foreground-400">
              Create a managed internal group or check the current token capabilities.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead className="sticky top-0 bg-background-50">
              <tr className="border-b border-background-200">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Group
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  State
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Direct members
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Nested groups
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Policies
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const state = groupState(group);
                return (
                  <tr
                    key={group.id}
                    className="border-b border-background-100 hover:bg-background-100 focus-within:bg-background-100"
                  >
                    <td className="px-4 py-1.5">
                      <button
                        ref={(node) => {
                          if (node) buttons.current.set(group.id, node);
                          else buttons.current.delete(group.id);
                        }}
                        type="button"
                        aria-label={`Open group ${group.name}`}
                        onClick={() => onView(group.id)}
                        className="min-h-11 w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-8"
                      >
                        <span className="block text-sm font-semibold text-foreground-800">
                          {group.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[9px] text-foreground-400">
                          {group.id}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${state.classes}`}>
                        {state.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground-600">
                      {group.memberEntityIds.length}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground-600">
                      {group.memberGroupIds.length}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground-600">
                      {group.policies.length}
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
