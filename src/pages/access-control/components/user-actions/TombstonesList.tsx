import type { IdentityTombstoneRecord } from '@/application/vault/useAccessControlData';
import Button from '@/components/base/Button';

interface TombstonesListProps {
  readonly tombstones: readonly IdentityTombstoneRecord[];
  readonly onView: (entityId: string) => void;
  readonly onBack: () => void;
  readonly onRefresh: () => void;
}

export default function TombstonesList({
  tombstones,
  onView,
  onBack,
  onRefresh,
}: TombstonesListProps) {
  return (
    <section aria-labelledby="removed-identities-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-background-200 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" onClick={onBack}>
              <i className="ri-arrow-left-line" aria-hidden="true" /> Users
            </Button>
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-danger-600">
                Advanced lifecycle
              </p>
              <div className="flex items-center gap-2">
                <h1 id="removed-identities-heading" className="text-sm font-semibold text-foreground-900">
                  Removed identities
                </h1>
                <span className="text-xs text-foreground-400">{tombstones.length}</span>
              </div>
            </div>
          </div>
          <Button type="button" size="sm" onClick={onRefresh}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </Button>
        </div>
        <div className="mt-3 rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-[10px] leading-4 text-warning-900">
          These disabled Identity tombstones are retained intentionally. They block
          identity-associated tokens after login removal; they are not proof that tokens were
          revoked.
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {tombstones.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success-100 text-success-700">
              <i className="ri-shield-check-line text-xl" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground-700">
              No removed Identity tombstones
            </p>
            <p className="mt-1 max-w-md text-xs leading-5 text-foreground-400">
              This view lists only disabled Vault Console-managed entities whose userpass login
              was removed.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[680px]">
            <thead className="sticky top-0 bg-background-50">
              <tr className="border-b border-background-200">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Username
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Identity
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  Removed auth mount
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-foreground-500">
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {tombstones.map((record) => (
                <tr key={record.id} className="border-b border-background-100 hover:bg-background-100">
                  <td className="px-4 py-1.5">
                    <button
                      type="button"
                      aria-label={`Open removed identity ${record.username}`}
                      onClick={() => onView(record.id)}
                      className="min-h-11 w-full rounded-sm text-left font-mono text-sm text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-8"
                    >
                      {record.username}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground-700">{record.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground-500">
                    auth/{record.mount}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-warning-100 px-2 py-1 text-[9px] font-semibold text-warning-800">
                      Disabled tombstone
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
