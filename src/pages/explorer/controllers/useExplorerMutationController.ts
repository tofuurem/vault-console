import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/application/notifications/ToastContext';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { kvActionPaths } from '@/application/vault/useKvActionPermissions';
import type { KvSecretDetails } from '@/application/vault/useKvExplorerData';
import type { VaultCapability } from '@/domain/vault/contracts';
import type {
  KvV2MountConfig,
  KvV2SecretMetadataInput,
  KvV2WriteStrategy,
} from '@/domain/vault/kv-v2';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import { explorerRoute } from '@/router/explorer-route';
import { useExplorerRefreshController } from './useExplorerRefreshController';

interface ExplorerMutationControllerOptions {
  readonly activeMount: string;
  readonly activePath: string;
  readonly selectedPath: string | null;
  readonly selectedDetails?: KvSecretDetails;
  readonly refreshDirectory: () => void;
  readonly refreshDetails: () => void;
  readonly refreshPermissions: () => void;
}

export function useExplorerMutationController({
  activeMount,
  activePath,
  selectedPath,
  selectedDetails,
  refreshDirectory,
  refreshDetails,
  refreshPermissions,
}: ExplorerMutationControllerOptions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const vault = useVaultSession();
  const session = vault.session!;
  const kvGateway = useKvV2Gateway();
  const toast = useToast();
  const refresh = useExplorerRefreshController();

  const fail = (cause: unknown, title: string): never => {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired') vault.expireSession();
    else toast.error(error.message, { title });
    throw error;
  };
  const ensureCapability = async (path: string, capability: VaultCapability) => {
    const result = await vault.queryCapabilities([path]);
    const available = result[path] ?? [];
    const denied = available.includes('deny')
      || (!available.includes('root') && !available.includes(capability));
    if (denied) throw new VaultError('authorization');
  };
  const refreshSelected = () => {
    refreshDirectory();
    refreshDetails();
    refreshPermissions();
  };

  const createSecret = async (name: string, data: Readonly<Record<string, unknown>>) => {
    const path = `${activePath}${name}`;
    try {
      await ensureCapability(kvActionPaths(activeMount, path).data, 'create');
      const version = await kvGateway.writeSecret(
        session, activeMount, path, data, { type: 'create-only' },
      );
      navigate(explorerRoute(activeMount, activePath, path));
      refreshDirectory();
      toast.success(`Created ${activeMount}/${path} at version ${version}.`);
    } catch (cause) { fail(cause, 'Secret creation failed'); }
  };
  const editSecret = async (data: Readonly<Record<string, unknown>>) => {
    if (!selectedPath || !selectedDetails?.secret) throw new VaultError('invalid-request');
    try {
      await ensureCapability(kvActionPaths(activeMount, selectedPath).data, 'update');
      const version = await kvGateway.writeSecret(
        session,
        activeMount,
        selectedPath,
        data,
        { type: 'check-and-set', version: selectedDetails.secret.metadata.version },
      );
      refreshSelected();
      toast.success(`Saved ${activeMount}/${selectedPath} as version ${version} with check-and-set.`);
    } catch (cause) { fail(cause, 'Secret update failed'); }
  };
  const writeOnlySecret = async (
    data: Readonly<Record<string, unknown>>,
    strategy: KvV2WriteStrategy,
  ) => {
    if (!selectedPath) throw new VaultError('invalid-request');
    try {
      const version = await kvGateway.writeSecret(
        session, activeMount, selectedPath, data, strategy,
      );
      refreshSelected();
      const guard = strategy.type === 'check-and-set'
        ? `CAS ${strategy.version}`
        : strategy.type === 'create-only' ? 'CAS 0' : 'no CAS';
      toast.success(`Wrote ${activeMount}/${selectedPath} as version ${version} with ${guard}.`);
    } catch (cause) { fail(cause, 'Write-only secret update failed'); }
  };
  const loadSecretMetadata = useCallback((
    mount: string,
    path: string,
    signal: AbortSignal,
  ) => kvGateway.readSecretMetadata(session, mount, path, signal), [kvGateway, session]);
  const saveSecretMetadata = async (
    mount: string,
    path: string,
    input: KvV2SecretMetadataInput,
  ) => {
    try {
      await kvGateway.updateSecretMetadata(session, mount, path, input);
      await refresh.refreshPath(mount, path);
      toast.success(`Updated key metadata for ${mount}/${path}.`);
    } catch (cause) { fail(cause, 'Key metadata update failed'); }
  };
  const loadMountConfig = useCallback((mount: string, signal: AbortSignal) => (
    kvGateway.readMountConfig(session, mount, signal)
  ), [kvGateway, session]);
  const saveMountConfig = async (mount: string, input: KvV2MountConfig) => {
    try {
      await kvGateway.updateMountConfig(session, mount, input);
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.mountConfig(mount) });
      toast.success(`Updated KV v2 mount configuration for ${mount}.`);
    } catch (cause) { fail(cause, 'KV mount configuration update failed'); }
  };
  const loadVersion = useCallback(async (version: number) => {
    if (!selectedPath) throw new VaultError('invalid-request');
    return kvGateway.readSecret(session, activeMount, selectedPath, version);
  }, [activeMount, kvGateway, selectedPath, session]);
  const restoreVersion = async (version: number, data: Readonly<Record<string, unknown>>) => {
    if (!selectedPath || !selectedDetails?.history) throw new VaultError('invalid-request');
    try {
      await ensureCapability(kvActionPaths(activeMount, selectedPath).data, 'update');
      const restoredVersion = await kvGateway.writeSecret(
        session,
        activeMount,
        selectedPath,
        data,
        { type: 'check-and-set', version: selectedDetails.history.currentVersion },
      );
      refreshSelected();
      toast.success(`Restored v${version} as new version ${restoredVersion}.`);
    } catch (cause) { fail(cause, 'Version restore failed'); }
  };

  return {
    ...refresh,
    createSecret,
    editSecret,
    writeOnlySecret,
    loadSecretMetadata,
    saveSecretMetadata,
    loadMountConfig,
    saveMountConfig,
    loadVersion,
    restoreVersion,
  };
}
