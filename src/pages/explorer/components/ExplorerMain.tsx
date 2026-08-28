import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { NavigationPath } from '@/application/navigation-history/navigation-history';
import { useKvSearch, type KvSearchMountState } from '@/application/vault/search/KvSearchContext';
import { rankKvPathMatches } from '@/application/vault/search/search-ranking';
import type { KvSecretDetails, VaultQueryState } from '@/application/vault/useKvExplorerData';
import type { KvActionPermissions } from '@/application/vault/useKvActionPermissions';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import Tooltip from '@/components/base/Tooltip';
import type { KvV2Mount } from '@/domain/vault/contracts';
import type { KvPathEntry } from '@/domain/vault/search';
import BulkToolbar from './BulkToolbar';
import ExplorerSearch, { type ExplorerSearchScope } from './ExplorerSearch';
import Inspector from './Inspector';
import InspectorDock from './InspectorDock';
import OpenExactPathForm from './OpenExactPathForm';
import PathBreadcrumbs from './PathBreadcrumbs';
import SearchResults from './SearchResults';
import SecretTable, { type KvDirectoryEntry } from './SecretTable';
import {
  emptySecretSelection,
  hiddenSelectionCount,
  selectionForScope,
  toggleAllVisibleSecrets,
  updateSecretSelection,
} from './bulk/selection';

interface ExplorerMainProps {
  readonly mount: string;
  readonly currentPath: string;
  readonly mounts: readonly KvV2Mount[];
  readonly directory: VaultQueryState<readonly string[]>;
  readonly selectedPath: string | null;
  readonly details: VaultQueryState<KvSecretDetails>;
  readonly onSelectSecret: (path: string) => void;
  readonly onNavigateToFolder: (path: string) => void;
  readonly onNavigateToBreadcrumb: (path: string) => void;
  readonly onRefresh: () => void;
  readonly onRetrySecret: () => void;
  readonly onCreateSecret?: () => void;
  readonly onOpenExactPath?: (path: string) => void;
  readonly onConfigureMount?: () => void;
  readonly onViewSecret?: () => void;
  readonly onEditSecret?: () => void;
  readonly onWriteOnlySecret?: () => void;
  readonly permissions?: KvActionPermissions;
  readonly onCompare?: () => void;
  readonly onDeleteLatest?: (version: number) => void;
  readonly onDeleteVersion?: (version: number) => void;
  readonly onUndelete?: (version: number) => void;
  readonly onDestroyVersion?: (version: number) => void;
  readonly onDeleteMetadata?: () => void;
  readonly onEditMetadata?: () => void;
  readonly onDeletePermanently?: (path: string) => void;
  readonly isFavorite?: (path: NavigationPath) => boolean;
  readonly onToggleFavorite?: (path: NavigationPath) => void;
  readonly onClipboardFeedback?: (
    kind: 'path' | 'paths' | 'cli' | 'secret-value',
    success: boolean,
  ) => void;
  readonly onBulkSoftDelete?: (paths: readonly string[]) => void;
  readonly onBulkDestroy?: (paths: readonly string[]) => void;
  readonly onBulkPermanentDelete?: (paths: readonly string[]) => void;
  readonly selectionClearKey?: number;
}

