import { useState, type MouseEvent } from 'react';
import type { VaultSecret } from '@/mocks/vault';
import Badge from '@/components/base/Badge';
import Tooltip from '@/components/base/Tooltip';

interface SecretTableProps {
  secrets: VaultSecret[];
  folders: string[];
  currentPath: string;
  mount: string;
  onSelectSecret: (secret: VaultSecret) => void;
  onNavigateToFolder: (path: string) => void;
  canCreate: boolean;
  onContextMenu?: (e: MouseEvent, secret: VaultSecret) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) return 'Just now';
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusVariant(state: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  switch (state) {
    case 'current': return 'success';
    case 'deleted': return 'danger';
    case 'destroyed': return 'danger';
    case 'superseded': return 'info';
    default: return 'default';
  }
}

function statusLabel(state: string): string {
  switch (state) {
    case 'current': return 'Current';
    case 'deleted': return 'Deleted';
    case 'destroyed': return 'Destroyed';
    case 'superseded': return 'Older';
    default: return state;
  }
}

export default function SecretTable({
  secrets,
  folders,
  currentPath,
  mount,
  onSelectSecret,
  onNavigateToFolder,
  canCreate,
  onContextMenu,
}: SecretTableProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const handleRowClick = (secret: VaultSecret) => {
    setSelectedPath(secret.path);
    onSelectSecret(secret);
  };

  const handleContextMenu = (e: MouseEvent, secret: VaultSecret) => {
    e.preventDefault();
    onContextMenu?.(e, secret);
  };

  const getCurrentVersion = (secret: VaultSecret) => secret.versions.find((v) => v.state === 'current') || secret.versions[0];

  if (folders.length === 0 && secrets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 mb-3 flex items-center justify-center rounded-full bg-background-200">
          <i className="ri-folder-open-line text-xl text-foreground-400" />
        </div>
        <p className="text-sm text-foreground-600 font-medium">This folder is empty</p>
        <p className="text-xs text-foreground-400 mt-1">No secrets or subfolders found</p>
        {canCreate && (
          <button className="mt-4 h-8 px-3 text-xs font-medium rounded-md bg-primary-500 text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap flex items-center gap-1.5">
            <i className="ri-add-line text-sm" />
            Create secret
          </button>
        )}
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-background-200">
          <th className="text-left px-3 py-2 text-[11px] font-medium text-foreground-500 w-8"></th>
          <th className="text-left px-0 py-2 text-[11px] font-medium text-foreground-500">Name</th>
          <th className="text-left px-3 py-2 text-[11px] font-medium text-foreground-500 w-16">Type</th>
          <th className="text-left px-3 py-2 text-[11px] font-medium text-foreground-500 w-20">Version</th>
          <th className="text-left px-3 py-2 text-[11px] font-medium text-foreground-500 w-28">Updated</th>
          <th className="text-left px-3 py-2 text-[11px] font-medium text-foreground-500 w-24">By</th>
          <th className="text-left px-3 py-2 text-[11px] font-medium text-foreground-500 w-20">Status</th>
          <th className="w-8 px-0 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {folders.map((folder) => {
          const folderName = folder.replace(currentPath, '').replace(/\/$/, '') + '/';
          return (
            <tr
              key={folder}
              onClick={() => { setSelectedPath(null); onNavigateToFolder(folder); }}
              className="border-b border-background-100 hover:bg-background-100 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2">
                <i className="ri-folder-3-line text-sm text-amber-500" />
              </td>
              <td className="px-0 py-2">
                <span className="text-sm font-medium text-foreground-800 font-mono">{folderName}</span>
              </td>
              <td className="px-3 py-2">
                <span className="text-xs text-foreground-500">Folder</span>
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-0 py-2"></td>
            </tr>
          );
        })}
        {secrets.map((secret) => {
          const cv = getCurrentVersion(secret);
          const isSelected = selectedPath === secret.path;
          return (
            <tr
              key={secret.path}
              onClick={() => handleRowClick(secret)}
              onContextMenu={(e) => handleContextMenu(e, secret)}
              className={`border-b border-background-100 cursor-pointer transition-colors ${
                isSelected ? 'bg-primary-50/50' : 'hover:bg-background-100'
              }`}
            >
              <td className="px-3 py-2">
                <i className="ri-key-2-line text-sm text-foreground-400" />
              </td>
              <td className="px-0 py-2">
                <span className="text-sm font-medium text-foreground-800 font-mono">{secret.name}</span>
              </td>
              <td className="px-3 py-2">
                <span className="text-xs text-foreground-500">Secret</span>
              </td>
              <td className="px-3 py-2">
                <span className="text-xs text-foreground-600 font-mono">v{cv.version}</span>
              </td>
              <td className="px-3 py-2">
                <span className="text-xs text-foreground-500">{formatTime(cv.created_at)}</span>
              </td>
              <td className="px-3 py-2">
                <span className="text-xs text-foreground-600">{cv.created_by}</span>
              </td>
              <td className="px-3 py-2">
                <Badge variant={statusVariant(cv.state)}>{statusLabel(cv.state)}</Badge>
              </td>
              <td className="px-0 py-2">
                <Tooltip content="More actions">
                  <button
                    onClick={(e) => { e.stopPropagation(); onContextMenu?.(e, secret); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 hover:bg-background-200 cursor-pointer"
                  >
                    <i className="ri-more-2-fill text-xs" />
                  </button>
                </Tooltip>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
