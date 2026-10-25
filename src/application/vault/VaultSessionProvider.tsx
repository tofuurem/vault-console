import {
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

import type { VaultAuthGateway } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { VaultAuthAdapter } from '@/infrastructure/vault/auth/vault-auth-adapter';
import {
  VaultSessionContext,
  type VaultSessionContextValue,
} from './VaultSessionContext';
import {
  createVaultSessionStorage,
  type VaultSessionStorageLike,
} from './session-storage';
import { clearNavigationSessionStorage } from '@/application/navigation-history/navigation-history';
import { useSessionCapabilities } from './useSessionCapabilities';
import { useSessionRenewal } from './useSessionRenewal';
import { useSessionRestore } from './useSessionRestore';
import { useSessionRevocation } from './useSessionRevocation';
import { useSessionSignIn } from './useSessionSignIn';
import { useVaultSessionState } from './useVaultSessionState';

export const ACCESS_CONTROL_CAPABILITY_PATHS = [
  'sys/auth',
  'sys/policies/acl',
  'identity/group/id',
  'identity/entity/id',
] as const;

interface VaultSessionProviderProps {
  readonly children: ReactNode;
  readonly gateway?: VaultAuthGateway;
  readonly storage?: VaultSessionStorageLike | null;
}

function browserSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function VaultSessionProvider({
  children,
  gateway: suppliedGateway,
  storage: suppliedStorage,
}: VaultSessionProviderProps) {
  const gateway = useMemo(() => suppliedGateway ?? new VaultAuthAdapter(), [suppliedGateway]);
  const storageBackend = useMemo(
    () => suppliedStorage === undefined ? browserSessionStorage() : suppliedStorage,
    [suppliedStorage],
  );
  const tabSession = useMemo(
    () => createVaultSessionStorage(storageBackend),
    [storageBackend],
  );
  const { values, controls } = useVaultSessionState(tabSession);
  const {
    status,
    session,
    health,
    capabilities,
    capabilityDiscovery,
    sessionPersistenceAvailable,
    error,
    renewal,
    revocation,
  } = values;

  const checkHealth = useCallback(async (serverUrl: string, signal?: AbortSignal) => {
    const result = await gateway.getHealth(serverUrl, signal);
    controls.setHealth(result);
    return result;
  }, [controls, gateway]);

  const { signInWithToken, signInWithUserpass } = useSessionSignIn({
    gateway,
    tabSession,
    storageBackend,
    controls,
    capabilityPaths: ACCESS_CONTROL_CAPABILITY_PATHS,
    checkHealth,
  });

  const signOut = useCallback(() => {
    controls.renewalControllerRef.current?.abort();
    controls.revocationControllerRef.current?.abort();
    if (!tabSession.clear()) controls.setSessionPersistenceAvailable(false);
    clearNavigationSessionStorage(storageBackend);
    controls.setSession(undefined);
    controls.sessionRef.current = undefined;
    controls.setCapabilities({});
    controls.setCapabilityDiscovery('idle');
    controls.setError(undefined);
    controls.setRenewal({ status: 'idle' });
    controls.setRevocation({ status: 'idle' });
    controls.setStatus('anonymous');
  }, [controls, storageBackend, tabSession]);

  const expireSession = useCallback(() => {
    controls.renewalControllerRef.current?.abort();
    controls.revocationControllerRef.current?.abort();
    if (!tabSession.clear()) controls.setSessionPersistenceAvailable(false);
    clearNavigationSessionStorage(storageBackend);
    controls.setSession(undefined);
    controls.sessionRef.current = undefined;
    controls.setCapabilities({});
    controls.setCapabilityDiscovery('idle');
    controls.setError(new VaultError('session-expired'));
    controls.setRenewal({ status: 'idle' });
    controls.setRevocation({ status: 'idle' });
    controls.setStatus('expired');
  }, [controls, storageBackend, tabSession]);

  useSessionRestore({
    gateway,
    status,
    session,
    controls,
    capabilityPaths: ACCESS_CONTROL_CAPABILITY_PATHS,
    expireSession,
  });

  const { queryCapabilities, permissionFor, accessControlPermission } = useSessionCapabilities({
    gateway,
    status,
    session,
    capabilities,
    capabilityDiscovery,
    expireSession,
  });

  const renewSession = useSessionRenewal({
    gateway,
    status,
    tabSession,
    controls,
    expireSession,
  });

  const revokeSession = useSessionRevocation({
    gateway,
    status,
    tabSession,
    storageBackend,
    controls,
    expireSession,
  });

  const value = useMemo<VaultSessionContextValue>(() => ({
    status,
    session,
    health,
    capabilities,
    capabilityDiscovery,
    accessControlPermission,
    sessionPersistenceAvailable,
    renewal,
    revocation,
    error,
    checkHealth,
    queryCapabilities,
    permissionFor,
    signInWithToken,
    signInWithUserpass,
    renewSession,
    revokeSession,
    expireSession,
    signOut,
  }), [
    status,
    session,
    health,
    capabilities,
    capabilityDiscovery,
    accessControlPermission,
    sessionPersistenceAvailable,
    renewal,
    revocation,
    error,
    checkHealth,
    queryCapabilities,
    permissionFor,
    signInWithToken,
    signInWithUserpass,
    renewSession,
    revokeSession,
    expireSession,
    signOut,
  ]);

  return <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>;
}
