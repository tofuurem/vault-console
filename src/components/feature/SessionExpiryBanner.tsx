import { useState } from 'react';

import type {
  VaultSession,
} from '@/domain/vault/contracts';
import type {
  VaultSessionRenewalState,
} from '@/application/vault/VaultSessionContext';
import type { SessionClock } from '@/application/vault/useSessionClock';

interface SessionExpiryBannerProps {
  readonly session: VaultSession;
  readonly clock: SessionClock;
  readonly renewal: VaultSessionRenewalState;
  readonly onRenew: () => Promise<void>;
}

export default function SessionExpiryBanner({
  session,
  clock,
  renewal,
  onRenew,
}: SessionExpiryBannerProps) {
  const [dismissedExpiry, setDismissedExpiry] = useState<string>();
  const expiryKey = `${session.expiresAt ?? ''}:${session.renewedAt ?? ''}`;
  if (
    !clock.warning
    || session.expiresAt === undefined
    || dismissedExpiry === expiryKey
  ) {
    return null;
  }

  const canRenew = session.renewable === true;
  return (
    <aside
      role="status"
      aria-label="Vault session expiry warning"
      className="absolute inset-x-3 top-14 z-40 rounded-lg border border-warning-300 bg-warning-50 p-3 shadow-lg sm:left-auto sm:right-4 sm:w-[380px]"
    >
      <div className="flex items-start gap-2.5">
        <i className="ri-timer-flash-line mt-0.5 text-base text-warning-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-warning-900">
            Vault session expires in {clock.remainingLabel.replace(/ remaining$/, '')}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-warning-800">
            {canRenew
              ? 'Renew manually to continue without signing in again.'
              : 'Renewal is unavailable for this token. Save your work and sign in again before expiry.'}
          </p>
          {renewal.status === 'failed' && (
            <p className="mt-1 text-[11px] font-medium text-danger-700" role="alert">
              Renewal failed. The current session remains active until its existing expiry.
            </p>
          )}
          {renewal.status === 'succeeded' && (
            <p className="mt-1 text-[11px] font-medium text-success-700">
              Session renewed. The countdown uses the TTL returned by Vault.
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {canRenew && (
              <button
                type="button"
                disabled={renewal.status === 'renewing'}
                onClick={() => void onRenew().catch(() => undefined)}
                className="h-11 rounded-md bg-warning-700 px-3 text-[11px] font-medium text-background-50 hover:bg-warning-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500 disabled:cursor-wait disabled:opacity-60 sm:h-7 sm:px-2.5"
              >
                {renewal.status === 'renewing' ? 'Renewing…' : 'Renew session'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissedExpiry(expiryKey)}
              className="min-h-11 rounded-md px-2 text-[11px] font-medium text-warning-900 underline decoration-warning-400 underline-offset-2 hover:bg-warning-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500 sm:min-h-7"
            >
              Dismiss for this expiry
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
