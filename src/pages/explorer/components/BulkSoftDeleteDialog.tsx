import type { BulkSoftDeletePreflight } from '@/application/vault/bulk/bulk-soft-delete';
import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import { summarizeBulkOutcomes } from '@/domain/vault/bulk-operation';

interface BulkSoftDeleteDialogProps {
  readonly open: boolean;
  readonly mount: string;
  readonly requestedCount: number;
  readonly preflight?: BulkSoftDeletePreflight;
  readonly error?: string;
  readonly preparing: boolean;
  readonly submitting: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onConfirm: () => void;
}

const MAX_PREVIEW_ITEMS = 8;

export default function BulkSoftDeleteDialog({
  open,
  mount,
  requestedCount,
  preflight,
  error,
  preparing,
  submitting,
  onClose,
  onRetry,
  onConfirm,
}: BulkSoftDeleteDialogProps) {
  const excluded = preflight
    ? summarizeBulkOutcomes(preflight.excluded)
    : undefined;
  const undoableCount = preflight?.eligible.filter(
    (candidate) => candidate.canUndo,
  ).length ?? 0;
  const omittedEligible = Math.max(
    0,
    (preflight?.eligible.length ?? 0) - MAX_PREVIEW_ITEMS,
  );
  const omittedExcluded = Math.max(
    0,
    (preflight?.excluded.length ?? 0) - MAX_PREVIEW_ITEMS,
  );

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Soft-delete current versions"
      width="lg"
    >
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100">
            <i className="ri-delete-bin-line text-sm text-warning-700" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm leading-5 text-foreground-700">
              Vault Console verifies each current version before changing it.
            </p>
            <p className="mt-1 font-mono text-xs text-foreground-500">
              {mount}/ · {requestedCount} selected secrets
            </p>
          </div>
        </div>

        {preparing && (
          <div aria-label="Checking selected secrets" className="space-y-2">
            <div className="h-9 animate-pulse rounded-md bg-background-100" />
            <div className="h-9 animate-pulse rounded-md bg-background-100" />
            <p className="text-xs text-foreground-500">
              Checking exact capabilities and current metadata…
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
            <p className="font-semibold">Preflight could not be completed</p>
            <p className="mt-1 leading-5">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Retry preflight
            </button>
          </div>
        )}

        {preflight && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Summary label="Ready" value={preflight.eligible.length} tone="success" />
              <Summary label="Undo ready" value={undoableCount} tone="neutral" />
              <Summary label="Denied" value={excluded?.denied ?? 0} tone="warning" />
              <Summary
                label="Unavailable"
                value={(excluded?.missing ?? 0) + (excluded?.failed ?? 0)}
                tone="neutral"
              />
            </div>

            {preflight.eligible.length > 0 && (
              <section aria-labelledby="bulk-soft-delete-ready">
                <h3 id="bulk-soft-delete-ready" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-500">
                  Current versions to soft-delete
                </h3>
                <ul className="mt-1 max-h-44 divide-y divide-background-200 overflow-y-auto rounded-md border border-background-200">
                  {preflight.eligible.slice(0, MAX_PREVIEW_ITEMS).map((candidate) => (
                    <li key={candidate.path} className="flex min-h-10 items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground-800">
                        {candidate.path}
                      </span>
                      <span className="text-[10px] text-foreground-500">v{candidate.version}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                        candidate.canUndo
                          ? 'bg-success-100 text-success-700'
                          : 'bg-warning-100 text-warning-800'
                      }`}>
                        {candidate.canUndo ? 'Undo available' : 'No Undo permission'}
                      </span>
                    </li>
                  ))}
                  {omittedEligible > 0 && (
                    <li className="px-3 py-2 text-[10px] text-foreground-500">
                      +{omittedEligible} more ready secrets
                    </li>
                  )}
                </ul>
              </section>
            )}

            {preflight.excluded.length > 0 && (
              <section aria-labelledby="bulk-soft-delete-excluded">
                <h3 id="bulk-soft-delete-excluded" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-500">
                  Excluded from this operation
                </h3>
                <ul className="mt-1 max-h-36 divide-y divide-background-200 overflow-y-auto rounded-md border border-background-200 bg-background-100/40">
                  {preflight.excluded.slice(0, MAX_PREVIEW_ITEMS).map((outcome) => (
                    <li key={outcome.path} className="flex min-h-9 items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground-700">
                        {outcome.path}
                      </span>
                      <span className="text-[10px] font-semibold uppercase text-foreground-500">
                        {outcome.status}
                      </span>
                    </li>
                  ))}
                  {omittedExcluded > 0 && (
                    <li className="px-3 py-2 text-[10px] text-foreground-500">
                      +{omittedExcluded} more excluded secrets
                    </li>
                  )}
                </ul>
              </section>
            )}

            <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] leading-5 text-warning-800">
              This is reversible only for rows marked Undo available. Each
              request targets the current version shown above.
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={submitting}
            disabled={!preflight || preflight.eligible.length === 0}
            onClick={onConfirm}
          >
            Soft-delete {preflight?.eligible.length ?? 0} current versions
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: 'success' | 'warning' | 'neutral';
}) {
  const toneClasses = {
    success: 'border-success-200 bg-success-50 text-success-700',
    warning: 'border-warning-200 bg-warning-50 text-warning-800',
    neutral: 'border-background-200 bg-background-100 text-foreground-700',
  };
  return (
    <div className={`rounded-md border px-2.5 py-2 ${toneClasses[tone]}`}>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wide">{label}</p>
    </div>
  );
}
