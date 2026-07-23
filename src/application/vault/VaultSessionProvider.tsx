import {
  useCallback,
  useEffect,
  useMemo,
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
  type VaultSessionStatus,
} from './VaultSessionContext';
import {
  createVaultSessionStorage,
  type VaultSessionStorageLike,
} from './session-storage';
import {
  resolveAccessControlPermission,
  resolvePermission,
  type CapabilityDiscoveryState,
} from './capability-permissions';

export const ACCESS_CONTROL_CAPABILITY_PATHS = [
  'sys/auth',
  'sys/policy',
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
  const tabSession = useMemo(
    () => createVaultSessionStorage(
      suppliedStorage === undefined ? browserSessionStorage() : suppliedStorage,
    ),
    [suppliedStorage],
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
    setError(undefined);
    setSession(undefined);
    setCapabilities({});
    setCapabilityDiscovery('idle');
    if (!tabSession.clear()) setSessionPersistenceAvailable(false);
    try {
      const healthResult = await checkHealth(serverUrl, signal);
      await openSession(healthResult, authenticate, signal);
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code !== 'aborted') setError(nextError);
      tabSession.clear();
      setSession(undefined);
      setCapabilities({});
      setCapabilityDiscovery('idle');
      setStatus('anonymous');
      throw nextError;
    }
  }, [checkHealth, openSession, tabSession]);

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
    if (!tabSession.clear()) setSessionPersistenceAvailable(false);
    setSession(undefined);
    setCapabilities({});
    setCapabilityDiscovery('idle');
    setError(undefined);
    setStatus('anonymous');
  }, [tabSession]);

  const expireSession = useCallback(() => {
    if (!tabSession.clear()) setSessionPersistenceAvailable(false);
    setSession(undefined);
    setCapabilities({});
    setCapabilityDiscovery('idle');
    setError(new VaultError('session-expired'));
    setStatus('expired');
  }, [tabSession]);

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

  const permissionFor = useCallback((
    path: string,
    required: VaultCapability | readonly VaultCapability[],
  ) => resolvePermission(capabilities, capabilityDiscovery, path, required), [
    capabilities,
    capabilityDiscovery,
  ]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.expiresAt) return;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleExpiration = () => {
      const remaining = session.expiresAt! - Date.now();
      if (remaining <= 0) {
        expireSession();
        return;
      }
      timer = setTimeout(scheduleExpiration, Math.min(remaining, 2_147_000_000));
    };
    scheduleExpiration();
    return () => clearTimeout(timer);
  }, [expireSession, session, status]);

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
    error,
    checkHealth,
    queryCapabilities,
    permissionFor,
    signInWithToken,
    signInWithUserpass,
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
    error,
    checkHealth,
    queryCapabilities,
    permissionFor,
    signInWithToken,
    signInWithUserpass,
    expireSession,
    signOut,
  ]);

  return <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>;
}
