import { useEffect, useMemo, useState } from 'react';

import type { KvSecretDetails, VaultQueryState } from '@/application/vault/useKvExplorerData';
import type { KvActionPermissions } from '@/application/vault/useKvActionPermissions';
import Button from '@/components/base/Button';
import Tooltip from '@/components/base/Tooltip';
import type { KvV2Mount } from '@/domain/vault/contracts';
import Inspector from './Inspector';
import InspectorDock from './InspectorDock';
import SecretTable, { type KvDirectoryEntry } from './SecretTable';

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
  readonly onEditSecret?: () => void;
  readonly permissions?: KvActionPermissions;
  readonly onCompare?: () => void;
  readonly onDeleteLatest?: (version: number) => void;
  readonly onDeleteVersion?: (version: number) => void;
  readonly onUndelete?: (version: number) => void;
  readonly onDestroyVersion?: (version: number) => void;
  readonly onDeleteMetadata?: (version: number) => void;
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
  onEditSecret,
  permissions,
  onCompare,
  onDeleteLatest,
  onDeleteVersion,
  onUndelete,
  onDestroyVersion,
  onDeleteMetadata,
}: ExplorerMainProps) {
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState('data');
  const [searchQuery, setSearchQuery] = useState('');
  const [clipboardMessage, setClipboardMessage] = useState('');
  const entries = useMemo(() => entriesFromKeys(currentPath, directory.data ?? []), [currentPath, directory.data]);
  const filteredEntries = searchQuery
    ? entries.filter((entry) => entry.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;
  const breadcrumbs = currentPath.split('/').filter(Boolean).map((part, index, parts) => ({
    label: part,
    path: `${parts.slice(0, index + 1).join('/')}/`,
  }));
  const currentMount = mounts.find((candidate) => candidate.path === mount);

  useEffect(() => {
    if (!selectedPath) return;
    setInspectorOpen(true);
    setInspectorTab('data');
  }, [selectedPath]);

  const copy = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setClipboardMessage(success);
      setTimeout(() => setClipboardMessage(''), 1_500);
    } catch {
      setClipboardMessage('Clipboard unavailable');
    }
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
          onEdit={onEditSecret ? () => {
            exitFullScreen();
            onEditSecret();
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
        />
      )}
    >
      <section aria-labelledby="directory-heading" className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-background-200 px-4 py-3">
          <nav aria-label="Secret path" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" onClick={() => onNavigateToBreadcrumb('')} className="font-mono text-foreground-500 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">{mount}/</button>
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path} className="flex items-center gap-1.5">
                <span className="text-foreground-300">/</span>
                <button type="button" onClick={() => onNavigateToBreadcrumb(crumb.path)} className={`font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${index === breadcrumbs.length - 1 ? 'font-medium text-foreground-900' : 'text-foreground-500 hover:text-primary-600'}`}>{crumb.label}/</button>
              </span>
            ))}
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">KV version 2</p>
              <div className="flex items-center gap-2">
                <h1 id="directory-heading" className="text-sm font-semibold text-foreground-900">{currentMount?.description || `${mount}/`}</h1>
                {directory.status === 'success' && <span className="text-xs text-foreground-400">{filteredEntries.length} items</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="relative hidden sm:block">
                <span className="sr-only">Search current folder</span>
                <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" aria-hidden="true" />
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Filter this folder" className="h-7 w-40 rounded-md border border-background-300 bg-background-50 pl-6 pr-2.5 text-xs text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400" />
              </label>
              <Tooltip content="Refresh directory">
                <button type="button" aria-label="Refresh directory" onClick={onRefresh} className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"><i className={`${directory.status === 'loading' ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} text-sm`} aria-hidden="true" /></button>
              </Tooltip>
              <Tooltip content={clipboardMessage || 'Copy logical path'}>
                <button type="button" aria-label="Copy logical path" onClick={() => void copy(`${mount}/${currentPath}`, 'Path copied')} className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"><i className="ri-file-copy-line text-sm" aria-hidden="true" /></button>
              </Tooltip>
              <Tooltip content="Copy Vault CLI command">
                <button type="button" aria-label="Copy Vault CLI command" onClick={() => void copy(`vault kv list -mount=${mount} ${currentPath || '/'}`, 'CLI command copied')} className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"><i className="ri-terminal-line text-sm" aria-hidden="true" /></button>
              </Tooltip>
              {onCreateSecret && <Button size="sm" variant="primary" onClick={onCreateSecret}><i className="ri-add-line" aria-hidden="true" /> Create secret</Button>}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {directory.status === 'loading' && !directory.data && (
            <div aria-label="Loading directory" className="space-y-px p-3"><div className="h-10 animate-pulse rounded bg-background-100" /><div className="h-10 animate-pulse rounded bg-background-100" /><div className="h-10 animate-pulse rounded bg-background-100" /></div>
          )}
          {directory.status === 'error' && !directory.data && (
            <div role="alert" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">{directory.error.code === 'authorization' ? 'This folder is outside your Vault policy' : 'Directory could not be loaded'}</p>
              <p className="mt-1 text-xs leading-5">{directory.error.message}</p>
              <button type="button" onClick={onRefresh} className="mt-2 text-xs font-medium underline underline-offset-2">Retry</button>
            </div>
          )}
          {directory.data && (
            searchQuery && filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center"><i className="ri-search-line mb-2 text-xl text-foreground-400" aria-hidden="true" /><p className="text-sm text-foreground-600">No matches in this folder</p></div>
            ) : (
              <SecretTable entries={filteredEntries} selectedPath={selectedPath} onSelectSecret={onSelectSecret} onNavigateToFolder={onNavigateToFolder} onCreateSecret={onCreateSecret} />
            )
          )}
        </div>
      </section>
    </InspectorDock>
  );
}