function entriesFromKeys(currentPath: string, keys: readonly string[]): readonly KvDirectoryEntry[] {
  return keys.map((key) => {
    const folder = key.endsWith('/');
    const name = key.replace(/\/$/, '');
    return { kind: folder ? 'folder' as const : 'secret' as const, name, path: `${currentPath}${key}` };
  }).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export default function ExplorerMain(props: ExplorerMainProps) {
  const { mount, currentPath, directory, selectedPath, selectionClearKey = 0 } = props;
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState('data');
  const searchModel = useExplorerSearchModel(mount, currentPath, directory);
  const selectionModel = useExplorerSelectionModel({
    ...props,
    selectionClearKey,
    visibleSecretPaths: searchModel.visibleSecretPaths,
  });
  const clipboard = useDirectoryClipboard(props.onClipboardFeedback);

  useEffect(() => {
    if (!selectedPath) return;
    setInspectorOpen(true);
    setInspectorTab('data');
  }, [selectedPath]);

  return (
    <InspectorDock
      open={inspectorOpen}
      path={selectedPath ? `${mount}/${selectedPath}` : null}
      onOpen={() => setInspectorOpen(true)}
      onClose={() => setInspectorOpen(false)}
      renderInspector={({ exitFullScreen }) => (
        <ExplorerInspector
          {...props}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          exitFullScreen={exitFullScreen}
        />
      )}
    >
      <ExplorerDirectory
        {...props}
        searchModel={searchModel}
        selectionModel={selectionModel}
        clipboard={clipboard}
      />
    </InspectorDock>
  );
}

function ExplorerInspector({
  mount,
  selectedPath,
  details,
  onRetrySecret,
  onViewSecret,
  onEditSecret,
  onWriteOnlySecret,
  permissions,
  onCompare,
  onDeleteLatest,
  onDeleteVersion,
  onUndelete,
  onDestroyVersion,
  onDeleteMetadata,
  onEditMetadata,
  isFavorite,
  onToggleFavorite,
  onClipboardFeedback,
  activeTab,
  onTabChange,
  exitFullScreen,
}: ExplorerMainProps & {
  readonly activeTab: string;
  readonly onTabChange: (tab: string) => void;
  readonly exitFullScreen: () => void;
}) {
  const leaveFullScreenThen = (action: (() => void) | undefined) => action
    ? () => {
        exitFullScreen();
        action();
      }
    : undefined;
  const navigationPath: NavigationPath | null = selectedPath
    ? { mount, path: selectedPath, kind: 'secret' }
    : null;
  return (
    <Inspector
      state={details}
      mount={mount}
      path={selectedPath}
      onRetry={onRetrySecret}
      onView={leaveFullScreenThen(onViewSecret)}
      onEdit={leaveFullScreenThen(onEditSecret)}
      onWriteOnly={leaveFullScreenThen(onWriteOnlySecret)}
      permissions={permissions}
      onCompare={onCompare}
      onDeleteLatest={onDeleteLatest}
      onDeleteVersion={onDeleteVersion}
      onUndelete={onUndelete}
      onDestroyVersion={onDestroyVersion}
      onDeleteMetadata={onDeleteMetadata}
      onEditMetadata={onEditMetadata}
      activeTab={activeTab}
      onTabChange={onTabChange}
      favorite={Boolean(navigationPath && isFavorite?.(navigationPath))}
      onToggleFavorite={navigationPath && onToggleFavorite
        ? () => onToggleFavorite(navigationPath)
        : undefined}
      onClipboardFeedback={(success) => onClipboardFeedback?.('secret-value', success)}
    />
  );
}

interface ExplorerSearchModel {
  readonly search: ReturnType<typeof useKvSearch>;
  readonly searchQuery: string;
  readonly setSearchQuery: (query: string) => void;
  readonly searchScope: ExplorerSearchScope;
  readonly setSearchScope: (scope: ExplorerSearchScope) => void;
  readonly entries: readonly KvDirectoryEntry[];
  readonly searchMatches: ReturnType<typeof rankKvPathMatches>;
  readonly indexState: KvSearchMountState;
  readonly folderIndexState: KvSearchMountState;
  readonly showMountSearchResults: boolean;
  readonly visibleEntries: readonly KvDirectoryEntry[];
  readonly visibleSecretPaths: readonly string[];
}

function useExplorerSearchModel(
  mount: string,
  currentPath: string,
  directory: VaultQueryState<readonly string[]>,
): ExplorerSearchModel {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<ExplorerSearchScope>('folder');
  const search = useKvSearch();
  const entries = useMemo(() => entriesFromKeys(currentPath, directory.data ?? []), [currentPath, directory.data]);
  const folderPathEntries = useMemo<readonly KvPathEntry[]>(() => entries.map((entry) => ({ ...entry, mount })), [entries, mount]);
  const indexState = search.stateFor(mount);
  const searchMatches = useMemo(() => searchScope === 'folder'
    ? rankKvPathMatches(folderPathEntries, searchQuery)
    : search.matches(mount, searchQuery), [folderPathEntries, mount, search, searchQuery, searchScope]);
  const folderIndexState = useMemo<KvSearchMountState>(() => ({
    mount,
    status: 'complete',
    entries: folderPathEntries,
    pendingPrefixes: [],
    visitedPrefixes: [currentPath],
    inaccessiblePrefixes: [],
    failedPrefixes: [],
    totalListRequests: 0,
    totalScannedPrefixes: 1,
  }), [currentPath, folderPathEntries, mount]);
  const visibleEntries = useMemo<readonly KvDirectoryEntry[]>(() => (
    searchScope === 'folder' && searchQuery.trim().length > 0
      ? searchMatches.map(({ entry: { kind, name, path } }) => ({ kind, name, path }))
      : entries
  ), [entries, searchMatches, searchQuery, searchScope]);
  const visibleSecretPaths = useMemo(() => visibleEntries
    .filter((entry) => entry.kind === 'secret')
    .map((entry) => entry.path), [visibleEntries]);

  useEffect(() => search.activateMount(mount), [mount, search]);
  useEffect(() => {
    if (searchScope !== 'mount' || searchQuery.trim().length < 2) {
      if (indexState.status === 'scanning') search.cancel(mount);
      return;
    }
    const timer = setTimeout(() => search.start(mount), 250);
    return () => clearTimeout(timer);
  }, [indexState.status, mount, search, searchQuery, searchScope]);

  return {
    search,
    searchQuery,
    setSearchQuery,
    searchScope,
    setSearchScope,
    entries,
    searchMatches,
    indexState,
    folderIndexState,
    showMountSearchResults: searchScope === 'mount',
    visibleEntries,
    visibleSecretPaths,
  };
}

interface ExplorerSelectionModel {
  readonly selectedPaths: readonly string[];
  readonly hiddenSelectedCount: number;
  readonly clear: () => void;
  readonly copyPaths: () => Promise<void>;
  readonly updateFavorites: (favorite: boolean) => void;
  readonly selectEntry: (entry: KvDirectoryEntry, checked: boolean, range: boolean) => void;
  readonly toggleAll: () => void;
}

function useExplorerSelectionModel({
  mount,
  currentPath,
  visibleSecretPaths,
  selectionClearKey,
  isFavorite,
  onToggleFavorite,
  onClipboardFeedback,
}: Pick<ExplorerMainProps, 'mount' | 'currentPath' | 'isFavorite' | 'onToggleFavorite' | 'onClipboardFeedback'> & {
  readonly visibleSecretPaths: readonly string[];
  readonly selectionClearKey: number;
}): ExplorerSelectionModel {
  const selectionScope = `${mount}\u001f${currentPath}`;
  const [selection, setSelection] = useState(() => emptySecretSelection(selectionScope));
  const selectedPaths = selectionForScope(selection, selectionScope).paths;
  const clear = () => setSelection(emptySecretSelection(selectionScope));

  useEffect(() => {
    setSelection(emptySecretSelection(selectionScope));
  }, [selectionClearKey, selectionScope]);
  useEffect(() => {
    if (selectedPaths.length === 0) return;
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      setSelection(emptySecretSelection(selectionScope));
    };
    document.addEventListener('keydown', clearOnEscape);
    return () => document.removeEventListener('keydown', clearOnEscape);
  }, [selectedPaths.length, selectionScope]);

  const copyPaths = async () => {
    try {
      await navigator.clipboard.writeText(selectedPaths.map((path) => `${mount}/${path}`).join('\n'));
      onClipboardFeedback?.('paths', true);
    } catch {
      onClipboardFeedback?.('paths', false);
    }
  };
  const updateFavorites = (favorite: boolean) => {
    if (!onToggleFavorite) return;
    selectedPaths.forEach((path) => {
      const navigationPath: NavigationPath = { mount, path, kind: 'secret' };
      if (Boolean(isFavorite?.(navigationPath)) !== favorite) onToggleFavorite(navigationPath);
    });
  };
  const selectEntry = (entry: KvDirectoryEntry, checked: boolean, range: boolean) => {
    setSelection((current) => updateSecretSelection({
      selection: current,
      scope: selectionScope,
      visibleSecretPaths,
      path: entry.path,
      checked,
      range,
    }));
  };
  const toggleAll = () => setSelection((current) => toggleAllVisibleSecrets({
    selection: current,
    scope: selectionScope,
    visibleSecretPaths,
  }));
  return {
    selectedPaths,
    hiddenSelectedCount: hiddenSelectionCount(selectedPaths, visibleSecretPaths),
    clear,
    copyPaths,
    updateFavorites,
    selectEntry,
    toggleAll,
  };
}

