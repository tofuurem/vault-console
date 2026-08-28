import { useEffect, useState } from 'react';

import type { BulkDeleteKeysPreflight } from '@/application/vault/bulk/bulk-delete-keys';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import { summarizeBulkOutcomes, type BulkItemOutcome } from '@/domain/vault/bulk-operation';

interface BulkPermanentDeleteDialogProps {
  readonly open: boolean;
  readonly mount: string;
  readonly requestedCount: number;
  readonly preflight?: BulkDeleteKeysPreflight;
  readonly outcomes?: readonly BulkItemOutcome[];
  readonly error?: string;
  readonly preparing: boolean;
  readonly submitting: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onConfirm: () => void;
}

export default function BulkPermanentDeleteDialog({
  open,
  mount,
  requestedCount,
  preflight,
  outcomes,
  error,
  preparing,
  submitting,
  onClose,
  onRetry,
  onConfirm,
}: BulkPermanentDeleteDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState('');
  const eligibleCount = preflight?.eligible.length ?? 0;
  const confirmation = `DELETE ${eligibleCount} KEYS`;
  useEffect(() => setTypedPhrase(''), [open, preflight]);

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title="Delete selected keys permanently" width="lg">
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-100">
            <i className="ri-delete-bin-7-line text-sm text-danger-700" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-danger-700">Every version, custom metadata, and history will be removed.</p>
            <p className="mt-1 font-mono text-xs text-foreground-500">{mount}/ · {requestedCount} selected keys</p>
          </div>
        </div>
        {preparing && <PermanentDeleteLoading />}
        {error && <PermanentDeleteError error={error} onRetry={onRetry} />}
        {preflight && !outcomes && (
          <PermanentDeleteReview
            preflight={preflight}
            confirmation={confirmation}
            typedPhrase={typedPhrase}
            onTypedPhraseChange={setTypedPhrase}
          />
        )}
        {outcomes && <PermanentDeleteResults outcomes={outcomes} />}
        <PermanentDeleteActions
          outcomes={outcomes}
          preflight={preflight}
          eligibleCount={eligibleCount}
          confirmed={typedPhrase.trim() === confirmation}
          submitting={submitting}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      </div>
    </Modal>
  );
}

function PermanentDeleteLoading() {
  return (
    <div aria-label="Checking permanent delete permissions" className="space-y-2">
      <div className="h-10 animate-pulse rounded-md bg-background-100" />
      <div className="h-10 animate-pulse rounded-md bg-background-100" />
      <p className="text-xs text-foreground-500">Checking exact metadata delete capabilities…</p>
    </div>
  );
}

function PermanentDeleteError({ error, onRetry }: { readonly error: string; readonly onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
      <p className="font-semibold">Preflight could not be completed</p>
      <p className="mt-1">{error}</p>
      <button type="button" onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">Retry preflight</button>
    </div>
  );
}

function PermanentDeleteReview({
  preflight,
  confirmation,
  typedPhrase,
  onTypedPhraseChange,
}: {
  readonly preflight: BulkDeleteKeysPreflight;
  readonly confirmation: string;
  readonly typedPhrase: string;
  readonly onTypedPhraseChange: (value: string) => void;
}) {
  const excluded = summarizeBulkOutcomes(preflight.excluded);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Summary label="Ready" value={preflight.eligible.length} tone="danger" />
        <Summary label="Excluded" value={preflight.excluded.length} tone="neutral" />
      </div>
      <ul className="max-h-52 divide-y divide-background-200 overflow-y-auto rounded-md border border-background-200">
        {preflight.eligible.map(({ path }) => (
          <li key={path} className="px-3 py-2 font-mono text-xs text-foreground-800">{path}</li>
        ))}
      </ul>
      {preflight.excluded.length > 0 && (
        <p className="text-[11px] text-warning-800">
          Excluded: {excluded.denied} denied, {excluded.missing} missing, {excluded.failed} failed.
        </p>
      )}
      <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-[11px] leading-5 text-danger-700">
        This action is irreversible. Review every path and type the exact phrase below.
      </div>
      <Input
        label={`Type ${confirmation} to confirm`}
        value={typedPhrase}
        onChange={(event) => onTypedPhraseChange(event.target.value)}
        placeholder={confirmation}
        monospace
        autoComplete="off"
      />
    </>
  );
}

function PermanentDeleteResults({ outcomes }: { readonly outcomes: readonly BulkItemOutcome[] }) {
  const summary = summarizeBulkOutcomes(outcomes);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Summary label="Deleted" value={summary.succeeded} tone="success" />
        <Summary label="Denied" value={summary.denied} tone="neutral" />
        <Summary label="Missing" value={summary.missing} tone="neutral" />
        <Summary label="Failed" value={summary.failed} tone="danger" />
      </div>
      <ul className="max-h-64 divide-y divide-background-200 overflow-y-auto rounded-md border border-background-200">
        {outcomes.map((outcome) => (
          <li key={outcome.path} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono text-foreground-800">{outcome.path}</span>
            <span className="font-semibold text-foreground-600">{outcome.status}</span>
            {outcome.message && <span className="w-full text-[10px] text-danger-700">{outcome.message}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function PermanentDeleteActions({
  outcomes,
  preflight,
  eligibleCount,
  confirmed,
  submitting,
  onClose,
  onConfirm,
}: {
  readonly outcomes?: readonly BulkItemOutcome[];
  readonly preflight?: BulkDeleteKeysPreflight;
  readonly eligibleCount: number;
  readonly confirmed: boolean;
  readonly submitting: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  if (outcomes) {
    return <div className="flex justify-end"><Button size="sm" onClick={onClose}>Close results</Button></div>;
  }
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
      <Button
        size="sm"
        variant="danger"
        loading={submitting}
        disabled={!preflight || eligibleCount === 0 || !confirmed}
        onClick={onConfirm}
      >
        Delete {eligibleCount} keys permanently
      </Button>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: 'success' | 'danger' | 'neutral';
}) {
  const classes = {
    success: 'border-success-200 bg-success-50 text-success-700',
    danger: 'border-danger-200 bg-danger-50 text-danger-700',
    neutral: 'border-background-200 bg-background-100 text-foreground-700',
  };
  return (
    <div className={`rounded-md border px-2.5 py-2 ${classes[tone]}`}>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wide">{label}</p>
    </div>
  );
}
