import { useEffect, useState, type ReactNode } from 'react';

import { AuditGatewayProvider } from '@/application/audit/AuditGatewayProvider';
import { useAuditEvents } from '@/application/audit/useAuditEvents';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { AuditFilter, AuditGateway } from '@/domain/audit/audit-events';
import { normalizeVaultError } from '@/domain/vault/errors';
import ActivityFilters from './components/ActivityFilters';
import ActivityTable from './components/ActivityTable';

const FILTER_DELAY_MS = 300;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useDebouncedFilter(filter: AuditFilter): AuditFilter {
  const [applied, setApplied] = useState(filter);
  useEffect(() => {
    const timer = window.setTimeout(() => setApplied(filter), FILTER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [filter]);
  return applied;
}

function Notice({ icon, title, children }: { readonly icon: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-background-300 bg-background-50 p-6 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-background-100 text-foreground-600">
        <i className={`${icon} text-xl`} aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-sm font-semibold text-foreground-900">{title}</h2>
      <div className="mt-2 text-xs leading-5 text-foreground-600">{children}</div>
    </div>
  );
}

function ActivityContent() {
  const [filter, setFilter] = useState<AuditFilter>({});
  const applied = useDebouncedFilter(filter);
  const { status, events } = useAuditEvents(applied);
  const statusError = status.error ? normalizeVaultError(status.error) : undefined;

  if (statusError?.code === 'not-found') {
    return (
      <Notice icon="ri-file-list-3-line" title="The activity log is not set up">
        Run the audit reader from <span className="font-mono">compose.audit.yml</span> and enable a Vault file audit device. See
        the Activity section in USAGE.md.
      </Notice>
    );
  }
  if (statusError?.code === 'authorization') {
    return (
      <Notice icon="ri-shield-keyhole-line" title="You cannot view the activity log">
        Reading it requires <span className="font-mono">read</span> and <span className="font-mono">sudo</span> on{' '}
        <span className="font-mono">sys/audit</span>, the same permission that manages audit devices.
      </Notice>
    );
  }
  if (status.data && !status.data.available) {
    return (
      <Notice icon="ri-file-warning-line" title="No audit log file found">
        Enable a file audit device in Vault, for example{' '}
        <span className="font-mono">vault audit enable file file_path=/vault/audit/audit.log</span>, and mount the same directory
        into the audit reader.
      </Notice>
    );
  }

  const pages = events.data?.pages ?? [];
  const rows = pages.flatMap((page) => page.events);
  const scanned = pages.reduce((total, page) => total + page.scannedBytes, 0);
  return (
    <div className="space-y-4">
      <ActivityFilters filter={filter} onChange={setFilter} />
      {status.data && (
        <p className="text-[11px] text-foreground-500">
          Log size {formatBytes(status.data.sizeBytes)} · searched {formatBytes(scanned)} · newest first
        </p>
      )}
      {events.isPending && <ContentSkeleton label="Loading Vault activity" variant="list" />}
      {events.error && (
        <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
          {normalizeVaultError(events.error).message}
        </p>
      )}
      {!events.isPending && rows.length === 0 && !events.error && (
        <p className="py-10 text-center text-xs text-foreground-500">No requests match these filters.</p>
      )}
      {rows.length > 0 && <ActivityTable events={rows} />}
      {events.hasNextPage && (
        <div className="flex justify-center">
          <Button size="sm" loading={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>
            Load older activity
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage({ gateway }: { readonly gateway?: AuditGateway }) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto bg-background-50">
      <header className="border-b border-background-200 px-4 py-3 sm:px-5">
        <h1 className="text-sm font-semibold text-foreground-900">Activity</h1>
        <p className="mt-0.5 text-xs text-foreground-500">
          Every request Vault recorded in its audit log: console, CLI, and applications. Secret values are never shown.
        </p>
      </header>
      <div className="mx-auto max-w-[1400px] p-4 sm:p-5">
        <AuditGatewayProvider gateway={gateway}>
          <ActivityContent />
        </AuditGatewayProvider>
      </div>
    </main>
  );
}
