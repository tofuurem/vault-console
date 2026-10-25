import { useEffect } from 'react';

import type { VaultAuthGateway, VaultSession } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { VaultSessionStatus } from './VaultSessionContext';
import type { VaultSessionControls } from './useVaultSessionState';

interface SessionRestoreInput {
  readonly gateway: VaultAuthGateway;
  readonly status: VaultSessionStatus;
  readonly session?: VaultSession;
  readonly controls: VaultSessionControls;
  readonly capabilityPaths: readonly string[];
  readonly expireSession: () => void;
}

export function useSessionRestore({
  gateway,
  status,
  session,
  controls,
  capabilityPaths,
  expireSession,
}: SessionRestoreInput): void {
  useEffect(() => {
    if (status !== 'restoring' || !session) return;
    const controller = new AbortController();
    let active = true;
    const restore = async () => {
      const [healthResult, capabilityResult] = await Promise.allSettled([
        gateway.getHealth(session.serverUrl, controller.signal),
        gateway.getCapabilities(session, capabilityPaths, controller.signal),
      ]);
      if (!active) return;
      if (healthResult.status === 'fulfilled') controls.setHealth(healthResult.value);
      if (capabilityResult.status === 'fulfilled') {
        controls.setCapabilities(capabilityResult.value);
        controls.setCapabilityDiscovery('ready');
      } else {
        const capabilityError = normalizeVaultError(capabilityResult.reason);
        if (capabilityError.code === 'session-expired') {
          expireSession();
          return;
        }
        controls.setCapabilityDiscovery('unavailable');
      }
      controls.setStatus('authenticated');
    };
    void restore();
    return () => {
      active = false;
      controller.abort();
    };
  }, [capabilityPaths, controls, expireSession, gateway, session, status]);
}
