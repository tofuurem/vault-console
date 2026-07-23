import { useEffect, useReducer, useState } from 'react';

import type {
  KvV2Mount,
  KvV2Secret,
  KvV2SecretHistory,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import { useKvV2Gateway } from './KvV2GatewayContext';
import type { KvActionPermissions } from './useKvActionPermissions';

export type VaultQueryState<T> =
  | { readonly status: 'idle' | 'loading'; readonly data?: T }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: VaultError; readonly data?: T };

export interface KvSecretDetails {
  readonly secret?: KvV2Secret;
  readonly history?: KvV2SecretHistory;
  readonly dataError?: VaultError;
  readonly historyError?: VaultError;
}

type ResourceResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: VaultError };

async function captureResource<T>(operation: () => Promise<T>): Promise<ResourceResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (cause) {
    return { ok: false, error: normalizeVaultError(cause) };
  }
}

function authorizationDeniedResource<T>(): ResourceResult<T> {
  return { ok: false, error: new VaultError('authorization', { status: 403 }) };
}

function useRefreshSignal(): readonly [number, () => void] {
  const [signal, refresh] = useReducer((value: number) => value + 1, 0);
  return [signal, refresh] as const;
}

export function useKvMounts(session: VaultSession): readonly [VaultQueryState<readonly KvV2Mount[]>, () => void] {
  const gateway = useKvV2Gateway();
  const [refreshSignal, refresh] = useRefreshSignal();
  const [state, setState] = useState<VaultQueryState<readonly KvV2Mount[]>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: 'loading', data: current.data }));
    gateway.listMounts(session, controller.signal).then(
      (mounts) => setState({ status: 'success', data: mounts }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState((current) => ({ status: 'error', error, data: current.data }));
      },
    );
    return () => controller.abort();
  }, [gateway, refreshSignal, session]);

  return [state, refresh];
}

export function useKvDirectory(
  session: VaultSession,
  mount: string,
  path: string,
): readonly [VaultQueryState<readonly string[]>, () => void] {
  const gateway = useKvV2Gateway();
  const [refreshSignal, refresh] = useRefreshSignal();
  const [state, setState] = useState<VaultQueryState<readonly string[]>>({ status: 'idle' });

  useEffect(() => {
    if (!mount) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ status: 'loading', data: current.data }));
    gateway.listPaths(session, mount, path, controller.signal).then(
      (keys) => setState({ status: 'success', data: keys }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState((current) => ({ status: 'error', error, data: current.data }));
      },
    );
    return () => controller.abort();
  }, [gateway, mount, path, refreshSignal, session]);

  return [state, refresh];
}

export function useKvSecretDetails(
  session: VaultSession,
  mount: string,
  path: string | null,
  permissions?: VaultQueryState<KvActionPermissions>,
): readonly [VaultQueryState<KvSecretDetails>, () => void] {
  const gateway = useKvV2Gateway();
  const [refreshSignal, refresh] = useRefreshSignal();
  const [state, setState] = useState<VaultQueryState<KvSecretDetails>>({ status: 'idle' });
  const permissionStatus = permissions?.status;
  const permissionScope = permissions?.data?.scope ?? '';
  const canReadData = permissions?.status === 'success' ? permissions.data.canReadData : undefined;
  const canReadMetadata = permissions?.status === 'success' ? permissions.data.canReadMetadata : undefined;

  useEffect(() => {
    if (!mount || !path) {
      setState({ status: 'idle' });
      return;
    }
    if (
      permissionStatus
      && (
        permissionStatus === 'idle'
        || permissionStatus === 'loading'
        || (permissionStatus === 'success' && permissionScope !== `${mount}/data/${path}`)
      )
    ) {
      setState({ status: 'loading' });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });
    const dataResult = permissionStatus === 'success' && canReadData === false
      ? Promise.resolve(authorizationDeniedResource<KvV2Secret>())
      : captureResource(() => gateway.readSecret(session, mount, path, undefined, controller.signal));
    const historyResult = permissionStatus === 'success' && canReadMetadata === false
      ? Promise.resolve(authorizationDeniedResource<KvV2SecretHistory>())
      : captureResource(() => gateway.readSecretHistory(session, mount, path, controller.signal));

    Promise.all([dataResult, historyResult]).then(([data, versionHistory]) => {
      if (controller.signal.aborted) return;

      const resourceErrors = [
        data.ok === false ? data.error : undefined,
        versionHistory.ok === false ? versionHistory.error : undefined,
      ].filter((error): error is VaultError => Boolean(error));
      const sessionError = resourceErrors.find((error) => error.code === 'session-expired');
      if (sessionError) {
        setState({ status: 'error', error: sessionError });
        return;
      }

      const history = versionHistory.ok ? versionHistory.data : undefined;
      const current = history?.versions.find((version) => version.version === history.currentVersion);
      const secret = data.ok && !current?.destroyed && !current?.deletionTime
        ? data.data
        : undefined;

      if (secret || history) {
        const details: {
          secret?: KvV2Secret;
          history?: KvV2SecretHistory;
          dataError?: VaultError;
          historyError?: VaultError;
        } = {};
        if (secret) details.secret = secret;
        if (history) details.history = history;
        if (data.ok === false) details.dataError = data.error;
        if (versionHistory.ok === false) details.historyError = versionHistory.error;
        setState({ status: 'success', data: details });
        return;
      }

      const error = resourceErrors[0];
      if (error && error.code !== 'aborted') setState({ status: 'error', error });
    });

    return () => controller.abort();
  }, [
    canReadData,
    canReadMetadata,
    gateway,
    mount,
    path,
    permissionScope,
    permissionStatus,
    refreshSignal,
    session,
  ]);

  return [state, refresh];
}
