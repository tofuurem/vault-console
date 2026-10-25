import { useState } from 'react';

import Button from '@/components/base/Button';
import SecretDataTree from '@/components/feature/SecretDataTree';
import { formatTtlSeconds, type VaultApiResponse } from '@/domain/engines/engines';

interface ApiResponsePanelProps {
  readonly title: string;
  readonly response: VaultApiResponse | null;
  readonly onDismiss: () => void;
}

/**
 * Shows a Vault response once, masked by default. The caller keeps it in
 * component state only and drops it on dismiss or navigation.
 */
export default function ApiResponsePanel({ title, response, onDismiss }: ApiResponsePanelProps) {
  const [revealAll, setRevealAll] = useState(false);
  const data = response?.data ?? null;
  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-background-200 px-3 py-2">
        <h3 className="text-xs font-semibold text-foreground-900">{title}</h3>
        <div className="flex items-center gap-1.5">
          {data && Object.keys(data).length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setRevealAll((current) => !current)} aria-pressed={revealAll}>
              <i className={revealAll ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
              {revealAll ? 'Hide values' : 'Reveal all'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            <i className="ri-close-line" aria-hidden="true" />
            Clear
          </Button>
        </div>
      </header>
      {response?.leaseId && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-background-200 bg-background-100/60 px-3 py-2 text-xs">
          <dt className="text-foreground-500">Lease</dt>
          <dd className="break-all font-mono text-foreground-800">{response.leaseId}</dd>
          <dt className="text-foreground-500">Duration</dt>
          <dd className="tabular-nums text-foreground-800">
            {formatTtlSeconds(response.leaseDurationSeconds ?? 0)}
            {response.renewable ? ' · renewable' : ' · not renewable'}
          </dd>
        </dl>
      )}
      {response && response.warnings.length > 0 && (
        <ul className="space-y-1 border-b border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-900">
          {response.warnings.map((warning) => (
            <li key={warning} className="flex gap-1.5">
              <i className="ri-error-warning-line mt-0.5 shrink-0" aria-hidden="true" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="p-3">
        {data && Object.keys(data).length > 0 ? (
          <SecretDataTree data={data} revealAll={revealAll} />
        ) : (
          <p className="text-xs text-foreground-500">Vault returned no data.</p>
        )}
      </div>
    </section>
  );
}
