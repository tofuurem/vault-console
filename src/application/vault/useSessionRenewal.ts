import { useCallback } from 'react';

import type { VaultAuthGateway } from '@/domain/vault/contracts';
import { VaultError, normalizeVaultError } from '@/domain/vault/errors';
import type { VaultSessionStorage } from './session-storage';
import type { VaultSessionStatus } from './VaultSessionContext';
import type { VaultSessionControls } from './useVaultSessionState';

interface SessionRenewalInput {
  readonly gateway: VaultAuthGateway;
  readonly status: VaultSessionStatus;
  readonly tabSession: VaultSessionStorage;
  readonly controls: VaultSessionControls;
  readonly expireSession: () => void;
}

export function useSessionRenewal({
  gateway,
  status,
  tabSession,
  controls,
  expireSession,
}: SessionRenewalInput): (signal?: AbortSignal) => Promise<void> {
  return useCallback((signal?: AbortSignal): Promise<void> => {
    const { sessionRef, renewalPromiseRef, renewalControllerRef } = controls;
    if (renewalPromiseRef.current) return renewalPromiseRef.current;
    const currentSession = sessionRef.current;
    if (!currentSession || status !== 'authenticated') {
      return Promise.reject(new VaultError('session-expired'));
    }
    if (currentSession.renewable !== true) {
      return Promise.reject(new VaultError('invalid-request'));
    }

    const controller = new AbortController();
    renewalControllerRef.current = controller;
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    controls.setRenewal({ status: 'renewing' });

    const promise = gateway.renewSelf(currentSession, controller.signal)
      .then((lease) => {
        if (sessionRef.current?.token !== currentSession.token) return;
        const nextSession = { ...currentSession, ...lease };
        sessionRef.current = nextSession;
        controls.setSession(nextSession);
        controls.setSessionPersistenceAvailable(tabSession.save(nextSession));
        controls.setRenewal({ status: 'succeeded' });
      })
      .catch((cause: unknown) => {
        const nextError = normalizeVaultError(cause);
        if (sessionRef.current?.token !== currentSession.token) throw nextError;
        if (nextError.code === 'session-expired') {
          expireSession();
        } else if (nextError.code === 'aborted') {
          controls.setRenewal({ status: 'idle' });
        } else {
          if (nextError.code === 'authorization' || nextError.code === 'invalid-request') {
            const nextSession = { ...currentSession, renewable: false };
            sessionRef.current = nextSession;
            controls.setSession(nextSession);
            controls.setSessionPersistenceAvailable(tabSession.save(nextSession));
          }
          controls.setRenewal({ status: 'failed', error: nextError });
        }
        throw nextError;
      })
      .finally(() => {
        signal?.removeEventListener('abort', abortFromCaller);
        if (renewalControllerRef.current === controller) {
          renewalControllerRef.current = null;
        }
        if (renewalPromiseRef.current === promise) {
          renewalPromiseRef.current = null;
        }
      });
    renewalPromiseRef.current = promise;
    return promise;
  }, [controls, expireSession, gateway, status, tabSession]);
}
