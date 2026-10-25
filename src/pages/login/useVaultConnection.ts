import { useCallback, useEffect, useRef, useState } from 'react';

import type { VaultHealth } from '@/domain/vault/contracts';
import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import { normalizeVaultServerUrl } from '@/domain/vault/server-url';

export type ConnectionStatus = 'idle' | 'checking' | 'ready' | 'sealed' | 'uninitialized' | 'unavailable';

export function serverErrorMessage(error: VaultError): string {
  if (error.code === 'unavailable') {
    return 'Vault could not be reached. Check the address, certificate, network, and CORS configuration.';
  }
  return error.message;
}

function statusFromHealth(health: VaultHealth): ConnectionStatus {
  if (!health.initialized) return 'uninitialized';
  return health.sealed ? 'sealed' : 'ready';
}

interface VaultConnectionOptions {
  readonly initialServerUrl: string;
  readonly checkOnMount: boolean;
  readonly checkHealth: (serverUrl: string, signal?: AbortSignal) => Promise<VaultHealth>;
  readonly onError: (message: string) => void;
}

/**
 * Owns the Vault address typed on the sign-in screen, its health probe, and
 * the single in-flight request shared with sign-in submissions.
 */
export function useVaultConnection({
  initialServerUrl,
  checkOnMount,
  checkHealth,
  onError,
}: VaultConnectionOptions) {
  const requestRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [serverUrl, setServerUrlState] = useState(initialServerUrl);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [health, setHealth] = useState<VaultHealth>();
  const [serverError, setServerError] = useState('');

  const beginRequest = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    return controller;
  }, []);

  const setServerUrl = useCallback((value: string) => {
    setServerUrlState(value);
    setStatus('idle');
    setHealth(undefined);
    setServerError('');
  }, []);

  const validatedServerUrl = useCallback((): string | null => {
    try {
      const normalized = normalizeVaultServerUrl(serverUrl);
      setServerError('');
      return normalized;
    } catch {
      setServerError('Enter a complete HTTP or HTTPS Vault address.');
      return null;
    }
  }, [serverUrl]);

  const checkConnection = useCallback(async (clearExistingError = true) => {
    const normalized = validatedServerUrl();
    if (!normalized) return;
    const controller = beginRequest();
    setStatus('checking');
    if (clearExistingError) onErrorRef.current('');
    setHealth(undefined);
    try {
      const result = await checkHealth(normalized, controller.signal);
      setHealth(result);
      setStatus(statusFromHealth(result));
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'aborted') return;
      setStatus('unavailable');
      onErrorRef.current(serverErrorMessage(error));
    }
  }, [beginRequest, checkHealth, validatedServerUrl]);

  useEffect(() => {
    if (checkOnMount) void checkConnection(false);
    return () => requestRef.current?.abort();
  }, [checkConnection, checkOnMount]);

  return {
    serverUrl,
    setServerUrl,
    status,
    health,
    serverError,
    validatedServerUrl,
    checkConnection,
    beginRequest,
  };
}

export type VaultConnection = ReturnType<typeof useVaultConnection>;
