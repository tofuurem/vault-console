import { useCallback } from 'react';

import { clearNavigationSessionStorage } from '@/application/navigation-history/navigation-history';
import type {
  VaultAuthGateway,
  VaultHealth,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError, normalizeVaultError } from '@/domain/vault/errors';
import { vaultPassword, vaultToken } from '@/domain/vault/sensitive-value';
import type {
  VaultSessionStorage,
  VaultSessionStorageLike,
} from './session-storage';
import type { UserpassCredentials } from './VaultSessionContext';
import type { VaultSessionControls } from './useVaultSessionState';

interface SessionSignInInput {
  readonly gateway: VaultAuthGateway;
  readonly tabSession: VaultSessionStorage;
  readonly storageBackend: VaultSessionStorageLike | null;
  readonly controls: VaultSessionControls;
  readonly capabilityPaths: readonly string[];
  readonly checkHealth: (serverUrl: string, signal?: AbortSignal) => Promise<VaultHealth>;
}

export function useSessionSignIn({
  gateway,
  tabSession,
  storageBackend,
  controls,
  capabilityPaths,
  checkHealth,
}: SessionSignInInput) {
  const openSession = useCallback(async (
    healthResult: VaultHealth,
    authenticate: () => Promise<VaultSession>,
    signal?: AbortSignal,
  ) => {
    if (!healthResult.initialized) throw new VaultError('uninitialized');
    if (healthResult.sealed) throw new VaultError('sealed');
    const nextSession = await authenticate();
    controls.sessionRef.current = nextSession;
    controls.setSession(nextSession);
    controls.setSessionPersistenceAvailable(tabSession.save(nextSession));
    controls.setCapabilityDiscovery('loading');
    try {
      const nextCapabilities = await gateway.getCapabilities(
        nextSession,
        capabilityPaths,
        signal,
      );
      controls.setCapabilities(nextCapabilities);
      controls.setCapabilityDiscovery('ready');
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code === 'session-expired' || nextError.code === 'aborted') throw nextError;
      controls.setCapabilities({});
      controls.setCapabilityDiscovery('unavailable');
    }
    controls.setStatus('authenticated');
  }, [capabilityPaths, controls, gateway, tabSession]);

  const signIn = useCallback(async (
    serverUrl: string,
    authenticate: () => Promise<VaultSession>,
    signal?: AbortSignal,
  ) => {
    controls.setStatus('authenticating');
    controls.renewalControllerRef.current?.abort();
    controls.revocationControllerRef.current?.abort();
    controls.setRenewal({ status: 'idle' });
    controls.setRevocation({ status: 'idle' });
    controls.setError(undefined);
    controls.setSession(undefined);
    controls.sessionRef.current = undefined;
    controls.setCapabilities({});
    controls.setCapabilityDiscovery('idle');
    if (!tabSession.clear()) controls.setSessionPersistenceAvailable(false);
    clearNavigationSessionStorage(storageBackend);
    try {
      const healthResult = await checkHealth(serverUrl, signal);
      await openSession(healthResult, authenticate, signal);
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code !== 'aborted') controls.setError(nextError);
      tabSession.clear();
      controls.setSession(undefined);
      controls.sessionRef.current = undefined;
      controls.setCapabilities({});
      controls.setCapabilityDiscovery('idle');
      controls.setStatus('anonymous');
      throw nextError;
    }
  }, [checkHealth, controls, openSession, storageBackend, tabSession]);

  const signInWithToken = useCallback(async (
    serverUrl: string,
    rawToken: string,
    signal?: AbortSignal,
  ) => {
    const token = vaultToken(rawToken);
    await signIn(serverUrl, () => gateway.validateToken(serverUrl, token, signal), signal);
  }, [gateway, signIn]);

  const signInWithUserpass = useCallback(async (
    credentials: UserpassCredentials,
    signal?: AbortSignal,
  ) => {
    const password = vaultPassword(credentials.password);
    await signIn(
      credentials.serverUrl,
      () => gateway.loginUserpass({ ...credentials, password }, signal),
      signal,
    );
  }, [gateway, signIn]);

  return { signInWithToken, signInWithUserpass };
}