interface DirectoryClipboard {
  readonly copiedTarget: 'path' | 'cli' | null;
  readonly copy: (value: string, target: 'path' | 'cli') => Promise<void>;
}

function useDirectoryClipboard(
  onClipboardFeedback: ExplorerMainProps['onClipboardFeedback'],
): DirectoryClipboard {
  const [copiedTarget, setCopiedTarget] = useState<'path' | 'cli' | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  const copy = async (value: string, target: 'path' | 'cli') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedTarget(null), 1_500);
      onClipboardFeedback?.(target, true);
    } catch {
      setCopiedTarget(null);
      onClipboardFeedback?.(target, false);
    }
  };
  return { copiedTarget, copy };
}

interface ExplorerDirectoryProps extends ExplorerMainProps {
  readonly searchModel: ExplorerSearchModel;
  readonly selectionModel: ExplorerSelectionModel;
  readonly clipboard: DirectoryClipboard;
}

function ExplorerDirectory(props: ExplorerDirectoryProps) {
  const { selectionModel, onBulkSoftDelete, onBulkDestroy, onBulkPermanentDelete } = props;
  const { selectedPaths } = selectionModel;
  return (
    <section aria-labelledby="directory-heading" className="flex min-w-0 flex-1 flex-col">
      <ExplorerDirectoryHeader {...props} />
      <BulkToolbar
        selectedCount={selectedPaths.length}
        hiddenSelectedCount={selectionModel.hiddenSelectedCount}
        onCopyPaths={() => void selectionModel.copyPaths()}
        onPin={() => selectionModel.updateFavorites(true)}
        onUnpin={() => selectionModel.updateFavorites(false)}
        onClear={selectionModel.clear}
        onSoftDelete={onBulkSoftDelete ? () => onBulkSoftDelete(selectedPaths) : undefined}
        onDestroy={onBulkDestroy ? () => onBulkDestroy(selectedPaths) : undefined}
        onPermanentDelete={onBulkPermanentDelete ? () => onBulkPermanentDelete(selectedPaths) : undefined}
      />
      <ExplorerDirectoryBody {...props} />
    </section>
  );
}

