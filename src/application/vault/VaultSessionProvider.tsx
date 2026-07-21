import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  VaultAuthGateway,
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

export const ACCESS_CONTROL_CAPABILITY_PATHS = [
  'sys/auth',
  'sys/policy',
  'identity/group/id',
  'identity/entity/id',
] as const;

function hasUsefulCapability(capabilities: readonly string[] | undefined): boolean {
  return Boolean(capabilities?.some((capability) => capability !== 'deny'));
}

interface VaultSessionProviderProps {
  readonly children: ReactNode;
  readonly gateway?: VaultAuthGateway;
}

export function VaultSessionProvider({ children, gateway: suppliedGateway }: VaultSessionProviderProps) {
  const gateway = useMemo(() => suppliedGateway ?? new VaultAuthAdapter(), [suppliedGateway]);
  const [status, setStatus] = useState<VaultSessionStatus>('anonymous');
  const [session, setSession] = useState<VaultSession>();
  const [health, setHealth] = useState<VaultHealth>();
  const [capabilities, setCapabilities] = useState<VaultCapabilityMap>({});
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
    const nextCapabilities = await gateway.getCapabilities(
      nextSession,
      ACCESS_CONTROL_CAPABILITY_PATHS,
      signal,
    );
    setSession(nextSession);
    setCapabilities(nextCapabilities);
    setStatus('authenticated');
  }, [gateway]);

  const signIn = useCallback(async (
    serverUrl: string,
    authenticate: () => Promise<VaultSession>,
    signal?: AbortSignal,
  ) => {
    setStatus('authenticating');
    setError(undefined);
    setSession(undefined);
    setCapabilities({});
    try {
      const healthResult = await checkHealth(serverUrl, signal);
      await openSession(healthResult, authenticate, signal);
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code !== 'aborted') setError(nextError);
      setStatus('anonymous');
      throw nextError;
    }
  }, [checkHealth, openSession]);

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
    setSession(undefined);
    setCapabilities({});
    setError(undefined);
    setStatus('anonymous');
  }, []);

  const expireSession = useCallback(() => {
    setSession(undefined);
    setCapabilities({});
    setError(new VaultError('session-expired'));
    setStatus('expired');
  }, []);

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

  const canManageAccess = ACCESS_CONTROL_CAPABILITY_PATHS.some((path) => (
    hasUsefulCapability(capabilities[path])
  ));
  const value = useMemo<VaultSessionContextValue>(() => ({
    status,
    session,
    health,
    capabilities,
    canManageAccess,
    error,
    checkHealth,
    queryCapabilities,
    signInWithToken,
    signInWithUserpass,
    expireSession,
    signOut,
  }), [
    status,
    session,
    health,
    capabilities,
    canManageAccess,
    error,
    checkHealth,
    queryCapabilities,
    signInWithToken,
    signInWithUserpass,
    expireSession,
    signOut,
  ]);

  return <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>;
}
