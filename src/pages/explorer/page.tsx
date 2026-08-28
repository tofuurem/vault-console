import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuthenticatedShell } from '@/app/authenticated-shell';
import { useNavigationHistory } from '@/application/navigation-history/NavigationHistoryContext';
import { useToast } from '@/application/notifications/ToastContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import {
  canAttemptKvAction,
  type KvActionPermissions,
  type KvMountConfigPermissions,
  useKvActionPermissions,
  useKvMountConfigPermissions,
} from '@/application/vault/useKvActionPermissions';
import {
  useKvDirectory,
  useKvSecretDetails,
  type KvSecretDetails,
  type VaultQueryState,
} from '@/application/vault/useKvExplorerData';
import { directoryPathForSecret, directoryPathFromWildcard, explorerRoute } from '@/router/explorer-route';
import ExplorerContent from './components/ExplorerContent';
import type ExplorerMain from './components/ExplorerMain';
import { useExplorerBulkController } from './controllers/useExplorerBulkController';
import { useExplorerDestructiveController } from './controllers/useExplorerDestructiveController';
import { useExplorerMutationController } from './controllers/useExplorerMutationController';
import { useExplorerOverlayController } from './controllers/useExplorerOverlayController';

const NO_MOUNTS = [] as const;
const ExplorerDialogs = lazy(() => import('./components/ExplorerDialogs'));

function clipboardMessage(kind: 'path' | 'paths' | 'cli' | 'secret-value'): string {
  if (kind === 'path') return 'Logical path copied.';
  if (kind === 'paths') return 'Selected logical paths copied.';
  if (kind === 'cli') return 'Vault CLI command copied.';
  return 'Secret value copied.';
}

function availableAction<T extends (...args: never[]) => void>(
  available: boolean,
  action: T,
): T | undefined {
  return available ? action : undefined;
}

function canOpenMountConfig(state: VaultQueryState<KvMountConfigPermissions>): boolean {
  if (state.status === 'error') return state.data?.discovery === 'unavailable';
  return state.status === 'success'
    && state.data.canRead === true
    && state.data.canUpdate === true;
}

function canWriteWithoutRead(
  details: KvSecretDetails | undefined,
  permissions: KvActionPermissions | undefined,
): boolean {
  return details?.dataError?.code === 'authorization'
    && (
      canAttemptKvAction(permissions, 'canCreate')
      || canAttemptKvAction(permissions, 'canUpdate')
    );
}

function canCompareVersions(
  details: KvSecretDetails | undefined,
  permissions: KvActionPermissions | undefined,
): boolean {
  return Boolean(
    details?.history
    && details.secret
    && canAttemptKvAction(permissions, 'canReadData'),
  );
}

function canEditMetadata(
  details: KvSecretDetails | undefined,
  permissions: KvActionPermissions | undefined,
): boolean {
  return Boolean(
    details?.history
    && canAttemptKvAction(permissions, 'canReadMetadata')
    && canAttemptKvAction(permissions, 'canUpdateMetadata'),
  );
}

