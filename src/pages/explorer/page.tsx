import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { kvActionPaths, useKvActionPermissions } from '@/application/vault/useKvActionPermissions';
import { useKvDirectory, useKvMounts, useKvSecretDetails } from '@/application/vault/useKvExplorerData';
import Sidebar from '@/components/feature/Sidebar';
import TopBar from '@/components/feature/TopBar';
import type { VaultCapability } from '@/domain/vault/contracts';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import CreateSecretDrawer from './components/CreateSecretDrawer';
import DestructionConfirm, { type KvDestructiveAction } from './components/DestructionConfirm';
import ExplorerMain from './components/ExplorerMain';
import SecretWorkspace, { type SecretWorkspaceMode } from './components/SecretWorkspace';
import VersionComparison from './components/VersionComparison';

const NO_MOUNTS = [] as const;

interface ExplorerLocationState {
  readonly activeMount?: string;
  readonly notice?: string;
}

export default function ExplorerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const vault = useVaultSession();
  const kvGateway = useKvV2Gateway();
  const session = vault.session!;
  const [mountsState, refreshMounts] = useKvMounts(session);
  const mounts = mountsState.data ?? NO_MOUNTS;
  const locationState = location.state as ExplorerLocationState | null;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMount, setActiveMount] = useState(locationState?.activeMount ?? '');
  const [activePath, setActivePath] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<SecretWorkspaceMode | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<KvDestructiveAction | null>(null);
  const [mutationNotice, setMutationNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [directory, refreshDirectory] = useKvDirectory(session, activeMount, activePath);
  const [details, refreshDetails] = useKvSecretDetails(session, activeMount, selectedPath);
  const [permissionsState, refreshPermissions] = useKvActionPermissions(activeMount, selectedPath);
  const accessNotice = locationState?.notice === 'access-control-denied';

  useEffect(() => {
    if (mountsState.status !== 'success') return;
    if (!mounts.length) {
      setActiveMount('');
      return;
    }
    if (!mounts.some((mount) => mount.path === activeMount)) {
      setActiveMount(mounts[0].path);
      setActivePath('');
      setSelectedPath(null);
    }
  }, [activeMount, mounts, mountsState.status]);

  useEffect(() => {
    const errors = [
      mountsState.status === 'error' ? mountsState.error : undefined,
      directory.status === 'error' ? directory.error : undefined,
      details.status === 'error' ? details.error : undefined,
      permissionsState.status === 'error' ? permissionsState.error : undefined,
    ];
    if (errors.some((error) => error?.code === 'session-expired')) vault.expireSession();
  }, [details, directory, mountsState, permissionsState, vault]);

  const selectMount = (mount: string) => {
    setActiveMount(mount);
    setActivePath('');
    setSelectedPath(null);
  };
  const navigateFolder = (path: string) => {
    setActivePath(path);
    setSelectedPath(null);
  };
  const signOut = () => {
    vault.signOut();
    navigate('/login', { replace: true });
  };
  const selectAccessSection = (section: string) => navigate('/access-control', { state: { activeSection: section } });
  const selectedDetails = details.status === 'success' ? details.data : undefined;

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
      setSelectedPath(path);
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
    if (!selectedPath || !selectedDetails) throw new VaultError('invalid-request');
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
      if (action.kind === 'delete-metadata') setSelectedPath(null);
      else refreshSelected();
      refreshDirectory();
    } catch (cause) { handleMutationError(cause); }
  };

  return (
    <div className="flex h-full flex-col bg-background-50">
      <TopBar session={session} health={vault.health} onSignOut={signOut} onCommandPalette={() => setCommandPaletteOpen(true)} />
      {accessNotice && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-700" role="status">
          <i className="ri-shield-user-line shrink-0 text-sm" aria-hidden="true" />
          <span>Your Vault policy does not allow access-control administration.</span>
        </div>
      )}
      {mutationNotice && (
        <div role="status" className={`flex items-center gap-2 border-b px-4 py-1.5 text-xs ${mutationNotice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <i className={mutationNotice.kind === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} aria-hidden="true" />
          <span>{mutationNotice.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setMutationNotice(null)} className="ml-auto"><i className="ri-close-line" aria-hidden="true" /></button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          mounts={mounts}
          vaultHealth={vault.health}
          serverUrl={session.serverUrl}
          activeMount={activeMount}
          activePath={activePath}
          onMountSelect={selectMount}
          showAccessControl={vault.canManageAccess}
          onAccessSectionSelect={selectAccessSection}
        />

        {mountsState.status === 'loading' && !mountsState.data ? (
          <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center" aria-label="Loading KV v2 mounts"><div className="text-center"><i className="ri-loader-4-line animate-spin text-xl text-primary-500" aria-hidden="true" /><p className="mt-2 text-xs text-foreground-500">Discovering visible KV v2 mounts…</p></div></main>
        ) : mountsState.status === 'error' && !mountsState.data ? (
          <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center p-6"><div role="alert" className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-semibold">KV mounts could not be discovered</p><p className="mt-1 text-xs leading-5">{mountsState.error.message}</p><button type="button" onClick={refreshMounts} className="mt-3 text-xs font-medium underline underline-offset-2">Retry</button></div></main>
        ) : mounts.length === 0 ? (
          <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center p-6"><div className="max-w-md text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background-200"><i className="ri-folder-shield-2-line text-xl text-foreground-400" aria-hidden="true" /></div><h1 className="text-sm font-semibold text-foreground-800">No visible KV v2 mounts</h1><p className="mt-1 text-xs leading-5 text-foreground-500">Vault only returns mounts available to this token. Ask an administrator for metadata access if a mount is missing.</p></div></main>
        ) : (
          <ExplorerMain
            mount={activeMount}
            currentPath={activePath}
            mounts={mounts}
            directory={directory}
            selectedPath={selectedPath}
            details={details}
            onSelectSecret={setSelectedPath}
            onNavigateToFolder={navigateFolder}
            onNavigateToBreadcrumb={navigateFolder}
            onRefresh={refreshDirectory}
            onRetrySecret={refreshDetails}
            onCreateSecret={() => setCreateOpen(true)}
            onOpenSecret={selectedDetails?.secret ? () => setWorkspaceMode('view') : undefined}
            onEditSecret={selectedDetails?.secret ? () => setWorkspaceMode('edit') : undefined}
            permissions={permissionsState.data}
            onCompare={selectedDetails ? () => setCompareOpen(true) : undefined}
            onDeleteLatest={(version) => setDestructiveAction({ kind: 'delete-latest', version })}
            onDeleteVersion={(version) => setDestructiveAction({ kind: 'delete-version', version })}
            onUndelete={(version) => void undeleteVersion(version)}
            onDestroyVersion={(version) => setDestructiveAction({ kind: 'destroy-version', version })}
            onDeleteMetadata={(version) => setDestructiveAction({ kind: 'delete-metadata', version })}
          />
        )}
      </div>

      <CreateSecretDrawer open={createOpen} onClose={() => setCreateOpen(false)} mount={activeMount} currentPath={activePath} onSave={createSecret} />
      <SecretWorkspace
        open={workspaceMode !== null}
        initialMode={workspaceMode ?? 'view'}
        secret={selectedDetails?.secret}
        canEdit={Boolean(permissionsState.data?.canEdit)}
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

      {commandPaletteOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh]">
          <button type="button" aria-label="Close command palette" className="absolute inset-0 bg-black/30" onClick={() => setCommandPaletteOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative w-[min(500px,calc(100vw-32px))] overflow-hidden rounded-lg border border-background-300 bg-background-50 shadow-sm">
            <div className="flex h-9 items-center gap-2 border-b border-background-200 px-3"><i className="ri-terminal-box-line text-sm text-foreground-400" aria-hidden="true" /><span className="text-xs text-foreground-500">Web terminal is planned for a later release.</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
