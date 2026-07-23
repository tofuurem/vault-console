import { useEffect, useReducer, useState } from 'react';

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
  const [refreshSignal, refresh] = useReducer((value: number) => value + 1, 0);
  const [state, setState] = useState<VaultQueryState<KvActionPermissions>>({ status: 'idle' });

  useEffect(() => {
    if (!mount || !path) {
      setState({ status: 'idle', data: NO_PERMISSIONS });
      return;
    }
    const paths = kvActionPaths(mount, path);
    const controller = new AbortController();
    setState({ status: 'loading', data: NO_PERMISSIONS });
    vault.queryCapabilities(Object.values(paths), controller.signal).then(
      (capabilities) => setState({ status: 'success', data: resolveKvActionPermissions(capabilities, paths) }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState({ status: 'error', error, data: NO_PERMISSIONS });
      },
    );
    return () => controller.abort();
  }, [mount, path, refreshSignal, vault]);

  return [state, refresh];
}
