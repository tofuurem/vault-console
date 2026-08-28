import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useNavigationHistory } from '@/application/navigation-history/NavigationHistoryContext';
import { useToast } from '@/application/notifications/ToastContext';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { kvActionPaths } from '@/application/vault/useKvActionPermissions';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import { directoryPathForSecret, explorerRoute } from '@/router/explorer-route';
import type { KvDestructiveAction } from '../components/DestructionConfirm';

export interface DestructiveUiState {
  readonly mount: string;
  readonly path: string;
  readonly directoryPath: string;
  readonly action: KvDestructiveAction;
}

interface ExplorerDestructiveControllerOptions {
  readonly activeMount: string;
  readonly selectedPath: string | null;
  readonly refreshPath: (mount: string, path: string) => Promise<void>;
  readonly clearSelection: () => void;
}

export function useExplorerDestructiveController({
  activeMount,
  selectedPath,
  refreshPath,
  clearSelection,
}: ExplorerDestructiveControllerOptions) {
  const navigate = useNavigate();
  const vault = useVaultSession();
  const session = vault.session!;
  const kvGateway = useKvV2Gateway();
  const toast = useToast();
  const { removeSecretPaths } = useNavigationHistory();
  const [target, setTarget] = useState<DestructiveUiState | null>(null);

  const reportFailure = (cause: unknown, title: string) => {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired') vault.expireSession();
    else toast.error(error.message, { title });
  };
  const undoDeletedVersion = async (mount: string, path: string, version: number) => {
    try {
      await kvGateway.undeleteVersions(session, mount, path, [version]);
      await refreshPath(mount, path);
      toast.success(`Restored version ${version} of ${mount}/${path}.`);
    } catch (cause) {
      reportFailure(cause, `Undo failed for ${mount}/${path} v${version}`);
    }
  };
  const undeleteVersion = async (version: number) => {
    if (!selectedPath) return;
    try {
      await kvGateway.undeleteVersions(session, activeMount, selectedPath, [version]);
      await refreshPath(activeMount, selectedPath);
      toast.success(`Undeleted version ${version} of ${activeMount}/${selectedPath}.`);
    } catch (cause) {
      reportFailure(cause, 'Version undelete failed');
    }
  };
  const openSelected = (action: KvDestructiveAction) => {
    if (!selectedPath) return;
    setTarget({
      mount: activeMount,
      path: selectedPath,
      directoryPath: directoryPathForSecret(selectedPath),
      action,
    });
  };
  const beginPermanentDelete = async (path: string) => {
    const metadataPath = kvActionPaths(activeMount, path).metadata;
    try {
      const capabilities = await vault.queryCapabilities([metadataPath]);
      const available = capabilities[metadataPath] ?? [];
      const denied = available.includes('deny')
        || (!available.includes('root') && !available.includes('delete'));
      if (denied) {
        toast.warning(`Your Vault policy cannot delete ${metadataPath}.`);
        return;
      }
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') {
        vault.expireSession();
        return;
      }
      if (error.code === 'aborted') return;
      // Capability discovery is advisory. The exact Vault request is authoritative.
    }
    setTarget({
      mount: activeMount,
      path,
      directoryPath: directoryPathForSecret(path),
      action: { kind: 'delete-key' },
    });
  };
  const executeAction = async (
    action: KvDestructiveAction,
    targetMount: string,
    targetPath: string,
  ): Promise<number | undefined> => {
    let affectedVersion = action.kind === 'delete-key' ? undefined : action.version;
    if (action.kind === 'delete-latest') {
      await kvGateway.deleteLatestSecret(session, targetMount, targetPath);
      try {
        const metadata = await kvGateway.readSecretMetadata(session, targetMount, targetPath);
        affectedVersion = metadata.currentVersion;
      } catch {
        // The delete succeeded; retain the version from the confirmed snapshot.
      }
    }
    if (action.kind === 'delete-version') {
      await kvGateway.deleteVersions(session, targetMount, targetPath, [action.version]);
    }
    if (action.kind === 'destroy-version') {
      await kvGateway.destroyVersions(session, targetMount, targetPath, [action.version]);
    }
    if (action.kind === 'delete-key') {
      await kvGateway.deleteMetadata(session, targetMount, targetPath);
    }
    return affectedVersion;
  };
  const confirm = async (action: KvDestructiveAction) => {
    if (!target) throw new VaultError('invalid-request');
    const { mount, path, directoryPath } = target;
    try {
      const affectedVersion = await executeAction(action, mount, path);
      if (action.kind === 'delete-latest' || action.kind === 'delete-version') {
        toast.action(`Version ${affectedVersion} of ${mount}/${path} was soft-deleted.`, {
          label: 'Undo',
          onAction: () => void undoDeletedVersion(mount, path, affectedVersion!),
        });
      } else {
        toast.success(action.kind === 'delete-key'
          ? `Permanently deleted ${mount}/${path}.`
          : `Permanently destroyed version ${action.version} of ${mount}/${path}.`);
      }
      await refreshPath(mount, path);
      if (action.kind === 'delete-key' && selectedPath === path) {
        navigate(explorerRoute(mount, directoryPath));
      }
      if (action.kind === 'delete-key') {
        removeSecretPaths(mount, [path]);
        clearSelection();
      }
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') vault.expireSession();
      else toast.error(error.message, { title: 'Destructive operation failed' });
      throw error;
    }
  };

  return {
    target,
    close: () => setTarget(null),
    openSelected,
    beginPermanentDelete,
    confirm,
    undeleteVersion,
  };
}
