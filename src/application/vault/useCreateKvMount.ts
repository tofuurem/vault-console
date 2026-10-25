import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type { VaultCapabilityMap } from '@/domain/vault/contracts';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import type { CreateKvV2Mount } from '@/domain/vault/kv-mount';
import { useKvV2Gateway } from './KvV2GatewayContext';
import { useVaultSession } from './VaultSessionContext';

const PERMISSION_STALE_MS = 10_000;

export type MountCreationPermission =
  | { readonly state: 'allowed' }
  | { readonly state: 'denied' }
  | { readonly state: 'unknown'; readonly reason: string };

export function resolveMountCreationPermission(
  path: string,
  capabilities: VaultCapabilityMap,
): MountCreationPermission {
  const values = capabilities[`sys/mounts/${path}`] ?? [];
  if (values.includes('deny')) return { state: 'denied' };
  if (values.includes('root')) return { state: 'allowed' };
  const canWrite = values.includes('create') || values.includes('update');
  return canWrite && values.includes('sudo')
    ? { state: 'allowed' }
    : { state: 'denied' };
}

function useReadMountCreationPermission() {
  const { queryCapabilities } = useVaultSession();
  return useCallback(async (
    targetPath: string,
    signal?: AbortSignal,
  ): Promise<MountCreationPermission> => {
    try {
      const capabilities = await queryCapabilities([`sys/mounts/${targetPath}`], signal);
      return resolveMountCreationPermission(targetPath, capabilities);
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired' || error.code === 'aborted') throw error;
      return {
        state: 'unknown',
        reason: 'Vault could not preflight this permission. The create request remains authoritative.',
      };
    }
  }, [queryCapabilities]);
}

/** Advisory preflight for creating a secrets engine at `path`. */
export function useKvMountCreationPermission(path: string, enabled: boolean) {
  const readPermission = useReadMountCreationPermission();
  return useQuery({
    queryKey: vaultQueryKeys.mountCreationPermission(path),
    queryFn: ({ signal }) => readPermission(path, signal),
    enabled: enabled && Boolean(path),
    staleTime: PERMISSION_STALE_MS,
  });
}

/**
 * Creates a KV v2 mount after a fresh permission check. A confirmed denial
 * stops the request; an unknown preflight leaves the decision to Vault.
 */
export function useCreateKvMount(onCreated: (mount: CreateKvV2Mount) => void) {
  const vault = useVaultSession();
  const gateway = useKvV2Gateway();
  const queryClient = useQueryClient();
  const readPermission = useReadMountCreationPermission();
  return useMutation({
    mutationFn: async (mount: CreateKvV2Mount) => {
      const session = vault.session;
      if (!session) throw new VaultError('session-expired');
      const decision = await queryClient.fetchQuery({
        queryKey: vaultQueryKeys.mountCreationPermission(mount.path),
        queryFn: ({ signal }) => readPermission(mount.path, signal),
        staleTime: PERMISSION_STALE_MS,
      });
      if (decision.state === 'denied') {
        throw new VaultError('authorization', { status: 403 });
      }
      await gateway.createKvV2Mount(session, mount);
    },
    onSuccess: async (_result, mount) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.mounts() });
      onCreated(mount);
    },
  });
}
