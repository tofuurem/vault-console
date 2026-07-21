import { useState } from 'react';
import Tooltip from '@/components/base/Tooltip';
import type { VaultMount, VaultSecret, VaultConnection } from '@/mocks/vault';
import { getFolderPaths, getChildrenForPath } from '@/mocks/vault';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mounts: VaultMount[];
  connection: VaultConnection;
  activeMount: string;
  activePath: string;
  onMountSelect: (mount: string) => void;
  onPathSelect: (mount: string, path: string) => void;
  showAccessControl?: boolean;
  activeAccessSection?: string;
  onAccessSectionSelect?: (section: string) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isFolder: boolean;
  children: TreeNode[];
}

function buildTree(mount: string): TreeNode[] {
  const allFolders = getFolderPaths(mount);
  const root: { [key: string]: TreeNode } = {};

  allFolders.forEach((folderPath) => {
    const relative = folderPath.replace(mount, '');
    if (!relative) return;
    const parts = relative.split('/').filter(Boolean);
    let currentPath = mount;
    let parentKey = '__root__';

    parts.forEach((part, idx) => {
      currentPath += part + '/';
      const nodeKey = currentPath;
      if (!root[nodeKey]) {
        root[nodeKey] = {
          name: part + '/',
          fullPath: currentPath,
          isFolder: true,
          children: [],
        };
        if (parentKey === '__root__') {
          if (!root.__root_list) {
            (root as any).__root_list = [];
          }
          (root as any).__root_list.push(root[nodeKey]);
        } else {
          root[parentKey].children.push(root[nodeKey]);
        }
      }
      parentKey = nodeKey;
    });
  });

  return (root as any).__root_list || [];
}

const accessSections = [
  { key: 'users', label: 'Users', icon: 'ri-user-settings-line' },
  { key: 'groups', label: 'Groups', icon: 'ri-group-line' },
  { key: 'roles', label: 'Roles', icon: 'ri-shield-check-line' },
  { key: 'policies', label: 'Policy Explorer', icon: 'ri-file-code-line' },
];

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mounts,
  connection,
  activeMount,
  activePath,
  onMountSelect,
  onPathSelect,
  showAccessControl,
  activeAccessSection,
  onAccessSectionSelect,
}: SidebarProps) {
  const [expandedMounts, setExpandedMounts] = useState<Set<string>>(new Set(['applications/', 'platform/']));
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleMount = (name: string) => {
    setExpandedMounts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderTreeNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedFolders.has(node.fullPath);
    const isActive = activePath === node.fullPath && activeMount === node.fullPath.replace(/\/.*$/, '') + '/';
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.fullPath}>
        <button
          onClick={() => {
            if (hasChildren) toggleFolder(node.fullPath);
            onPathSelect(activeMount, node.fullPath);
          }}
          className={`w-full flex items-center gap-1 h-6 text-xs cursor-pointer transition-colors rounded
            ${isActive ? 'bg-primary-100 text-primary-700' : 'text-foreground-600 hover:bg-background-200 hover:text-foreground-800'}`}
          style={{ paddingLeft: `${12 + depth * 12}px`, paddingRight: '6px' }}
        >
          {hasChildren && (
            isExpanded
              ? <i className="ri-arrow-down-s-line text-[10px] text-foreground-400 shrink-0" />
              : <i className="ri-arrow-right-s-line text-[10px] text-foreground-400 shrink-0" />
          )}
          {!hasChildren && <span className="w-2.5 shrink-0" />}
          <i className="ri-folder-3-line text-xs text-amber-500 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (collapsed) {
    return (
      <div className="w-11 shrink-0 border-r border-background-200 bg-background-100 flex flex-col items-center py-3 gap-1">
        <Tooltip content="Expand sidebar" position="right">
          <button onClick={onToggleCollapse} className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-200 cursor-pointer">
            <i className="ri-layout-right-2-line text-sm" />
          </button>
        </Tooltip>
        {mounts.map((m) => (
          <Tooltip key={m.name} content={m.name} position="right">
            <button
              onClick={() => onMountSelect(m.name)}
              className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-xs ${
                activeMount === m.name ? 'bg-primary-100 text-primary-700' : 'text-foreground-400 hover:bg-background-200'
              }`}
            >
              <i className="ri-folder-keyhole-line text-sm" />
            </button>
          </Tooltip>
        ))}
        {showAccessControl && (
          <>
            <div className="w-6 h-px bg-background-300 my-1" />
            {accessSections.map((s) => (
              <Tooltip key={s.key} content={s.label} position="right">
                <button
                  onClick={() => onAccessSectionSelect?.(s.key)}
                  className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-xs ${
                    activeAccessSection === s.key ? 'bg-primary-100 text-primary-700' : 'text-foreground-400 hover:bg-background-200'
                  }`}
                >
                  <i className={`${s.icon} text-sm`} />
                </button>
              </Tooltip>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="w-[260px] shrink-0 border-r border-background-200 bg-background-100 flex flex-col">
      <div className="flex items-center justify-between px-3 h-9 border-b border-background-200">
        <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Secrets</span>
        <Tooltip content="Collapse sidebar" position="right">
          <button onClick={onToggleCollapse} className="w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
            <i className="ri-layout-left-2-line text-xs" />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {mounts
          .filter((m) => connection.permissions.mounts.includes(m.name))
          .map((mount) => {
            const isExpanded = expandedMounts.has(mount.name);
            const tree = buildTree(mount.name);
            return (
              <div key={mount.name}>
                <button
                  onClick={() => {
                    toggleMount(mount.name);
                    onMountSelect(mount.name);
                  }}
                  className={`w-full flex items-center gap-1.5 h-7 text-xs cursor-pointer transition-colors ${
                    activeMount === mount.name && activePath === mount.name
                      ? 'bg-primary-100 text-primary-700 font-medium'
                      : 'text-foreground-700 hover:bg-background-200'
                  }`}
                  style={{ paddingLeft: '8px', paddingRight: '8px' }}
                >
                  <i className={isExpanded ? 'ri-arrow-down-s-line text-[10px] text-foreground-400 shrink-0' : 'ri-arrow-right-s-line text-[10px] text-foreground-400 shrink-0'} />
                  <i className="ri-folder-keyhole-line text-xs text-primary-500 shrink-0" />
                  <span className="font-mono text-xs truncate">{mount.name}</span>
                </button>
                {isExpanded && tree.map((node) => renderTreeNode(node, 1))}
              </div>
            );
          })}

        {showAccessControl && (
          <div className="mt-3 pt-3 border-t border-background-200">
            <div className="px-3 h-6 flex items-center">
              <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Access Control</span>
            </div>
            {accessSections.map((section) => (
              <button
                key={section.key}
                onClick={() => onAccessSectionSelect?.(section.key)}
                className={`w-full flex items-center gap-2 h-7 text-xs cursor-pointer transition-colors ${
                  activeAccessSection === section.key
                    ? 'bg-primary-100 text-primary-700 font-medium'
                    : 'text-foreground-700 hover:bg-background-200'
                }`}
                style={{ paddingLeft: '8px', paddingRight: '8px' }}
              >
                <i className={`${section.icon} text-xs shrink-0`} />
                <span className="truncate">{section.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-background-200 text-[10px] text-foreground-400 space-y-0.5">
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${connection.sealed ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <span>{connection.sealed ? 'Sealed' : 'Unsealed'}</span>
        </div>
        <div>TLS: {connection.tls_enabled ? 'Enabled' : 'Disabled'}</div>
        <div className="font-mono">v{connection.vault_version}</div>
      </div>
    </div>
  );
}