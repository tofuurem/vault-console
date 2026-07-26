import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthenticatedShell } from '@/app/authenticated-shell';
import { useNavigationHistory } from '@/application/navigation-history/NavigationHistoryContext';
import { useToast } from '@/application/notifications/ToastContext';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type {
  BulkDestroyPreflight,
  BulkDestroyTarget,
} from '@/application/vault/bulk/bulk-destroy';
import type {
  BulkSoftDeletePreflight,
} from '@/application/vault/bulk/bulk-soft-delete';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { kvActionPaths, useKvActionPermissions } from '@/application/vault/useKvActionPermissions';
import { useKvDirectory, useKvSecretDetails } from '@/application/vault/useKvExplorerData';
import type { VaultCapability } from '@/domain/vault/contracts';
import { summarizeBulkOutcomes } from '@/domain/vault/bulk-operation';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import {
  directoryPathForSecret,
  directoryPathFromWildcard,
  explorerRoute,
} from '@/router/explorer-route';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';
import CreateSecretDrawer from './components/CreateSecretDrawer';
import DestructionConfirm, { type KvDestructiveAction } from './components/DestructionConfirm';
import ExplorerMain from './components/ExplorerMain';
import SecretWorkspace, { type SecretWorkspaceMode } from './components/SecretWorkspace';
import VersionComparison from './components/VersionComparison';

const NO_MOUNTS = [] as const;
const BulkDestroyDialog = lazy(() => import('./components/BulkDestroyDialog'));
const BulkSoftDeleteDialog = lazy(
  () => import('./components/BulkSoftDeleteDialog'),
);

interface BulkSoftDeleteUiState {
  readonly mount: string;
  readonly directoryPath: string;
  readonly paths: readonly string[];
  readonly status: 'preparing' | 'ready' | 'submitting' | 'error';
  readonly preflight?: BulkSoftDeletePreflight;
  readonly error?: string;
}

interface BulkDestroyUiState {
  readonly mount: string;
  readonly directoryPath: string;
  readonly paths: readonly string[];
  readonly status: 'preparing' | 'ready' | 'submitting' | 'error';
  readonly preflight?: BulkDestroyPreflight;
  readonly error?: string;
}

