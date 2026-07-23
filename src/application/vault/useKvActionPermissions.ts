import { useQuery } from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type { VaultCapability, VaultCapabilityMap } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import { useVaultSession } from './VaultSessionContext';
import type { VaultQueryState } from './useKvExplorerData';

export interface KvActionPaths {
  readonly data: string;
  readonly deleteVersions: string;
  readonly undelete: string;
  readonly destroy: string;
  readonly metadata: string;
}

export interface KvActionPermissions {
  readonly scope: string;
  readonly canReadData: boolean;
  readonly canReadMetadata: boolean;
  readonly canEdit: boolean;
  readonly canDeleteLatest: boolean;
  readonly canDeleteVersions: boolean;
  readonly canUndelete: boolean;
  readonly canDestroy: boolean;
  readonly canDeleteMetadata: boolean;
}

export function kvActionPaths(mount: string, path: string): KvActionPaths {
  return {
    data: `${mount}/data/${path}`,
    deleteVersions: `${mount}/delete/${path}`,
    undelete: `${mount}/undelete/${path}`,
    destroy: `${mount}/destroy/${path}`,
    metadata: `${mount}/metadata/${path}`,
  };
}

function allows(
  capabilities: readonly VaultCapability[] | undefined,
  required: VaultCapability,
): boolean {
  if (!capabilities || capabilities.includes('deny')) return false;
  return capabilities.includes('root') || capabilities.includes(required);
}

export function resolveKvActionPermissions(
  capabilities: VaultCapabilityMap,
  paths: KvActionPaths,
): KvActionPermissions {
  return {
    scope: paths.data,
    canReadData: allows(capabilities[paths.data], 'read'),
    canReadMetadata: allows(capabilities[paths.metadata], 'read'),
    canEdit: allows(capabilities[paths.data], 'update'),
    canDeleteLatest: allows(capabilities[paths.data], 'delete'),
    canDeleteVersions: allows(capabilities[paths.deleteVersions], 'update'),
    canUndelete: allows(capabilities[paths.undelete], 'update'),
    canDestroy: allows(capabilities[paths.destroy], 'update'),
    canDeleteMetadata: allows(capabilities[paths.metadata], 'delete'),
  };
}

const NO_PERMISSIONS: KvActionPermissions = {
  scope: '',
  canReadData: false,
  canReadMetadata: false,
  canEdit: false,
  canDeleteLatest: false,
  canDeleteVersions: false,
  canUndelete: false,
  canDestroy: false,
  canDeleteMetadata: false,
};

export function useKvActionPermissions(
  mount: string,
  path: string | null,
): readonly [VaultQueryState<KvActionPermissions>, () => void] {
  const vault = useVaultSession();
  const query = useQuery({
    queryKey: vaultQueryKeys.permissions(mount, path ?? ''),
    enabled: Boolean(mount && path),
    queryFn: async ({ signal }) => {
      if (!path) return NO_PERMISSIONS;
    const paths = kvActionPaths(mount, path);
      const capabilities = await vault.queryCapabilities(Object.values(paths), signal);
      return resolveKvActionPermissions(capabilities, paths);
    },
  });

  if (!mount || !path) return [{ status: 'idle', data: NO_PERMISSIONS }, () => {}];
  if (query.isError) {
    return [{
      status: 'error',
      error: normalizeVaultError(query.error),
      data: NO_PERMISSIONS,
    }, () => { void query.refetch(); }];
  }
  if (query.isPending || !query.data) {
    return [{ status: 'loading', data: NO_PERMISSIONS }, () => { void query.refetch(); }];
  }
  return [{ status: 'success', data: query.data }, () => { void query.refetch(); }];
}
