import { useEffect, useMemo, useState } from 'react';

import type {
  BulkDestroyPreflight,
  BulkDestroyTarget,
} from '@/application/vault/bulk/bulk-destroy';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import { summarizeBulkOutcomes } from '@/domain/vault/bulk-operation';

interface BulkDestroyDialogProps {
  readonly open: boolean;
  readonly mount: string;
  readonly requestedCount: number;
  readonly preflight?: BulkDestroyPreflight;
  readonly error?: string;
  readonly preparing: boolean;
  readonly submitting: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onConfirm: (targets: readonly BulkDestroyTarget[]) => void;
}

export default function BulkDestroyDialog({
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
}: BulkDestroyDialogProps) {
  const [selected, setSelected] = useState<Readonly<Record<string, readonly number[]>>>({});
  const [typedMount, setTypedMount] = useState('');

  useEffect(() => {
    setSelected({});
    setTypedMount('');
  }, [open, preflight]);

  const targets = useMemo<readonly BulkDestroyTarget[]>(() => (
    Object.entries(selected).flatMap(([path, versions]) => (
      versions.length > 0 ? [{ path, versions }] : []
    ))
  ), [selected]);
  const selectedVersionCount = targets.reduce(
    (count, target) => count + target.versions.length,
    0,
  );
  const excluded = preflight
    ? summarizeBulkOutcomes(preflight.excluded)
    : undefined;

  const setPathVersions = (path: string, versions: readonly number[]) => {
    setSelected((current) => ({ ...current, [path]: versions }));
  };
  const toggleVersion = (path: string, version: number) => {
    const current = selected[path] ?? [];
    setPathVersions(
      path,
      current.includes(version)
        ? current.filter((candidate) => candidate !== version)
        : [...current, version],
    );
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Permanently destroy versions"
      width="lg"
    >
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-100">
            <i className="ri-close-circle-line text-sm text-danger-700" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-danger-700">
              Destroyed secret data cannot be recovered.
            </p>
            <p className="mt-1 font-mono text-xs text-foreground-500">
              {mount}/ · {requestedCount} selected secrets
            </p>
          </div>
        </div>

        {preparing && (
          <div aria-label="Checking destroy permissions" className="space-y-2">
            <div className="h-12 animate-pulse rounded-md bg-background-100" />
            <div className="h-12 animate-pulse rounded-md bg-background-100" />
            <p className="text-xs text-foreground-500">
              Loading exact version histories and destroy capabilities…
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
            <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
              <span className="rounded bg-background-100 px-2 py-1 text-foreground-700">
                {preflight.eligible.length} paths available
              </span>
              <span className="rounded bg-danger-100 px-2 py-1 text-danger-700">
                {selectedVersionCount} versions selected
              </span>
              {preflight.excluded.length > 0 && (
                <span className="rounded bg-warning-100 px-2 py-1 text-warning-800">
                  {excluded?.denied ?? 0} denied · {excluded?.missing ?? 0} missing · {excluded?.failed ?? 0} failed
                </span>
              )}
            </div>

            {preflight.eligible.length > 0 ? (
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {preflight.eligible.map((candidate) => {
                  const selectedVersions = selected[candidate.path] ?? [];
                  const allSelected = selectedVersions.length
                    === candidate.versions.length;
                  return (
                    <fieldset
                      key={candidate.path}
                      className="rounded-md border border-background-200"
                    >
                      <legend className="sr-only">
                        Versions for {candidate.path}
                      </legend>
                      <div className="flex min-h-10 items-center gap-2 border-b border-background-200 bg-background-100/60 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground-800">
                          {candidate.path}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPathVersions(
                            candidate.path,
                            allSelected
                              ? []
                              : candidate.versions.map((version) => version.version),
                          )}
                          className="min-h-8 rounded-md px-2 text-[10px] font-semibold text-primary-700 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          {allSelected ? 'Clear versions' : 'Select all versions'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2">
                        {candidate.versions.map((version) => {
                          const checked = selectedVersions.includes(version.version);
                          return (
                            <label
                              key={version.version}
                              className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-background-100 px-3 py-2 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleVersion(
                                  candidate.path,
                                  version.version,
                                )}
                                aria-label={`Destroy ${candidate.path} version ${version.version}`}
                                className="h-4 w-4 accent-danger-600"
                              />
                              <span className="font-mono text-xs font-semibold text-foreground-800">
                                v{version.version}
                              </span>
                              {version.deletionTime && (
                                <span className="rounded bg-warning-100 px-1.5 py-0.5 text-[9px] font-semibold text-warning-800">
                                  soft-deleted
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-background-200 bg-background-100 p-4 text-center text-xs text-foreground-600">
                No versions are available to destroy with this token.
              </div>
            )}

            {preflight.excluded.length > 0 && (
              <details className="rounded-md border border-background-200 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-semibold text-foreground-700">
                  Show {preflight.excluded.length} excluded paths
                </summary>
                <ul className="mt-2 space-y-1">
                  {preflight.excluded.map((outcome) => (
                    <li key={outcome.path} className="flex gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-foreground-700">
                        {outcome.path}
                      </span>
                      <span className="uppercase text-foreground-500">{outcome.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-[11px] leading-5 text-danger-700">
              No version is selected automatically. Review every checked
              version, then type the mount name to confirm this permanent
              operation.
            </div>
            <Input
              label={`Type ${mount} to confirm`}
              value={typedMount}
              onChange={(event) => setTypedMount(event.target.value)}
              placeholder={mount}
              monospace
              autoComplete="off"
            />
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
            disabled={
              !preflight
              || selectedVersionCount === 0
              || typedMount.trim() !== mount
            }
            onClick={() => onConfirm(targets)}
          >
            Destroy {selectedVersionCount} versions permanently
          </Button>
        </div>
      </div>
    </Modal>
  );
}
