import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuthenticatedShell } from '@/app/authenticated-shell';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { kvActionPaths, useKvActionPermissions } from '@/application/vault/useKvActionPermissions';
import { useKvDirectory, useKvSecretDetails } from '@/application/vault/useKvExplorerData';
import type { VaultCapability } from '@/domain/vault/contracts';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import { directoryPathFromWildcard, explorerRoute } from '@/router/explorer-route';
import CreateSecretDrawer from './components/CreateSecretDrawer';
import DestructionConfirm, { type KvDestructiveAction } from './components/DestructionConfirm';
import ExplorerMain from './components/ExplorerMain';
import SecretWorkspace, { type SecretWorkspaceMode } from './components/SecretWorkspace';
import VersionComparison from './components/VersionComparison';

const NO_MOUNTS = [] as const;

export default function ExplorerPage() {
  const navigate = useNavigate();
  const params = useParams<{ mount?: string; '*': string }>();
  const [searchParams] = useSearchParams();
  const { mountsState, refreshMounts } = useAuthenticatedShell();
  const vault = useVaultSession();
  const kvGateway = useKvV2Gateway();
  const session = vault.session!;
  const mounts = mountsState.data ?? NO_MOUNTS;
  const activeMount = params.mount ? decodeURIComponent(params.mount) : '';
  const activePath = directoryPathFromWildcard(params['*']);
  const selectedPath = searchParams.get('secret');
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<SecretWorkspaceMode | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<KvDestructiveAction | null>(null);
  const [mutationNotice, setMutationNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [directory, refreshDirectory] = useKvDirectory(session, activeMount, activePath);
  const [permissionsState, refreshPermissions] = useKvActionPermissions(activeMount, selectedPath);
  const [details, refreshDetails] = useKvSecretDetails(
    session,
    activeMount,
    selectedPath,
    permissionsState,
  );

  useEffect(() => {
    if (mountsState.status !== 'success' || !mounts.length) return;
    if (!mounts.some((mount) => mount.path === activeMount)) {
      navigate(explorerRoute(mounts[0].path), { replace: true });
    }
  }, [activeMount, mounts, mountsState.status, navigate]);

  useEffect(() => {
    const errors = [
      directory.status === 'error' ? directory.error : undefined,
      details.status === 'error' ? details.error : undefined,
      permissionsState.status === 'error' ? permissionsState.error : undefined,
    ];
    if (errors.some((error) => error?.code === 'session-expired')) vault.expireSession();
  }, [details, directory, permissionsState, vault]);

  const selectSecret = (path: string) => {
    navigate(explorerRoute(activeMount, activePath, path));
  };
  const navigateFolder = (path: string) => {
    navigate(explorerRoute(activeMount, path));
  };
  const selectedDetails = details.status === 'success' ? details.data : undefined;
  const selectedPermissionScope = selectedPath ? `${activeMount}/data/${selectedPath}` : '';
  const selectedPermissions = permissionsState.data?.scope === selectedPermissionScope
    ? permissionsState.data
    : undefined;

  const ensureCapability = async (path: string, capability: VaultCapability) => {
    const result = await vault.queryCapabilities([path]);
    const available = result[path] ?? [];
    if (available.includes('deny') || (!available.includes('root') && !available.includes(capability))) {
      throw new VaultError('authorization');
    }
  };
  const handleMutationError = (cause: unknown): never => {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired') vault.expireSession();
    throw error;
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
      const version = await kvGateway.writeSecret(session, activeMount, path, data, 0);
      navigate(explorerRoute(activeMount, activePath, path));
      refreshDirectory();
      setMutationNotice({ kind: 'success', message: `Created ${activeMount}/${path} at version ${version}.` });
    } catch (cause) { handleMutationError(cause); }
  };
  const editSecret = async (data: Readonly<Record<string, unknown>>) => {
    if (!selectedPath || !selectedDetails?.secret) throw new VaultError('invalid-request');
    try {
      const path = kvActionPaths(activeMount, selectedPath).data;
      await ensureCapability(path, 'update');
      const version = await kvGateway.writeSecret(
        session,
        activeMount,
        selectedPath,
        data,
        selectedDetails.secret.metadata.version,
      );
      refreshSelected();
      setMutationNotice({ kind: 'success', message: `Saved version ${version} with check-and-set.` });
    } catch (cause) { handleMutationError(cause); }
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
        selectedDetails.history.currentVersion,
      );
      refreshSelected();
      setMutationNotice({ kind: 'success', message: `Restored v${version} as new version ${restoredVersion}.` });
    } catch (cause) { handleMutationError(cause); }
  };
  const undeleteVersion = async (version: number) => {
    if (!selectedPath) return;
    try {
      await kvGateway.undeleteVersions(session, activeMount, selectedPath, [version]);
      refreshSelected();
      setMutationNotice({ kind: 'success', message: `Undeleted version ${version}.` });
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') vault.expireSession();
      setMutationNotice({ kind: 'error', message: error.message });
    }
  };
  const confirmDestructiveAction = async (action: KvDestructiveAction) => {
    if (!selectedPath) throw new VaultError('invalid-request');
    try {
      if (action.kind === 'delete-latest') await kvGateway.deleteLatestVersion(session, activeMount, selectedPath);
      if (action.kind === 'delete-version') await kvGateway.deleteVersions(session, activeMount, selectedPath, [action.version]);
      if (action.kind === 'destroy-version') await kvGateway.destroyVersions(session, activeMount, selectedPath, [action.version]);
      if (action.kind === 'delete-metadata') await kvGateway.deleteMetadata(session, activeMount, selectedPath);
      setMutationNotice({
        kind: 'success',
        message: action.kind === 'delete-metadata' ? `Deleted ${activeMount}/${selectedPath}.` : `Applied ${action.kind} to version ${action.version}.`,
      });
      if (action.kind === 'delete-metadata') navigate(explorerRoute(activeMount, activePath));
      else refreshSelected();
      refreshDirectory();
    } catch (cause) { handleMutationError(cause); }
  };

  const content = mountsState.status === 'loading' && !mountsState.data ? (
    <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center" aria-label="Loading KV v2 mounts">
      <div className="text-center">
        <i className="ri-loader-4-line animate-spin text-xl text-primary-500" aria-hidden="true" />
        <p className="mt-2 text-xs text-foreground-500">Discovering visible KV v2 mounts…</p>
      </div>
    </main>
  ) : mountsState.status === 'error' && !mountsState.data ? (
    <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center p-6">
      <div role="alert" className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">KV mounts could not be discovered</p>
        <p className="mt-1 text-xs leading-5">{mountsState.error.message}</p>
        <button type="button" onClick={refreshMounts} className="mt-3 text-xs font-medium underline underline-offset-2">Retry</button>
      </div>
    </main>
  ) : mounts.length === 0 ? (
    <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background-200">
          <i className="ri-folder-shield-2-line text-xl text-foreground-400" aria-hidden="true" />
        </div>
        <h1 className="text-sm font-semibold text-foreground-800">No visible KV v2 mounts</h1>
        <p className="mt-1 text-xs leading-5 text-foreground-500">Vault only returns mounts available to this token. Ask an administrator for metadata access if a mount is missing.</p>
      </div>
    </main>
  ) : (
    <ExplorerMain
      mount={activeMount}
      currentPath={activePath}
      mounts={mounts}
      directory={directory}
      selectedPath={selectedPath}
      details={details}
      onSelectSecret={selectSecret}
      onNavigateToFolder={navigateFolder}
      onNavigateToBreadcrumb={navigateFolder}
      onRefresh={refreshDirectory}
      onRetrySecret={refreshDetails}
      onCreateSecret={() => setCreateOpen(true)}
      onOpenSecret={selectedDetails?.secret ? () => setWorkspaceMode('view') : undefined}
      onEditSecret={selectedDetails?.secret ? () => setWorkspaceMode('edit') : undefined}
      permissions={selectedPermissions}
      onCompare={selectedDetails?.history && selectedPermissions?.canReadData ? () => setCompareOpen(true) : undefined}
      onDeleteLatest={(version) => setDestructiveAction({ kind: 'delete-latest', version })}
      onDeleteVersion={(version) => setDestructiveAction({ kind: 'delete-version', version })}
      onUndelete={(version) => void undeleteVersion(version)}
      onDestroyVersion={(version) => setDestructiveAction({ kind: 'destroy-version', version })}
      onDeleteMetadata={(version) => setDestructiveAction({ kind: 'delete-metadata', version })}
    />
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {mutationNotice && (
        <div role={mutationNotice.kind === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 border-b px-4 py-1.5 text-xs ${mutationNotice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <i className={mutationNotice.kind === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} aria-hidden="true" />
          <span>{mutationNotice.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setMutationNotice(null)} className="ml-auto"><i className="ri-close-line" aria-hidden="true" /></button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">{content}</div>

      <CreateSecretDrawer open={createOpen} onClose={() => setCreateOpen(false)} mount={activeMount} currentPath={activePath} onSave={createSecret} />
      <SecretWorkspace
        open={workspaceMode !== null}
        initialMode={workspaceMode ?? 'view'}
        secret={selectedDetails?.secret}
        canEdit={Boolean(selectedPermissions?.canEdit)}
        onClose={() => setWorkspaceMode(null)}
        onSave={editSecret}
      />
      <VersionComparison
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        mount={activeMount}
        path={selectedPath}
        history={selectedDetails?.history}
        currentSecret={selectedDetails?.secret}
        loadVersion={loadVersion}
        onRestore={restoreVersion}
      />
      <DestructionConfirm
        open={Boolean(destructiveAction)}
        onClose={() => setDestructiveAction(null)}
        mount={activeMount}
        path={selectedPath}
        action={destructiveAction}
        onConfirm={confirmDestructiveAction}
      />
    </div>
  );
}
