import { useCallback } from 'react';

import { clearNavigationSessionStorage } from '@/application/navigation-history/navigation-history';
import type { VaultAuthGateway } from '@/domain/vault/contracts';
import { VaultError, normalizeVaultError } from '@/domain/vault/errors';
import type {
  VaultSessionStorage,
  VaultSessionStorageLike,
} from './session-storage';
import type { VaultSessionStatus } from './VaultSessionContext';
import type { VaultSessionControls } from './useVaultSessionState';

interface SessionRevocationInput {
  readonly gateway: VaultAuthGateway;
  readonly status: VaultSessionStatus;
  readonly tabSession: VaultSessionStorage;
  readonly storageBackend: VaultSessionStorageLike | null;
  readonly controls: VaultSessionControls;
  readonly expireSession: () => void;
}

export function useSessionRevocation({
  gateway,
  status,
  tabSession,
  storageBackend,
  controls,
  expireSession,
}: SessionRevocationInput): (signal?: AbortSignal) => Promise<void> {
  return useCallback((signal?: AbortSignal): Promise<void> => {
    const { sessionRef, revocationPromiseRef, revocationControllerRef } = controls;
    if (revocationPromiseRef.current) return revocationPromiseRef.current;
    const currentSession = sessionRef.current;
    if (!currentSession || status !== 'authenticated') {
      return Promise.reject(new VaultError('session-expired'));
    }

    const controller = new AbortController();
    revocationControllerRef.current = controller;
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    controls.setRevocation({ status: 'revoking' });

    const promise = gateway.revokeSelf(currentSession, controller.signal)
      .then(() => {
        if (sessionRef.current?.token !== currentSession.token) return;
        controls.renewalControllerRef.current?.abort();
        if (!tabSession.clear()) controls.setSessionPersistenceAvailable(false);
        clearNavigationSessionStorage(storageBackend);
        controls.setSession(undefined);
        sessionRef.current = undefined;
        controls.setCapabilities({});
        controls.setCapabilityDiscovery('idle');
        controls.setError(undefined);
        controls.setRenewal({ status: 'idle' });
        controls.setStatus('anonymous');
        controls.setRevocation({ status: 'succeeded' });
      })
      .catch((cause: unknown) => {
        const nextError = normalizeVaultError(cause);
        if (sessionRef.current?.token !== currentSession.token) throw nextError;
        if (nextError.code === 'session-expired') {
          expireSession();
          controls.setRevocation({ status: 'failed', error: nextError });
        } else if (nextError.code === 'aborted') {
          controls.setRevocation({ status: 'idle' });
        } else {
          controls.setRevocation({ status: 'failed', error: nextError });
        }
        throw nextError;
      })
      .finally(() => {
        signal?.removeEventListener('abort', abortFromCaller);
        if (revocationControllerRef.current === controller) {
          revocationControllerRef.current = null;
        }
        if (revocationPromiseRef.current === promise) {
          revocationPromiseRef.current = null;
        }
      });
    revocationPromiseRef.current = promise;
    return promise;
  }, [controls, expireSession, gateway, status, storageBackend, tabSession]);
}