function isDirectoryListDenied(directory: ExplorerMainProps['directory']): boolean {
  return directory.status === 'error' && !directory.data && directory.error.code === 'authorization';
}

function ExplorerDirectoryHeader({
  mount,
  currentPath,
  mounts,
  directory,
  onNavigateToBreadcrumb,
  onRefresh,
  onOpenExactPath,
  onConfigureMount,
  onCreateSecret,
  searchModel,
  clipboard,
}: ExplorerDirectoryProps) {
  const [exactPathOpen, setExactPathOpen] = useState(false);
  const currentMount = mounts.find((candidate) => candidate.path === mount);
  const denied = isDirectoryListDenied(directory);
  const openExactPath = (path: string) => {
    setExactPathOpen(false);
    onOpenExactPath?.(path);
  };
  return (
    <header className="shrink-0 border-b border-background-200 px-4 py-3">
      <PathBreadcrumbs mount={mount} currentPath={currentPath} onNavigate={onNavigateToBreadcrumb} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">KV version 2</p>
          <div className="flex items-center gap-2">
            <h1 id="directory-heading" className="text-sm font-semibold text-foreground-900">{currentMount?.description || `${mount}/`}</h1>
            {directory.status === 'success' && <span className="text-xs text-foreground-400">{searchModel.searchQuery.trim().length > 0 ? `${searchModel.searchMatches.length} matches` : `${searchModel.entries.length} items`}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip content="Refresh directory"><button type="button" aria-label="Refresh directory" onClick={onRefresh} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"><i className={`${directory.status === 'loading' ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} text-sm`} aria-hidden="true" /></button></Tooltip>
          <Tooltip content={clipboard.copiedTarget === 'path' ? 'Path copied' : 'Copy logical path'}><button type="button" aria-label="Copy logical path" onClick={() => void clipboard.copy(`${mount}/${currentPath}`, 'path')} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"><i className={`${clipboard.copiedTarget === 'path' ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} text-sm`} aria-hidden="true" /></button></Tooltip>
          <Tooltip content={clipboard.copiedTarget === 'cli' ? 'CLI command copied' : 'Copy Vault CLI command'}><button type="button" aria-label="Copy Vault CLI command" onClick={() => void clipboard.copy(`vault kv list -mount=${mount} ${currentPath || '/'}`, 'cli')} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"><i className={`${clipboard.copiedTarget === 'cli' ? 'ri-check-line text-success-600' : 'ri-terminal-line'} text-sm`} aria-hidden="true" /></button></Tooltip>
          {onOpenExactPath && !denied && <Button size="sm" onClick={() => setExactPathOpen((open) => !open)} aria-expanded={exactPathOpen}><i className="ri-route-line" aria-hidden="true" /> Open exact path</Button>}
          {onConfigureMount && <Button size="sm" onClick={onConfigureMount}><i className="ri-settings-3-line" aria-hidden="true" /> Configure mount</Button>}
          {onCreateSecret && <Button size="sm" variant="primary" onClick={onCreateSecret}><i className="ri-add-line" aria-hidden="true" /> Create secret</Button>}
        </div>
      </div>
      {exactPathOpen && onOpenExactPath && !denied && <div className="mt-3 rounded-lg border border-background-200 bg-background-100 p-3"><OpenExactPathForm mount={mount} autoFocus onCancel={() => setExactPathOpen(false)} onOpen={openExactPath} /></div>}
      <div className="mt-3"><ExplorerSearch query={searchModel.searchQuery} scope={searchModel.searchScope} onQueryChange={searchModel.setSearchQuery} onScopeChange={searchModel.setSearchScope} /></div>
    </header>
  );
}

function ExplorerDirectoryBody(props: ExplorerDirectoryProps) {
  const {
    mount,
    directory,
    selectedPath,
    onSelectSecret,
    onNavigateToFolder,
    onRefresh,
    onCreateSecret,
    onOpenExactPath,
    isFavorite,
    onToggleFavorite,
    onDeletePermanently,
    searchModel,
    selectionModel,
  } = props;
  let content: ReactNode = null;
  if (directory.status === 'loading' && !directory.data) {
    content = <ContentSkeleton label="Loading directory" variant="list" />;
  } else if (directory.status === 'error' && !directory.data) {
    content = <DirectoryError directory={directory} mount={mount} onRefresh={onRefresh} onOpenExactPath={onOpenExactPath} />;
  } else if (directory.data && searchModel.showMountSearchResults) {
    content = <MountSearchResults mount={mount} searchModel={searchModel} onSelectSecret={onSelectSecret} onNavigateToFolder={onNavigateToFolder} />;
  } else if (directory.data) {
    content = (
      <SecretTable
        entries={searchModel.visibleEntries}
        selectedPath={selectedPath}
        onSelectSecret={onSelectSecret}
        onNavigateToFolder={onNavigateToFolder}
        onCreateSecret={onCreateSecret}
        emptyReason={searchModel.searchQuery.trim().length > 0 ? 'filter' : 'folder'}
        isFavorite={isFavorite ? (entry) => isFavorite({ ...entry, mount }) : undefined}
        onToggleFavorite={onToggleFavorite ? (entry) => onToggleFavorite({ ...entry, mount }) : undefined}
        onDeletePermanently={onDeletePermanently}
        selectedPaths={selectionModel.selectedPaths}
        onSelectionChange={selectionModel.selectEntry}
        onToggleSelectAll={selectionModel.toggleAll}
      />
    );
  }
  return <div className="flex-1 overflow-y-auto">{content}</div>;
}

function DirectoryError({
  directory,
  mount,
  onRefresh,
  onOpenExactPath,
}: Pick<ExplorerMainProps, 'directory' | 'mount' | 'onRefresh' | 'onOpenExactPath'>) {
  if (directory.status !== 'error') return null;
  const authorizationDenied = directory.error.code === 'authorization';
  return (
    <div role="alert" className="m-4 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
      <p className="font-semibold">{authorizationDenied ? 'This folder is outside your Vault policy' : 'Directory could not be loaded'}</p>
      <p className="mt-1 text-xs leading-5">{directory.error.message}</p>
      {authorizationDenied && onOpenExactPath ? (
        <div className="mt-3 rounded-md border border-warning-200 bg-background-50 p-3 text-foreground-800">
          <p className="mb-2 text-xs text-foreground-600">If you know an exact secret path, open it without listing this folder.</p>
          <OpenExactPathForm mount={mount} onOpen={onOpenExactPath} />
        </div>
      ) : <button type="button" onClick={onRefresh} className="mt-2 text-xs font-medium underline underline-offset-2">Retry</button>}
    </div>
  );
}

function MountSearchResults({
  mount,
  searchModel,
  onSelectSecret,
  onNavigateToFolder,
}: Pick<ExplorerMainProps, 'mount' | 'onSelectSecret' | 'onNavigateToFolder'> & {
  readonly searchModel: ExplorerSearchModel;
}) {
  const { search, searchQuery, searchScope, searchMatches, indexState, folderIndexState } = searchModel;
  return (
    <SearchResults
      query={searchQuery}
      scope={searchScope}
      matches={searchMatches}
      indexState={searchScope === 'mount' ? indexState : folderIndexState}
      onOpen={(entry) => {
        if (entry.kind === 'folder') onNavigateToFolder(entry.path);
        else onSelectSecret(entry.path);
      }}
      onCancel={() => search.cancel(mount)}
      onContinue={() => search.continueScan(mount)}
      onRetry={() => {
        if (indexState.pendingPrefixes.length > 0) search.continueScan(mount);
        else search.restart(mount);
      }}
    />
  );
}
