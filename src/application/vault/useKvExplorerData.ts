import { useQuery } from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
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

function queryState<T>(
  query: {
    readonly data: T | undefined;
    readonly error: Error | null;
    readonly isError: boolean;
    readonly isPending: boolean;
  },
  idle = false,
): VaultQueryState<T> {
  if (idle) return { status: 'idle' };
  if (query.isError) {
    return {
      status: 'error',
      error: normalizeVaultError(query.error),
      ...(query.data === undefined ? {} : { data: query.data }),
    };
  }
  if (query.isPending || query.data === undefined) return { status: 'loading' };
  return { status: 'success', data: query.data };
}

export function useKvMounts(session: VaultSession): readonly [VaultQueryState<readonly KvV2Mount[]>, () => void] {
  const gateway = useKvV2Gateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.mounts(),
    queryFn: ({ signal }) => gateway.listMounts(session, signal),
  });

  return [queryState(query), () => { void query.refetch(); }];
}

export function useKvDirectory(
  session: VaultSession,
  mount: string,
  path: string,
  enabled = true,
): readonly [VaultQueryState<readonly string[]>, () => void] {
  const gateway = useKvV2Gateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.directory(mount, path),
    queryFn: ({ signal }) => gateway.listPaths(session, mount, path, signal),
    enabled: Boolean(mount) && enabled,
  });

  return [queryState(query, !mount || !enabled), () => { void query.refetch(); }];
}

export function useKvSecretDetails(
  session: VaultSession,
  mount: string,
  path: string | null,
  permissions?: VaultQueryState<KvActionPermissions>,
): readonly [VaultQueryState<KvSecretDetails>, () => void] {
  const gateway = useKvV2Gateway();
  const permissionStatus = permissions?.status;
  const permissionScope = permissions?.data?.scope ?? '';
  const canReadData = permissions?.status === 'success' ? permissions.data.canReadData : undefined;
  const canReadMetadata = permissions?.status === 'success' ? permissions.data.canReadMetadata : undefined;
  const waitingForPermissions = Boolean(
    permissionStatus
    && (
      permissionStatus === 'idle'
      || permissionStatus === 'loading'
      || (permissionStatus === 'success' && permissionScope !== `${mount}/data/${path}`)
    ),
  );
  const permissionKey = permissions
    ? [permissionStatus, permissionScope, canReadData, canReadMetadata]
    : ['unchecked'];
  const enabled = Boolean(mount && path && !waitingForPermissions);
  const query = useQuery({
    queryKey: vaultQueryKeys.secret(mount, path ?? '', permissionKey),
    enabled,
    queryFn: async ({ signal }) => {
      if (!path) throw new VaultError('invalid-request');
      const dataResult = permissionStatus === 'success' && canReadData === false
        ? Promise.resolve(authorizationDeniedResource<KvV2Secret>())
        : captureResource(() => gateway.readSecret(session, mount, path, undefined, signal));
      const historyResult = permissionStatus === 'success' && canReadMetadata === false
        ? Promise.resolve(authorizationDeniedResource<KvV2SecretHistory>())
        : captureResource(() => gateway.readSecretHistory(session, mount, path, signal));

      const [data, versionHistory] = await Promise.all([dataResult, historyResult]);
      const resourceErrors = [
        data.ok === false ? data.error : undefined,
        versionHistory.ok === false ? versionHistory.error : undefined,
      ].filter((error): error is VaultError => Boolean(error));
      const sessionError = resourceErrors.find((error) => error.code === 'session-expired');
      if (sessionError) throw sessionError;

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
        return details;
      }

      const error = resourceErrors[0];
      throw error ?? new VaultError('unknown');
    },
  });

  const idle = !mount || !path;
  const state = waitingForPermissions && !idle
    ? { status: 'loading' as const }
    : queryState(query, idle);
  return [state, () => { void query.refetch(); }];
}
