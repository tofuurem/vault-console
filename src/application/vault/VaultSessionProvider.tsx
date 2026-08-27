import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  VaultAuthGateway,
  VaultCapability,
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError, normalizeVaultError } from '@/domain/vault/errors';
import { vaultPassword, vaultToken } from '@/domain/vault/sensitive-value';
import { VaultAuthAdapter } from '@/infrastructure/vault/auth/vault-auth-adapter';
import {
  VaultSessionContext,
  type UserpassCredentials,
  type VaultSessionContextValue,
  type VaultSessionRenewalState,
  type VaultSessionRevocationState,
  type VaultSessionStatus,
} from './VaultSessionContext';
import {
  createVaultSessionStorage,
  type VaultSessionStorageLike,
} from './session-storage';
import { clearNavigationSessionStorage } from '@/application/navigation-history/navigation-history';
import {
  resolveAccessControlPermission,
  resolvePermission,
  type CapabilityDiscoveryState,
} from './capability-permissions';

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
  const [initialSession] = useState(() => tabSession.load());
  const [status, setStatus] = useState<VaultSessionStatus>(
    initialSession.session ? 'restoring' : 'anonymous',
  );
  const [session, setSession] = useState<VaultSession | undefined>(initialSession.session);
  const [health, setHealth] = useState<VaultHealth>();
  const [capabilities, setCapabilities] = useState<VaultCapabilityMap>({});
  const [capabilityDiscovery, setCapabilityDiscovery] = useState<CapabilityDiscoveryState>(
    initialSession.session ? 'loading' : 'idle',
  );
  const [sessionPersistenceAvailable, setSessionPersistenceAvailable] = useState(
    initialSession.available,
  );
  const [error, setError] = useState<VaultError>();
  const [renewal, setRenewal] = useState<VaultSessionRenewalState>({ status: 'idle' });
  const [revocation, setRevocation] = useState<VaultSessionRevocationState>({ status: 'idle' });
  const sessionRef = useRef(session);
  const renewalPromiseRef = useRef<Promise<void> | null>(null);
  const renewalControllerRef = useRef<AbortController | null>(null);
  const revocationPromiseRef = useRef<Promise<void> | null>(null);
  const revocationControllerRef = useRef<AbortController | null>(null);
  sessionRef.current = session;

  const checkHealth = useCallback(async (serverUrl: string, signal?: AbortSignal) => {
    const result = await gateway.getHealth(serverUrl, signal);
    setHealth(result);
    return result;
  }, [gateway]);

  const openSession = useCallback(async (
    healthResult: VaultHealth,
    authenticate: () => Promise<VaultSession>,
    signal?: AbortSignal,
  ) => {
    if (!healthResult.initialized) throw new VaultError('uninitialized');
    if (healthResult.sealed) throw new VaultError('sealed');
    const nextSession = await authenticate();
    sessionRef.current = nextSession;
    setSession(nextSession);
    setSessionPersistenceAvailable(tabSession.save(nextSession));
    setCapabilityDiscovery('loading');
    try {
      const nextCapabilities = await gateway.getCapabilities(
        nextSession,
        ACCESS_CONTROL_CAPABILITY_PATHS,
        signal,
      );
      setCapabilities(nextCapabilities);
      setCapabilityDiscovery('ready');
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code === 'session-expired' || nextError.code === 'aborted') throw nextError;
      setCapabilities({});
      setCapabilityDiscovery('unavailable');
    }
    setStatus('authenticated');
  }, [gateway, tabSession]);

  const signIn = useCallback(async (
    serverUrl: string,
    authenticate: () => Promise<VaultSession>,
    signal?: AbortSignal,
  ) => {
    setStatus('authenticating');
    renewalControllerRef.current?.abort();
    revocationControllerRef.current?.abort();
    setRenewal({ status: 'idle' });
    setRevocation({ status: 'idle' });
    setError(undefined);
    setSession(undefined);
    sessionRef.current = undefined;
    setCapabilities({});
    setCapabilityDiscovery('idle');
    if (!tabSession.clear()) setSessionPersistenceAvailable(false);
    clearNavigationSessionStorage(storageBackend);
    try {
      const healthResult = await checkHealth(serverUrl, signal);
      await openSession(healthResult, authenticate, signal);
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code !== 'aborted') setError(nextError);
      tabSession.clear();
      setSession(undefined);
      sessionRef.current = undefined;
      setCapabilities({});
      setCapabilityDiscovery('idle');
      setStatus('anonymous');
      throw nextError;
    }
  }, [checkHealth, openSession, storageBackend, tabSession]);

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

  const signOut = useCallback(() => {
    renewalControllerRef.current?.abort();
    revocationControllerRef.current?.abort();
    if (!tabSession.clear()) setSessionPersistenceAvailable(false);
    clearNavigationSessionStorage(storageBackend);
    setSession(undefined);
    sessionRef.current = undefined;
    setCapabilities({});
    setCapabilityDiscovery('idle');
    setError(undefined);
    setRenewal({ status: 'idle' });
    setRevocation({ status: 'idle' });
    setStatus('anonymous');
  }, [storageBackend, tabSession]);

  const expireSession = useCallback(() => {
    renewalControllerRef.current?.abort();
    revocationControllerRef.current?.abort();
    if (!tabSession.clear()) setSessionPersistenceAvailable(false);
    clearNavigationSessionStorage(storageBackend);
    setSession(undefined);
    sessionRef.current = undefined;
    setCapabilities({});
    setCapabilityDiscovery('idle');
    setError(new VaultError('session-expired'));
    setRenewal({ status: 'idle' });
    setRevocation({ status: 'idle' });
    setStatus('expired');
  }, [storageBackend, tabSession]);

  useEffect(() => {
    if (status !== 'restoring' || !session) return;
    const controller = new AbortController();
    let active = true;
    const restore = async () => {
      const [healthResult, capabilityResult] = await Promise.allSettled([
        gateway.getHealth(session.serverUrl, controller.signal),
        gateway.getCapabilities(session, ACCESS_CONTROL_CAPABILITY_PATHS, controller.signal),
      ]);
      if (!active) return;
      if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
      if (capabilityResult.status === 'fulfilled') {
        setCapabilities(capabilityResult.value);
        setCapabilityDiscovery('ready');
      } else {
        const capabilityError = normalizeVaultError(capabilityResult.reason);
        if (capabilityError.code === 'session-expired') {
          expireSession();
          return;
        }
        setCapabilityDiscovery('unavailable');
      }
      setStatus('authenticated');
    };
    void restore();
    return () => {
      active = false;
      controller.abort();
    };
  }, [expireSession, gateway, session, status]);

  const queryCapabilities = useCallback(async (paths: readonly string[], signal?: AbortSignal) => {
    if (!session || status !== 'authenticated') throw new VaultError('session-expired');
    try {
      return await gateway.getCapabilities(session, paths, signal);
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code === 'session-expired') expireSession();
      throw nextError;
    }
  }, [expireSession, gateway, session, status]);

  const renewSession = useCallback((signal?: AbortSignal): Promise<void> => {
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
    setRenewal({ status: 'renewing' });

    const promise = gateway.renewSelf(currentSession, controller.signal)
      .then((lease) => {
        if (sessionRef.current?.token !== currentSession.token) return;
        const nextSession = { ...currentSession, ...lease };
        sessionRef.current = nextSession;
        setSession(nextSession);
        setSessionPersistenceAvailable(tabSession.save(nextSession));
        setRenewal({ status: 'succeeded' });
      })
      .catch((cause: unknown) => {
        const nextError = normalizeVaultError(cause);
        if (sessionRef.current?.token !== currentSession.token) throw nextError;
        if (nextError.code === 'session-expired') {
          expireSession();
        } else if (nextError.code === 'aborted') {
          setRenewal({ status: 'idle' });
        } else {
          if (nextError.code === 'authorization' || nextError.code === 'invalid-request') {
            const nextSession = { ...currentSession, renewable: false };
            sessionRef.current = nextSession;
            setSession(nextSession);
            setSessionPersistenceAvailable(tabSession.save(nextSession));
          }
          setRenewal({ status: 'failed', error: nextError });
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
  }, [expireSession, gateway, status, tabSession]);

  const revokeSession = useCallback((signal?: AbortSignal): Promise<void> => {
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
    setRevocation({ status: 'revoking' });

    const promise = gateway.revokeSelf(currentSession, controller.signal)
      .then(() => {
        if (sessionRef.current?.token !== currentSession.token) return;
        renewalControllerRef.current?.abort();
        if (!tabSession.clear()) setSessionPersistenceAvailable(false);
        clearNavigationSessionStorage(storageBackend);
        setSession(undefined);
        sessionRef.current = undefined;
        setCapabilities({});
        setCapabilityDiscovery('idle');
        setError(undefined);
        setRenewal({ status: 'idle' });
        setStatus('anonymous');
        setRevocation({ status: 'succeeded' });
      })
      .catch((cause: unknown) => {
        const nextError = normalizeVaultError(cause);
        if (sessionRef.current?.token !== currentSession.token) throw nextError;
        if (nextError.code === 'session-expired') {
          expireSession();
          setRevocation({ status: 'failed', error: nextError });
        } else if (nextError.code === 'aborted') {
          setRevocation({ status: 'idle' });
        } else {
          setRevocation({ status: 'failed', error: nextError });
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
  }, [expireSession, gateway, status, storageBackend, tabSession]);

  const permissionFor = useCallback((
    path: string,
    required: VaultCapability | readonly VaultCapability[],
  ) => resolvePermission(capabilities, capabilityDiscovery, path, required), [
    capabilities,
    capabilityDiscovery,
  ]);

  const accessControlPermission = resolveAccessControlPermission(
    capabilities,
    capabilityDiscovery,
  );
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