export default function ExplorerPage() {
  const navigate = useNavigate();
  const params = useParams<{ mount?: string; '*': string }>();
  const [searchParams] = useSearchParams();
  const { mountsState, refreshMounts } = useAuthenticatedShell();
  const vault = useVaultSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    recordRecent,
    isFavorite,
    toggleFavorite,
  } = useNavigationHistory();
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
  const [bulkSoftDelete, setBulkSoftDelete] = useState<BulkSoftDeleteUiState | null>(null);
  const [bulkDestroy, setBulkDestroy] = useState<BulkDestroyUiState | null>(null);
  const [selectionClearKey, setSelectionClearKey] = useState(0);
  const bulkPreflightIdRef = useRef(0);
  const bulkPreflightAbortRef = useRef<AbortController | null>(null);
  const bulkDestroyPreflightIdRef = useRef(0);
  const bulkDestroyPreflightAbortRef = useRef<AbortController | null>(null);
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

  useEffect(() => () => {
    bulkPreflightAbortRef.current?.abort();
    bulkDestroyPreflightAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const errors = [
      directory.status === 'error' ? directory.error : undefined,
      details.status === 'error' ? details.error : undefined,
      permissionsState.status === 'error' ? permissionsState.error : undefined,
    ];
    if (errors.some((error) => error?.code === 'session-expired')) vault.expireSession();
  }, [details, directory, permissionsState, vault]);

  const selectSecret = (path: string) => {
    navigate(explorerRoute(activeMount, directoryPathForSecret(path), path));
  };
  const navigateFolder = (path: string) => {
    navigate(explorerRoute(activeMount, path));
  };
  const selectedDetails = details.status === 'success' ? details.data : undefined;
  const selectedPermissionScope = selectedPath ? `${activeMount}/data/${selectedPath}` : '';
  const selectedPermissions = permissionsState.data?.scope === selectedPermissionScope
    ? permissionsState.data
    : undefined;

  useEffect(() => {
    if (!selectedPath || !selectedDetails?.secret) return;
    recordRecent({
      mount: activeMount,
      path: selectedPath,
      kind: 'secret',
    });
  }, [activeMount, recordRecent, selectedDetails?.secret, selectedPath]);

  const ensureCapability = async (path: string, capability: VaultCapability) => {
    const result = await vault.queryCapabilities([path]);
    const available = result[path] ?? [];
    if (available.includes('deny') || (!available.includes('root') && !available.includes(capability))) {
      throw new VaultError('authorization');
    }
  };
  const handleMutationError = (cause: unknown, title = 'Vault operation failed'): never => {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired') vault.expireSession();
    else toast.error(error.message, { title });
    throw error;
  };
  const refreshSelected = () => {
    refreshDirectory();
    refreshDetails();
    refreshPermissions();
  };
  const refreshPath = async (mount: string, path: string) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.directory(mount, directoryPathForSecret(path)),
      }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.secretScope(mount, path),
      }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.permissions(mount, path),
      }),
    ]);
  };
  const refreshPaths = async (
    mount: string,
    directoryPath: string,
    paths: readonly string[],
  ) => {
    await queryClient.invalidateQueries({
      queryKey: vaultQueryKeys.directory(mount, directoryPath),
    });
    await mapWithConcurrency(paths, 4, async (path) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: vaultQueryKeys.secretScope(mount, path),
        }),
        queryClient.invalidateQueries({
          queryKey: vaultQueryKeys.permissions(mount, path),
        }),
      ]);
    });
  };
  const createSecret = async (name: string, data: Readonly<Record<string, unknown>>) => {
    const path = `${activePath}${name}`;
    try {
      await ensureCapability(kvActionPaths(activeMount, path).data, 'create');
      const version = await kvGateway.writeSecret(session, activeMount, path, data, 0);
      navigate(explorerRoute(activeMount, activePath, path));
      refreshDirectory();
      toast.success(`Created ${activeMount}/${path} at version ${version}.`);
    } catch (cause) { handleMutationError(cause, 'Secret creation failed'); }
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
      toast.success(`Saved ${activeMount}/${selectedPath} as version ${version} with check-and-set.`);
    } catch (cause) { handleMutationError(cause, 'Secret update failed'); }
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
      toast.success(`Restored v${version} as new version ${restoredVersion}.`);
    } catch (cause) { handleMutationError(cause, 'Version restore failed'); }
  };
  const undeleteVersion = async (version: number) => {
    if (!selectedPath) return;
    try {
      await kvGateway.undeleteVersions(session, activeMount, selectedPath, [version]);
      await refreshPath(activeMount, selectedPath);
      toast.success(`Undeleted version ${version} of ${activeMount}/${selectedPath}.`);
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') vault.expireSession();
      else toast.error(error.message, { title: 'Version undelete failed' });
    }
  };
  const undoDeletedVersion = async (
    mount: string,
    path: string,
    version: number,
  ) => {
    try {
      await kvGateway.undeleteVersions(session, mount, path, [version]);
      await refreshPath(mount, path);
      toast.success(`Restored version ${version} of ${mount}/${path}.`);
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') vault.expireSession();
      else toast.error(error.message, {
        title: `Undo failed for ${mount}/${path} v${version}`,
      });
    }
  };
  const confirmDestructiveAction = async (action: KvDestructiveAction) => {
    if (!selectedPath) throw new VaultError('invalid-request');
    const targetMount = activeMount;
    const targetPath = selectedPath;
    try {
      if (action.kind === 'delete-latest') await kvGateway.deleteLatestVersion(session, targetMount, targetPath);
      if (action.kind === 'delete-version') await kvGateway.deleteVersions(session, targetMount, targetPath, [action.version]);
      if (action.kind === 'destroy-version') await kvGateway.destroyVersions(session, targetMount, targetPath, [action.version]);
      if (action.kind === 'delete-metadata') await kvGateway.deleteMetadata(session, targetMount, targetPath);
      if (action.kind === 'delete-latest' || action.kind === 'delete-version') {
        toast.action(
          `Version ${action.version} of ${targetMount}/${targetPath} was soft-deleted.`,
          {
            label: 'Undo',
            onAction: () => void undoDeletedVersion(
              targetMount,
              targetPath,
              action.version,
            ),
          },
        );
      } else {
        toast.success(
          action.kind === 'delete-metadata'
            ? `Deleted ${targetMount}/${targetPath}.`
            : `Permanently destroyed version ${action.version} of ${targetMount}/${targetPath}.`,
        );
      }
      await refreshPath(targetMount, targetPath);
      if (action.kind === 'delete-metadata') {
        navigate(explorerRoute(activeMount, activePath));
      }
    } catch (cause) { handleMutationError(cause, 'Destructive operation failed'); }
  };

  const closeBulkSoftDelete = () => {
    bulkPreflightIdRef.current += 1;
    bulkPreflightAbortRef.current?.abort();
    bulkPreflightAbortRef.current = null;
    setBulkSoftDelete(null);
  };

  const beginBulkSoftDelete = async (
    paths: readonly string[],
    mount = activeMount,
    directoryPath = activePath,
  ) => {
    bulkPreflightIdRef.current += 1;
    const requestId = bulkPreflightIdRef.current;
    bulkPreflightAbortRef.current?.abort();
    const controller = new AbortController();
    bulkPreflightAbortRef.current = controller;
    setBulkSoftDelete({
      mount,
      directoryPath,
      paths,
      status: 'preparing',
    });
    try {
      const { prepareBulkSoftDelete } = await import(
        '@/application/vault/bulk/bulk-soft-delete'
      );
      const preflight = await prepareBulkSoftDelete({
        gateway: kvGateway,
        session,
        mount,
        paths,
        queryCapabilities: vault.queryCapabilities,
        signal: controller.signal,
      });
      if (requestId !== bulkPreflightIdRef.current) return;
      setBulkSoftDelete({
        mount,
        directoryPath,
        paths,
        status: 'ready',
        preflight,
      });
    } catch (cause) {
      if (requestId !== bulkPreflightIdRef.current) return;
      const error = normalizeVaultError(cause);
      if (error.code === 'aborted') return;
      if (error.code === 'session-expired') vault.expireSession();
      setBulkSoftDelete({
        mount,
        directoryPath,
        paths,
        status: 'error',
        error: error.message,
      });
    } finally {
      if (requestId === bulkPreflightIdRef.current) {
        bulkPreflightAbortRef.current = null;
      }
    }
  };

  const undoBulkDeletedVersions = async (
    mount: string,
    directoryPath: string,
    candidates: BulkSoftDeletePreflight['eligible'],
  ) => {
    const { undoBulkSoftDelete } = await import(
      '@/application/vault/bulk/bulk-soft-delete'
    );
    const outcomes = await undoBulkSoftDelete({
      gateway: kvGateway,
      session,
      mount,
      candidates,
    });
    const summary = summarizeBulkOutcomes(outcomes);
    const restoredPaths = outcomes
      .filter((outcome) => outcome.status === 'succeeded')
      .map((outcome) => outcome.path);
    if (restoredPaths.length > 0) {
      await refreshPaths(mount, directoryPath, restoredPaths);
      toast.success(`Restored ${restoredPaths.length} soft-deleted current versions.`);
    }
    const expired = outcomes.some((outcome) => outcome.errorCode === 'session-expired');
    if (expired) vault.expireSession();
    if (summary.denied + summary.missing + summary.failed > 0) {
      toast.error(
        `${summary.denied} denied, ${summary.missing} missing, ${summary.failed} failed.`,
        { title: 'Bulk Undo was only partially completed' },
      );
    }
  };

  const confirmBulkSoftDelete = async () => {
    if (!bulkSoftDelete?.preflight || bulkSoftDelete.status !== 'ready') return;
    const operation = bulkSoftDelete;
    setBulkSoftDelete({ ...operation, status: 'submitting' });
    const { executeBulkSoftDelete } = await import(
      '@/application/vault/bulk/bulk-soft-delete'
    );
    const outcomes = await executeBulkSoftDelete({
      gateway: kvGateway,
      session,
      mount: operation.mount,
      candidates: operation.preflight.eligible,
    });
    const summary = summarizeBulkOutcomes(outcomes);
    const successfulCandidates = operation.preflight.eligible.filter(
      (candidate) => outcomes.some((outcome) => (
        outcome.path === candidate.path && outcome.status === 'succeeded'
      )),
    );
    await refreshPaths(
      operation.mount,
      operation.directoryPath,
      successfulCandidates.map((candidate) => candidate.path),
    );
    closeBulkSoftDelete();
    setSelectionClearKey((current) => current + 1);

    const undoable = successfulCandidates.filter((candidate) => candidate.canUndo);
    const withoutUndo = successfulCandidates.length - undoable.length;
    if (undoable.length > 0) {
      toast.action(
        `${successfulCandidates.length} current versions were soft-deleted.${
          withoutUndo > 0 ? ` ${withoutUndo} cannot be undone by this token.` : ''
        }`,
        {
          label: `Undo ${undoable.length}`,
          onAction: () => void undoBulkDeletedVersions(
            operation.mount,
            operation.directoryPath,
            undoable,
          ),
        },
      );
    } else if (successfulCandidates.length > 0) {
      toast.success(
        `${successfulCandidates.length} current versions were soft-deleted. Undo is not allowed by this token.`,
      );
    }

    const unsuccessful = summary.denied + summary.missing + summary.failed;
    if (unsuccessful > 0) {
      toast.warning(
        `${summary.denied} denied, ${summary.missing} missing, ${summary.failed} failed.`,
        {
          title: 'Bulk soft-delete was only partially completed',
          durationMs: null,
        },
      );
    }
    if (outcomes.some((outcome) => outcome.errorCode === 'session-expired')) {
      vault.expireSession();
    }
  };

  const closeBulkDestroy = () => {
    bulkDestroyPreflightIdRef.current += 1;
    bulkDestroyPreflightAbortRef.current?.abort();
    bulkDestroyPreflightAbortRef.current = null;
    setBulkDestroy(null);
  };

  const beginBulkDestroy = async (
    paths: readonly string[],
    mount = activeMount,
    directoryPath = activePath,
  ) => {
    bulkDestroyPreflightIdRef.current += 1;
    const requestId = bulkDestroyPreflightIdRef.current;
    bulkDestroyPreflightAbortRef.current?.abort();
    const controller = new AbortController();
    bulkDestroyPreflightAbortRef.current = controller;
    setBulkDestroy({ mount, directoryPath, paths, status: 'preparing' });
    try {
      const { prepareBulkDestroy } = await import(
        '@/application/vault/bulk/bulk-destroy'
      );
      const preflight = await prepareBulkDestroy({
        gateway: kvGateway,
        session,
        mount,
        paths,
        queryCapabilities: vault.queryCapabilities,
        signal: controller.signal,
      });
      if (requestId !== bulkDestroyPreflightIdRef.current) return;
      setBulkDestroy({
        mount,
        directoryPath,
        paths,
        status: 'ready',
        preflight,
      });
    } catch (cause) {
      if (requestId !== bulkDestroyPreflightIdRef.current) return;
      const error = normalizeVaultError(cause);
      if (error.code === 'aborted') return;
      if (error.code === 'session-expired') vault.expireSession();
      setBulkDestroy({
        mount,
        directoryPath,
        paths,
        status: 'error',
        error: error.message,
      });
    } finally {
      if (requestId === bulkDestroyPreflightIdRef.current) {
        bulkDestroyPreflightAbortRef.current = null;
      }
    }
  };

  const confirmBulkDestroy = async (
    targets: readonly BulkDestroyTarget[],
  ) => {
    if (!bulkDestroy?.preflight || bulkDestroy.status !== 'ready') return;
    const operation = bulkDestroy;
    setBulkDestroy({ ...operation, status: 'submitting' });
    const { executeBulkDestroy } = await import(
      '@/application/vault/bulk/bulk-destroy'
    );
    const outcomes = await executeBulkDestroy({
      gateway: kvGateway,
      session,
      mount: operation.mount,
      targets,
    });
    const summary = summarizeBulkOutcomes(outcomes);
    const successfulPaths = outcomes
      .filter((outcome) => outcome.status === 'succeeded')
      .map((outcome) => outcome.path);
    const destroyedVersionCount = outcomes
      .filter((outcome) => outcome.status === 'succeeded')
      .reduce((count, outcome) => count + outcome.versions.length, 0);
    await refreshPaths(
      operation.mount,
      operation.directoryPath,
      successfulPaths,
    );
    closeBulkDestroy();
    setSelectionClearKey((current) => current + 1);
    if (destroyedVersionCount > 0) {
      toast.success(
        `Permanently destroyed ${destroyedVersionCount} versions across ${successfulPaths.length} secrets.`,
      );
    }
    const unsuccessful = summary.denied + summary.missing + summary.failed;
    if (unsuccessful > 0) {
      toast.error(
        `${summary.denied} denied, ${summary.missing} missing, ${summary.failed} failed.`,
        { title: 'Bulk destroy was only partially completed' },
      );
    }
    if (outcomes.some((outcome) => outcome.errorCode === 'session-expired')) {
      vault.expireSession();
    }
  };

  const content = mountsState.status === 'loading' && !mountsState.data ? (
    <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1">
      <ContentSkeleton label="Discovering visible KV v2 mounts" />
    </main>
  ) : mountsState.status === 'error' && !mountsState.data ? (
    <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center p-6">
      <div role="alert" className="max-w-md rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
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
      onEditSecret={selectedDetails?.secret ? () => setWorkspaceMode('edit') : undefined}
      permissions={selectedPermissions}
      onCompare={selectedDetails?.history && selectedPermissions?.canReadData ? () => setCompareOpen(true) : undefined}
      onDeleteLatest={(version) => setDestructiveAction({ kind: 'delete-latest', version })}
      onDeleteVersion={(version) => setDestructiveAction({ kind: 'delete-version', version })}
      onUndelete={(version) => void undeleteVersion(version)}
      onDestroyVersion={(version) => setDestructiveAction({ kind: 'destroy-version', version })}
      onDeleteMetadata={(version) => setDestructiveAction({ kind: 'delete-metadata', version })}
      isFavorite={isFavorite}
      onToggleFavorite={toggleFavorite}
      selectionClearKey={selectionClearKey}
      onBulkSoftDelete={(paths) => void beginBulkSoftDelete(paths)}
      onBulkDestroy={(paths) => void beginBulkDestroy(paths)}
      onClipboardFeedback={(kind, success) => {
        if (!success) {
          toast.error('The browser clipboard is unavailable.', {
            title: 'Copy failed',
          });
          return;
        }
        const message = kind === 'path'
          ? 'Logical path copied.'
          : kind === 'paths'
            ? 'Selected logical paths copied.'
            : kind === 'cli' ? 'Vault CLI command copied.' : 'Secret value copied.';
        toast.success(message);
      }}
    />
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col">
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
      {bulkSoftDelete && (
        <Suspense fallback={<LazyBulkDialogFallback label="Preparing soft-delete…" />}>
          <BulkSoftDeleteDialog
            open
            mount={bulkSoftDelete.mount}
            requestedCount={bulkSoftDelete.paths.length}
            preflight={bulkSoftDelete.preflight}
            error={bulkSoftDelete.error}
            preparing={bulkSoftDelete.status === 'preparing'}
            submitting={bulkSoftDelete.status === 'submitting'}
            onClose={closeBulkSoftDelete}
            onRetry={() => void beginBulkSoftDelete(
              bulkSoftDelete.paths,
              bulkSoftDelete.mount,
              bulkSoftDelete.directoryPath,
            )}
            onConfirm={() => void confirmBulkSoftDelete()}
          />
        </Suspense>
      )}
      {bulkDestroy && (
        <Suspense fallback={<LazyBulkDialogFallback label="Preparing version destroy…" />}>
          <BulkDestroyDialog
            open
            mount={bulkDestroy.mount}
            requestedCount={bulkDestroy.paths.length}
            preflight={bulkDestroy.preflight}
            error={bulkDestroy.error}
            preparing={bulkDestroy.status === 'preparing'}
            submitting={bulkDestroy.status === 'submitting'}
            onClose={closeBulkDestroy}
            onRetry={() => void beginBulkDestroy(
              bulkDestroy.paths,
              bulkDestroy.mount,
              bulkDestroy.directoryPath,
            )}
            onConfirm={(targets) => void confirmBulkDestroy(targets)}
          />
        </Suspense>
      )}
    </div>
  );
}

function LazyBulkDialogFallback({ label }: { readonly label: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay/40">
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-background-300 bg-background-50 px-4 py-3 text-xs text-foreground-700 shadow-sm"
      >
        <i className="ri-loader-4-line animate-spin text-primary-500" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}
