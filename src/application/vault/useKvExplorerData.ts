import { useQuery } from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type {
  KvV2Gateway,
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

interface SecretPermissionGate {
  readonly status?: VaultQueryState<KvActionPermissions>['status'];
  readonly scope: string;
  readonly canReadData?: boolean;
  readonly canReadMetadata?: boolean;
  readonly canCreate?: boolean;
  readonly canUpdate?: boolean;
  readonly discovery?: KvActionPermissions['discovery'];
}

function secretPermissionGate(
  permissions: VaultQueryState<KvActionPermissions> | undefined,
): SecretPermissionGate {
  const granted = permissions?.status === 'success' ? permissions.data : undefined;
  return {
    status: permissions?.status,
    scope: permissions?.data?.scope ?? '',
    canReadData: granted?.canReadData,
    canReadMetadata: granted?.canReadMetadata,
    canCreate: granted?.canCreate,
    canUpdate: granted?.canUpdate,
    discovery: permissions?.data?.discovery,
  };
}

function canWriteWithoutRead(gate: SecretPermissionGate): boolean {
  return gate.canCreate === true || gate.canUpdate === true || gate.discovery === 'unavailable';
}

function isWaitingForPermissions(gate: SecretPermissionGate, mount: string, path: string | null): boolean {
  return Boolean(
    gate.status
    && (
      gate.status === 'idle'
      || gate.status === 'loading'
      || (gate.status === 'success' && gate.scope !== `${mount}/data/${path}`)
    ),
  );
}

function secretPermissionKey(
  permissions: VaultQueryState<KvActionPermissions> | undefined,
  gate: SecretPermissionGate,
): readonly unknown[] {
  if (!permissions) return ['unchecked'];
  return [
    gate.status,
    gate.scope,
    gate.canReadData,
    gate.canReadMetadata,
    gate.canCreate,
    gate.canUpdate,
    gate.discovery,
  ];
}

function resourceError<T>(result: ResourceResult<T>): VaultError | undefined {
  return result.ok === false ? result.error : undefined;
}

function secretDetailsFromResources(
  data: ResourceResult<KvV2Secret>,
  versionHistory: ResourceResult<KvV2SecretHistory>,
  writableWithoutRead: boolean,
): KvSecretDetails {
  const resourceErrors = [resourceError(data), resourceError(versionHistory)]
    .filter((error): error is VaultError => Boolean(error));
  const sessionError = resourceErrors.find((error) => error.code === 'session-expired');
  if (sessionError) throw sessionError;

  const history = versionHistory.ok ? versionHistory.data : undefined;
  const current = history?.versions.find((version) => version.version === history.currentVersion);
  const secret = data.ok && !current?.destroyed && !current?.deletionTime
    ? data.data
    : undefined;

  if (secret || history || writableWithoutRead) {
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
}

async function loadSecretDetails(
  gateway: KvV2Gateway,
  session: VaultSession,
  mount: string,
  path: string | null,
  gate: SecretPermissionGate,
  signal: AbortSignal,
): Promise<KvSecretDetails> {
  if (!path) throw new VaultError('invalid-request');
  const dataResult = gate.status === 'success' && gate.canReadData === false
    ? Promise.resolve(authorizationDeniedResource<KvV2Secret>())
    : captureResource(() => gateway.readSecret(session, mount, path, undefined, signal));
  const historyResult = gate.status === 'success' && gate.canReadMetadata === false
    ? Promise.resolve(authorizationDeniedResource<KvV2SecretHistory>())
    : captureResource(() => gateway.readSecretMetadata(session, mount, path, signal));

  const [data, versionHistory] = await Promise.all([dataResult, historyResult]);
  return secretDetailsFromResources(data, versionHistory, canWriteWithoutRead(gate));
}

export function useKvSecretDetails(
  session: VaultSession,
  mount: string,
  path: string | null,
  permissions?: VaultQueryState<KvActionPermissions>,
): readonly [VaultQueryState<KvSecretDetails>, () => void] {
  const gateway = useKvV2Gateway();
  const gate = secretPermissionGate(permissions);
  const waitingForPermissions = isWaitingForPermissions(gate, mount, path);
  const enabled = Boolean(mount && path && !waitingForPermissions);
  const query = useQuery({
    queryKey: vaultQueryKeys.secret(mount, path ?? '', secretPermissionKey(permissions, gate)),
    enabled,
    queryFn: ({ signal }) => loadSecretDetails(gateway, session, mount, path, gate, signal),
  });

  const idle = !mount || !path;
  const state = waitingForPermissions && !idle
    ? { status: 'loading' as const }
    : queryState(query, idle);
  return [state, () => { void query.refetch(); }];
}
