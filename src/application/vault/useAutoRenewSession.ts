import { useEffect, useRef } from 'react';

interface AutoRenewOptions {
  readonly enabled: boolean;
  /** True once the session clock enters its expiry warning window. */
  readonly warning: boolean;
  /** Changes whenever Vault returns a new lease, e.g. `${expiresAt}:${renewedAt}`. */
  readonly leaseKey: string;
  readonly renew: () => Promise<void>;
}

/**
 * Renews at most once per lease when the expiry warning starts. A failed
 * attempt is not retried for the same lease, so a token at its max TTL does
 * not loop; the manual renew action and banner remain available.
 */
export function useAutoRenewSession({ enabled, warning, leaseKey, renew }: AutoRenewOptions): void {
  const attemptedLease = useRef<string | null>(null);
  const renewRef = useRef(renew);
  renewRef.current = renew;

  useEffect(() => {
    if (!enabled || !warning || attemptedLease.current === leaseKey) return;
    attemptedLease.current = leaseKey;
    void renewRef.current().catch(() => undefined);
  }, [enabled, leaseKey, warning]);
}
