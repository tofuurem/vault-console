import { useState, useCallback, type MouseEvent } from 'react';
import type { VaultSecret, VaultMount } from '@/mocks/vault';
import { getChildrenForPath } from '@/mocks/vault';
import Button from '@/components/base/Button';
import Tooltip from '@/components/base/Tooltip';
import SecretTable from './SecretTable';
import Inspector from './Inspector';

interface ExplorerMainProps {
  mount: string;
  currentPath: string;
  mounts: VaultMount[];
  secrets: VaultSecret[];
  allSecrets: VaultSecret[];
  onNavigateToFolder: (path: string) => void;
  onNavigateToBreadcrumb: (path: string) => void;
  onCreateSecret: () => void;
  onEditSecret?: (secret: VaultSecret) => void;
  onVersionCompare?: (secret: VaultSecret) => void;
  onDestroy?: (secret: VaultSecret, mode: 'soft-delete' | 'destroy' | 'destroy-all') => void;
  connectionPermissions: { can_create: boolean; can_delete: boolean; can_undelete: boolean; can_destroy: boolean };
}

export default function ExplorerMain({
  mount,
  currentPath,
  mounts,
  secrets,
  allSecrets,
  onNavigateToFolder,
  onNavigateToBreadcrumb,
  onCreateSecret,
  onEditSecret,
  onVersionCompare,
  onDestroy,
  connectionPermissions,
}: ExplorerMainProps) {
  const [selectedSecret, setSelectedSecret] = useState<VaultSecret | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; secret: VaultSecret } | null>(null);
  const [clipboardPathMsg, setClipboardPathMsg] = useState('');

  const { folders, secrets: folderSecrets } = getChildrenForPath(mount, currentPath);

  const filteredSecrets = searchQuery
    ? folderSecrets.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.path.toLowerCase().includes(searchQuery.toLowerCase()))
    : folderSecrets;

  const filteredFolders = searchQuery
    ? folders.filter((f) => f.toLowerCase().includes(searchQuery.toLowerCase()))
    : folders;

  const breadcrumbs = currentPath
    .replace(mount, '')
    .split('/')
    .filter(Boolean)
    .reduce<{ label: string; path: string }[]>((acc, part, idx, arr) => {
      const path = mount + arr.slice(0, idx + 1).join('/') + '/';
      acc.push({ label: part + '/', path });
      return acc;
    }, []);

  const handleContextMenu = useCallback((e: MouseEvent, secret: VaultSecret) => {
    setContextMenu({ x: e.clientX, y: e.clientY, secret });
  }, []);

  const copyCurrentPath = () => {
    navigator.clipboard.writeText(currentPath).then(() => {
      setClipboardPathMsg('Path copied!');
      setTimeout(() => setClipboardPathMsg(''), 1500);
    });
  };

  const copyCliCmd = () => {
    const cmd = `vault kv list -mount=${mount.replace(/\/$/, '')} ${currentPath.replace(mount, '')}`;
    navigator.clipboard.writeText(cmd).then(() => {
      setClipboardPathMsg('CLI command copied!');
      setTimeout(() => setClipboardPathMsg(''), 1500);
    });
  };

  const handleEditSecret = (secret: VaultSecret) => {
    setContextMenu(null);
    onEditSecret?.(secret);
  };

  const currentMount = mounts.find((m) => m.name === mount);

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-background-200 shrink-0">
          <div className="flex items-center gap-1.5 text-xs mb-2">
            <button onClick={() => onNavigateToBreadcrumb(mount)} className="text-foreground-500 hover:text-primary-600 cursor-pointer font-mono">
              {mount}
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.path} className="flex items-center gap-1.5">
                <span className="text-foreground-300">/</span>
                <button
                  onClick={() => onNavigateToBreadcrumb(crumb.path)}
                  className={`cursor-pointer font-mono ${
                    idx === breadcrumbs.length - 1 ? 'text-foreground-900 font-medium' : 'text-foreground-500 hover:text-primary-600'
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground-900">
                {currentMount?.description || currentPath}
              </h2>
              <span className="text-xs text-foreground-400">
                {filteredFolders.length + filteredSecrets.length} items
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in this path..."
                  className="h-7 pl-6 pr-2.5 text-xs rounded-md border border-background-300 bg-background-50 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 w-44"
                />
              </div>

              <Tooltip content="Refresh">
                <button className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
                  <i className="ri-refresh-line text-sm" />
                </button>
              </Tooltip>

              <Tooltip content={clipboardPathMsg || 'Copy path'}>
                <button onClick={copyCurrentPath} className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
                  <i className="ri-file-copy-line text-sm" />
                </button>
              </Tooltip>

              <Tooltip content="Copy CLI command">
                <button onClick={copyCliCmd} className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
                  <i className="ri-terminal-line text-sm" />
                </button>
              </Tooltip>

              {connectionPermissions.can_create && (
                <Button size="sm" variant="primary" onClick={onCreateSecret}>
                  <i className="ri-add-line" />
                  Create secret
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searchQuery && filteredFolders.length === 0 && filteredSecrets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-10 h-10 mb-2 flex items-center justify-center rounded-full bg-background-200">
                <i className="ri-search-line text-lg text-foreground-400" />
              </div>
              <p className="text-sm text-foreground-600">No results for &ldquo;{searchQuery}&rdquo;</p>
              <p className="text-xs text-foreground-400 mt-1">Try a different search term</p>
            </div>
          ) : (
            <SecretTable
              secrets={filteredSecrets}
              folders={filteredFolders}
              currentPath={currentPath}
              mount={mount}
              onSelectSecret={setSelectedSecret}
              onNavigateToFolder={onNavigateToFolder}
              canCreate={connectionPermissions.can_create}
              onContextMenu={handleContextMenu}
            />
          )}
        </div>
      </div>

      {inspectorOpen && (
        <div className="w-[360px] shrink-0 border-l border-background-200 bg-background-50 flex flex-col">
          <div className="flex items-center justify-between px-3 h-9 border-b border-background-200">
            <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">
              {selectedSecret ? 'Inspector' : 'Details'}
            </span>
            <button
              onClick={() => setInspectorOpen(false)}
              className="w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer"
            >
              <i className="ri-close-line text-xs" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Inspector
              secret={selectedSecret}
              currentPath={currentPath}
              mount={mount}
              onEdit={handleEditSecret}
              onVersionCompare={onVersionCompare}
              connectionPermissions={connectionPermissions}
            />
          </div>
        </div>
      )}

      {!inspectorOpen && (
        <Tooltip content="Open inspector" position="left">
          <button
            onClick={() => setInspectorOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-12 flex items-center justify-center rounded-l-md border border-r-0 border-background-300 bg-background-50 text-foreground-400 hover:text-foreground-700 cursor-pointer"
          >
            <i className="ri-arrow-left-s-line text-sm" />
          </button>
        </Tooltip>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 w-44 rounded-md border border-background-300 bg-background-50 py-1 shadow-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => { setSelectedSecret(contextMenu.secret); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2">
              <i className="ri-eye-line text-sm" />
              View secret
            </button>
            {connectionPermissions.can_create && (
              <button
                onClick={() => handleEditSecret(contextMenu.secret)}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2">
                <i className="ri-pencil-line text-sm" />
                Edit
              </button>
            )}
            <button
              onClick={() => { navigator.clipboard.writeText(contextMenu.secret.path); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2">
              <i className="ri-file-copy-line text-sm" />
              Copy path
            </button>
            <div className="border-t border-background-200 my-1" />
            {connectionPermissions.can_delete && (
              <button
                onClick={() => { onDestroy?.(contextMenu.secret, 'soft-delete'); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2">
                <i className="ri-delete-bin-line text-sm" />
                Soft-delete
              </button>
            )}
            {connectionPermissions.can_destroy && (
              <button
                onClick={() => { onDestroy?.(contextMenu.secret, 'destroy-all'); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 cursor-pointer flex items-center gap-2">
                <i className="ri-close-circle-line text-sm" />
                Destroy all
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
