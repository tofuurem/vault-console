import type { ReactNode } from 'react';

import { normalizeVaultError } from '@/domain/vault/errors';
import { pkiErrorText } from '../pki-format';

/** A failed request, with Vault's reasons when it gave any and a hint for missing permissions. */
export function ErrorNotice({ title, error, permissionHint }: {
  readonly title: string;
  readonly error: unknown;
  /** E.g. "Your token needs list on pki/issuers." */
  readonly permissionHint?: string;
}) {
  const { message, details } = pkiErrorText(error);
  const forbidden = normalizeVaultError(error).code === 'authorization';
  return (
    <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs leading-5 text-danger-800">
      <p className="font-semibold">{title}</p>
      <p>{message}</p>
      {details.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {details.map((detail) => <li key={detail} className="break-words">{detail}</li>)}
        </ul>
      )}
      {forbidden && permissionHint && <p className="mt-1 text-danger-700">{permissionHint}</p>}
    </div>
  );
}

export function WarningList({ warnings }: { readonly warnings: readonly string[] }) {
  // Vault sometimes repeats a warning (for example a clamped TTL).
  const unique = [...new Set(warnings)];
  if (unique.length === 0) return null;
  return (
    <ul aria-label="Vault warnings" className="space-y-1 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-900">
      {unique.map((warning) => (
        <li key={warning} className="flex gap-1.5">
          <i className="ri-error-warning-line mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{warning}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ icon, title, children, action }: {
  readonly icon: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-background-300 bg-background-50 px-4 py-8 text-center">
      <i className={`${icon} text-2xl text-foreground-400`} aria-hidden="true" />
      <h3 className="mt-2 text-sm font-semibold text-foreground-900">{title}</h3>
      <div className="mt-1 max-w-md text-xs leading-5 text-foreground-600">{children}</div>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