export default function ExplorerPage() {
  const navigate = useNavigate();
  const params = useParams<{ mount?: string; '*': string }>();
  const [searchParams] = useSearchParams();
  const { mountsState, refreshMounts } = useAuthenticatedShell();
  const vault = useVaultSession();
  const toast = useToast();
  const { recordRecent, isFavorite, toggleFavorite } = useNavigationHistory();
  const session = vault.session!;
  const mounts = mountsState.data ?? NO_MOUNTS;
  const activeMount = params.mount ? decodeURIComponent(params.mount) : '';
  const activePath = directoryPathFromWildcard(params['*']);
  const selectedPath = searchParams.get('secret');
  const [selectionClearKey, setSelectionClearKey] = useState(0);
  const [directory, refreshDirectory] = useKvDirectory(session, activeMount, activePath);
  const [permissionsState, refreshPermissions] = useKvActionPermissions(activeMount, selectedPath);
  const [mountConfigPermissions] = useKvMountConfigPermissions(activeMount);
  const [details, refreshDetails] = useKvSecretDetails(
    session,
    activeMount,
    selectedPath,
    permissionsState,
  );
  const selectedDetails = details.status === 'success' ? details.data : undefined;
  const permissionScope = selectedPath ? `${activeMount}/data/${selectedPath}` : '';
  const selectedPermissions = permissionsState.data?.scope === permissionScope
    ? permissionsState.data
    : undefined;
  const clearSelection = () => setSelectionClearKey((current) => current + 1);
  const overlays = useExplorerOverlayController(activeMount, selectedPath);
  const mutations = useExplorerMutationController({
    activeMount,
    activePath,
    selectedPath,
    selectedDetails,
    refreshDirectory,
    refreshDetails,
    refreshPermissions,
  });
  const destructive = useExplorerDestructiveController({
    activeMount,
    selectedPath,
    refreshPath: mutations.refreshPath,
    clearSelection,
  });
  const bulk = useExplorerBulkController({
    activeMount,
    activePath,
    refreshPaths: mutations.refreshPaths,
    clearSelection,
  });

  useEffect(() => {
    if (mountsState.status !== 'success' || !mounts.length) return;
    if (!mounts.some((mount) => mount.path === activeMount)) {
      navigate(explorerRoute(mounts[0].path), { replace: true });
    }
  }, [activeMount, mounts, mountsState.status, navigate]);
  useEffect(() => {
    const errors = [directory, details, permissionsState, mountConfigPermissions]
      .filter((state) => state.status === 'error')
      .map((state) => state.error);
    if (errors.some((error) => error.code === 'session-expired')) vault.expireSession();
  }, [details, directory, mountConfigPermissions, permissionsState, vault]);
  useEffect(() => {
    if (!selectedPath || !selectedDetails?.secret) return;
    recordRecent({ mount: activeMount, path: selectedPath, kind: 'secret' });
  }, [activeMount, recordRecent, selectedDetails?.secret, selectedPath]);

  const selectSecret = (path: string) => {
    navigate(explorerRoute(activeMount, directoryPathForSecret(path), path));
  };
  const navigateFolder = (path: string) => navigate(explorerRoute(activeMount, path));
  const main: ComponentProps<typeof ExplorerMain> = {
    mount: activeMount,
    currentPath: activePath,
    mounts,
    directory,
    selectedPath,
    details,
    onSelectSecret: selectSecret,
    onNavigateToFolder: navigateFolder,
    onNavigateToBreadcrumb: navigateFolder,
    onRefresh: refreshDirectory,
    onRetrySecret: refreshDetails,
    onCreateSecret: overlays.create.show,
    onOpenExactPath: selectSecret,
    onConfigureMount: availableAction(canOpenMountConfig(mountConfigPermissions), overlays.mountConfig.show),
    onViewSecret: availableAction(Boolean(selectedDetails?.secret), () => overlays.workspace.show('view')),
    onEditSecret: availableAction(Boolean(selectedDetails?.secret), () => overlays.workspace.show('edit')),
    onWriteOnlySecret: availableAction(
      canWriteWithoutRead(selectedDetails, selectedPermissions),
      overlays.writeOnly.show,
    ),
    permissions: selectedPermissions,
    onCompare: availableAction(
      canCompareVersions(selectedDetails, selectedPermissions),
      overlays.comparison.show,
    ),
    onDeleteLatest: (version) => destructive.openSelected({ kind: 'delete-latest', version }),
    onDeleteVersion: (version) => destructive.openSelected({ kind: 'delete-version', version }),
    onUndelete: (version) => void destructive.undeleteVersion(version),
    onDestroyVersion: (version) => destructive.openSelected({ kind: 'destroy-version', version }),
    onDeleteMetadata: () => {
      if (selectedPath) void destructive.beginPermanentDelete(selectedPath);
    },
    onEditMetadata: availableAction(
      canEditMetadata(selectedDetails, selectedPermissions),
      overlays.metadata.show,
    ),
    onDeletePermanently: (path) => void destructive.beginPermanentDelete(path),
    isFavorite,
    onToggleFavorite: toggleFavorite,
    selectionClearKey,
    onBulkSoftDelete: (paths) => void bulk.softDelete.begin(paths),
    onBulkDestroy: (paths) => void bulk.destroy.begin(paths),
    onBulkPermanentDelete: (paths) => void bulk.deleteKeys.begin(paths),
    onClipboardFeedback: (kind, success) => {
      if (!success) {
        toast.error('The browser clipboard is unavailable.', { title: 'Copy failed' });
        return;
      }
      toast.success(clipboardMessage(kind));
    },
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1">
        <ExplorerContent
          mountsState={mountsState}
          mounts={mounts}
          refreshMounts={refreshMounts}
          main={main}
        />
      </div>
      <Suspense fallback={null}>
        <ExplorerDialogs
          activeMount={activeMount}
          activePath={activePath}
          selectedPath={selectedPath}
          selectedDetails={selectedDetails}
          selectedPermissions={selectedPermissions}
          overlays={overlays}
          mutations={mutations}
          destructive={destructive}
          bulk={bulk}
        />
      </Suspense>
    </div>
  );
}
