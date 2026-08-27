import { useEffect, useMemo, useRef, useState } from 'react';

import type { NavigationPath } from '@/application/navigation-history/navigation-history';
import type { WorkspaceDensity } from '@/application/preferences/workspace-preferences';
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
  readonly density?: WorkspaceDensity;
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

export default function ExplorerMain({
  mount,
  currentPath,
  mounts,
  directory,
  selectedPath,
  details,
  onSelectSecret,
  onNavigateToFolder,
  onNavigateToBreadcrumb,
  onRefresh,
  onRetrySecret,
  onCreateSecret,
  onOpenExactPath,
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
  onDeletePermanently,
  isFavorite,
  onToggleFavorite,
  onClipboardFeedback,
  onBulkSoftDelete,
  onBulkDestroy,
  onBulkPermanentDelete,
  selectionClearKey = 0,
  density = 'comfortable',
}: ExplorerMainProps) {
  const selectionScope = `${mount}\u001f${currentPath}`;
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState('data');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<ExplorerSearchScope>('folder');
  const [exactPathOpen, setExactPathOpen] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<'path' | 'cli' | null>(null);
  const [selection, setSelection] = useState(
    () => emptySecretSelection(selectionScope),
  );
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = useKvSearch();
  const entries = useMemo(() => entriesFromKeys(currentPath, directory.data ?? []), [currentPath, directory.data]);
  const folderPathEntries = useMemo<readonly KvPathEntry[]>(() => entries.map((entry) => ({
    ...entry,
    mount,
  })), [entries, mount]);
  const indexState = search.stateFor(mount);
  const searchMatches = useMemo(() => (
    searchScope === 'folder'
      ? rankKvPathMatches(folderPathEntries, searchQuery)
      : search.matches(mount, searchQuery)
  ), [folderPathEntries, mount, search, searchQuery, searchScope]);
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
  const showMountSearchResults = searchScope === 'mount';
  const visibleEntries = useMemo<readonly KvDirectoryEntry[]>(() => (
    searchScope === 'folder' && searchQuery.trim().length > 0
      ? searchMatches.map(({ entry: { kind, name, path } }) => ({
        kind,
        name,
        path,
      }))
      : entries
  ), [entries, searchMatches, searchQuery, searchScope]);
  const visibleSecretPaths = useMemo(
    () => visibleEntries
      .filter((entry) => entry.kind === 'secret')
      .map((entry) => entry.path),
    [visibleEntries],
  );
  const activeSelection = selectionForScope(selection, selectionScope);
  const selectedPaths = activeSelection.paths;
  const hiddenSelectedCount = hiddenSelectionCount(
    selectedPaths,
    visibleSecretPaths,
  );
  const currentMount = mounts.find((candidate) => candidate.path === mount);
  const directoryListDenied = directory.status === 'error'
    && !directory.data
    && directory.error.code === 'authorization';

  useEffect(() => {
    if (!selectedPath) return;
    setInspectorOpen(true);
    setInspectorTab('data');
  }, [selectedPath]);

  useEffect(() => {
    search.activateMount(mount);
  }, [mount, search]);

  useEffect(() => {
    setSelection(emptySecretSelection(selectionScope));
  }, [selectionClearKey, selectionScope]);

  useEffect(() => {
    if (selectedPaths.length === 0) return;
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (
        target instanceof Element
        && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
      ) return;
      setSelection(emptySecretSelection(selectionScope));
    };
    document.addEventListener('keydown', clearOnEscape);
    return () => document.removeEventListener('keydown', clearOnEscape);
  }, [selectedPaths.length, selectionScope]);

  useEffect(() => () => {
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
  }, []);

  useEffect(() => {
    if (searchScope !== 'mount' || searchQuery.trim().length < 2) {
      if (indexState.status === 'scanning') search.cancel(mount);
      return;
    }
    const timer = setTimeout(() => search.start(mount), 250);
    return () => clearTimeout(timer);
  }, [indexState.status, mount, search, searchQuery, searchScope]);

  const copy = async (value: string, target: 'path' | 'cli') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      clipboardTimerRef.current = setTimeout(() => setCopiedTarget(null), 1_500);
      onClipboardFeedback?.(target, true);
    } catch {
      setCopiedTarget(null);
      onClipboardFeedback?.(target, false);
    }
  };

  const copySelectedPaths = async () => {
    try {
      await navigator.clipboard.writeText(
        selectedPaths.map((path) => `${mount}/${path}`).join('\n'),
      );
      onClipboardFeedback?.('paths', true);
    } catch {
      onClipboardFeedback?.('paths', false);
    }
  };

  const updateFavorites = (favorite: boolean) => {
    if (!onToggleFavorite) return;
    selectedPaths.forEach((path) => {
      const navigationPath: NavigationPath = { mount, path, kind: 'secret' };
      if (Boolean(isFavorite?.(navigationPath)) !== favorite) {
        onToggleFavorite(navigationPath);
      }
    });
  };

  return (
    <InspectorDock
      open={inspectorOpen}
      path={selectedPath ? `${mount}/${selectedPath}` : null}
      onOpen={() => setInspectorOpen(true)}
      onClose={() => setInspectorOpen(false)}
      renderInspector={({ exitFullScreen }) => (
        <Inspector
          state={details}
          mount={mount}
          path={selectedPath}
          onRetry={onRetrySecret}
          onView={onViewSecret ? () => {
            exitFullScreen();
            onViewSecret();
          } : undefined}
          onEdit={onEditSecret ? () => {
            exitFullScreen();
            onEditSecret();
          } : undefined}
          onWriteOnly={onWriteOnlySecret ? () => {
            exitFullScreen();
            onWriteOnlySecret();
          } : undefined}
          permissions={permissions}
          onCompare={onCompare}
          onDeleteLatest={onDeleteLatest}
          onDeleteVersion={onDeleteVersion}
          onUndelete={onUndelete}
          onDestroyVersion={onDestroyVersion}
          onDeleteMetadata={onDeleteMetadata}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          favorite={Boolean(selectedPath && isFavorite?.({
            mount,
            path: selectedPath,
            kind: 'secret',
          }))}
          onToggleFavorite={selectedPath && onToggleFavorite ? () => onToggleFavorite({
            mount,
            path: selectedPath,
            kind: 'secret',
          }) : undefined}
          onClipboardFeedback={(success) => onClipboardFeedback?.('secret-value', success)}
        />
      )}
    >
      <section aria-labelledby="directory-heading" className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-background-200 px-4 py-3">
          <PathBreadcrumbs
            mount={mount}
            currentPath={currentPath}
            onNavigate={onNavigateToBreadcrumb}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">KV version 2</p>
              <div className="flex items-center gap-2">
                <h1 id="directory-heading" className="text-sm font-semibold text-foreground-900">{currentMount?.description || `${mount}/`}</h1>
                {directory.status === 'success' && (
                  <span className="text-xs text-foreground-400">
                    {searchQuery.trim().length > 0
                      ? `${searchMatches.length} matches`
                      : `${entries.length} items`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Tooltip content="Refresh directory">
                <button type="button" aria-label="Refresh directory" onClick={onRefresh} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"><i className={`${directory.status === 'loading' ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} text-sm`} aria-hidden="true" /></button>
              </Tooltip>
              <Tooltip content={copiedTarget === 'path' ? 'Path copied' : 'Copy logical path'}>
                <button type="button" aria-label="Copy logical path" onClick={() => void copy(`${mount}/${currentPath}`, 'path')} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"><i className={`${copiedTarget === 'path' ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} text-sm`} aria-hidden="true" /></button>
              </Tooltip>
              <Tooltip content={copiedTarget === 'cli' ? 'CLI command copied' : 'Copy Vault CLI command'}>
                <button type="button" aria-label="Copy Vault CLI command" onClick={() => void copy(`vault kv list -mount=${mount} ${currentPath || '/'}`, 'cli')} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"><i className={`${copiedTarget === 'cli' ? 'ri-check-line text-success-600' : 'ri-terminal-line'} text-sm`} aria-hidden="true" /></button>
              </Tooltip>
              {onOpenExactPath && !directoryListDenied && (
                <Button
                  size="sm"
                  onClick={() => setExactPathOpen((open) => !open)}
                  aria-expanded={exactPathOpen}
                >
                  <i className="ri-route-line" aria-hidden="true" /> Open exact path
                </Button>
              )}
              {onCreateSecret && <Button size="sm" variant="primary" onClick={onCreateSecret}><i className="ri-add-line" aria-hidden="true" /> Create secret</Button>}
            </div>
          </div>
          {exactPathOpen && onOpenExactPath && !directoryListDenied && (
            <div className="mt-3 rounded-lg border border-background-200 bg-background-100 p-3">
              <OpenExactPathForm
                mount={mount}
                autoFocus
                onCancel={() => setExactPathOpen(false)}
                onOpen={(path) => {
                  setExactPathOpen(false);
                  onOpenExactPath(path);
                }}
              />
            </div>
          )}
          <div className="mt-3">
            <ExplorerSearch
              query={searchQuery}
              scope={searchScope}
              onQueryChange={setSearchQuery}
              onScopeChange={setSearchScope}
            />
          </div>
        </header>

        <BulkToolbar
          selectedCount={selectedPaths.length}
          hiddenSelectedCount={hiddenSelectedCount}
          onCopyPaths={() => void copySelectedPaths()}
          onPin={() => updateFavorites(true)}
          onUnpin={() => updateFavorites(false)}
          onClear={() => setSelection(emptySecretSelection(selectionScope))}
          onSoftDelete={onBulkSoftDelete
            ? () => onBulkSoftDelete(selectedPaths)
            : undefined}
          onDestroy={onBulkDestroy
            ? () => onBulkDestroy(selectedPaths)
            : undefined}
          onPermanentDelete={onBulkPermanentDelete
            ? () => onBulkPermanentDelete(selectedPaths)
            : undefined}
        />

        <div className="flex-1 overflow-y-auto">
          {directory.status === 'loading' && !directory.data && (
            <ContentSkeleton label="Loading directory" variant="list" />
          )}
          {directory.status === 'error' && !directory.data && (
            <div role="alert" className="m-4 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
              <p className="font-semibold">{directory.error.code === 'authorization' ? 'This folder is outside your Vault policy' : 'Directory could not be loaded'}</p>
              <p className="mt-1 text-xs leading-5">{directory.error.message}</p>
              {directory.error.code === 'authorization' && onOpenExactPath ? (
                <div className="mt-3 rounded-md border border-warning-200 bg-background-50 p-3 text-foreground-800">
                  <p className="mb-2 text-xs text-foreground-600">
                    If you know an exact secret path, open it without listing this folder.
                  </p>
                  <OpenExactPathForm mount={mount} onOpen={onOpenExactPath} />
                </div>
              ) : (
                <button type="button" onClick={onRefresh} className="mt-2 text-xs font-medium underline underline-offset-2">Retry</button>
              )}
            </div>
          )}
          {directory.data && (
            showMountSearchResults ? (
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
            ) : (
              <SecretTable
                entries={visibleEntries}
                selectedPath={selectedPath}
                onSelectSecret={onSelectSecret}
                onNavigateToFolder={onNavigateToFolder}
                onCreateSecret={onCreateSecret}
                emptyReason={searchQuery.trim().length > 0 ? 'filter' : 'folder'}
                isFavorite={isFavorite ? (entry) => isFavorite({ ...entry, mount }) : undefined}
                onToggleFavorite={onToggleFavorite
                  ? (entry) => onToggleFavorite({ ...entry, mount })
                  : undefined}
                onDeletePermanently={onDeletePermanently}
                selectedPaths={selectedPaths}
                onSelectionChange={(entry, checked, range) => {
                  setSelection((current) => updateSecretSelection({
                    selection: current,
                    scope: selectionScope,
                    visibleSecretPaths,
                    path: entry.path,
                    checked,
                    range,
                  }));
                }}
                onToggleSelectAll={() => {
                  setSelection((current) => toggleAllVisibleSecrets({
                    selection: current,
                    scope: selectionScope,
                    visibleSecretPaths,
                  }));
                }}
                density={density}
              />
            )
          )}
        </div>
      </section>
    </InspectorDock>
  );
}
