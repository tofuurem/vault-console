import { useState, useCallback } from 'react';
import type { PermissionLevel, PathPermission } from '@/mocks/vault-acl';
import { permissionLevels } from '@/mocks/vault-acl';
import Tooltip from '@/components/base/Tooltip';

interface TreeNode {
  mount: string;
  path: string;
  name: string;
  children?: TreeNode[];
}

interface PermissionTreeProps {
  tree: TreeNode[];
  permissions: PathPermission[];
  onPermissionChange: (path: string, level: PermissionLevel) => void;
  readOnly?: boolean;
  compact?: boolean;
  showSource?: boolean;
  getEffectivePermission?: (path: string) => { level: PermissionLevel; source: string };
}

const levelColors: Record<PermissionLevel, string> = {
  none: 'text-red-600 bg-red-50 border-red-200',
  view: 'text-sky-600 bg-sky-50 border-sky-200',
  edit: 'text-amber-600 bg-amber-50 border-amber-200',
  manage: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  owner: 'text-violet-600 bg-violet-50 border-violet-200',
};

const levelIcons: Record<PermissionLevel, string> = {
  none: 'ri-forbid-line',
  view: 'ri-eye-line',
  edit: 'ri-pencil-line',
  manage: 'ri-history-line',
  owner: 'ri-shield-star-line',
};

export default function PermissionTree({
  tree,
  permissions,
  onPermissionChange,
  readOnly = false,
  compact = false,
  showSource = false,
  getEffectivePermission,
}: PermissionTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['applications/', 'platform/']));
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const getPermForPath = useCallback(
    (path: string): PathPermission | undefined => {
      return permissions.find((p) => p.path === path);
    },
    [permissions]
  );

  const getEffectiveForPath = (path: string) => {
    if (getEffectivePermission) return getEffectivePermission(path);
    return undefined;
  };

  const getLevelForPath = (path: string): PermissionLevel => {
    const perm = getPermForPath(path);
    return perm?.level || 'none';
  };

  const getIndent = (depth: number) => compact ? depth * 14 + 8 : depth * 16 + 10;

  const renderLevelSelector = (path: string, currentLevel: PermissionLevel) => {
    if (readOnly) return null;

    return (
      <select
        value={currentLevel}
        onChange={(e) => onPermissionChange(path, e.target.value as PermissionLevel)}
        onClick={(e) => e.stopPropagation()}
        className={`h-6 text-[11px] rounded border px-1.5 cursor-pointer font-medium ${levelColors[currentLevel]}`}
      >
        {permissionLevels.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
    );
  };

  const renderTreeNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedPaths.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const currentLevel = getLevelForPath(node.path);
    const perm = getPermForPath(node.path);
    const effective = getEffectiveForPath(node.path);
    const isHovered = hoveredPath === node.path;

    const explicitDeny = perm?.explicitDeny;
    const inherited = !perm || perm.inherited;
    const hasOverride = perm && !perm.inherited;

    const levelLabel = currentLevel === 'none' && !explicitDeny ? (inherited ? 'Inherited' : 'No access') : permissionLevels.find((l) => l.value === currentLevel)?.label;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-2 h-7 text-xs cursor-pointer transition-colors rounded group ${
            isHovered ? 'bg-background-100' : ''
          }`}
          style={{ paddingLeft: `${getIndent(depth)}px`, paddingRight: '8px' }}
          onClick={() => hasChildren && toggleExpand(node.path)}
          onMouseEnter={() => setHoveredPath(node.path)}
          onMouseLeave={() => setHoveredPath(null)}
        >
          {hasChildren ? (
            isExpanded ? (
              <i className="ri-arrow-down-s-line text-[10px] text-foreground-400 shrink-0" />
            ) : (
              <i className="ri-arrow-right-s-line text-[10px] text-foreground-400 shrink-0" />
            )
          ) : (
            <span className="w-2.5 shrink-0" />
          )}

          {hasChildren ? (
            <i className="ri-folder-3-line text-xs text-amber-500 shrink-0" />
          ) : (
            <i className="ri-key-2-line text-xs text-foreground-400 shrink-0" />
          )}

          <span className="font-mono text-xs text-foreground-700 truncate flex-1">{node.name}</span>

          {explicitDeny && (
            <span className="text-[10px] px-1 py-0 rounded bg-red-100 text-red-600 font-medium shrink-0">Deny</span>
          )}

          {hasOverride && !explicitDeny && (
            <span className="text-[10px] px-1 py-0 rounded bg-primary-100 text-primary-600 font-medium shrink-0">Override</span>
          )}

          {inherited && !explicitDeny && (
            <span className="text-[10px] px-1 py-0 rounded bg-background-200 text-foreground-500 font-medium shrink-0">Inherited</span>
          )}

          <Tooltip content={
            compact
              ? levelLabel || ''
              : (effective
                ? `${levelLabel}${effective.source ? ` — ${effective.source}` : ''}`
                : levelLabel || '')
          }>
            <span className={`text-[10px] px-1.5 py-0 rounded border font-medium shrink-0 flex items-center gap-0.5 ${levelColors[currentLevel]}`}>
              <i className={`${levelIcons[currentLevel]} text-[9px]`} />
              {levelLabel}
            </span>
          </Tooltip>

          {!readOnly && renderLevelSelector(node.path, currentLevel)}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {!readOnly && (
        <div className="flex items-center gap-3 px-2 pb-1.5 border-b border-background-200 mb-1">
          <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-wider">Permission Levels</span>
          <div className="flex items-center gap-1.5">
            {permissionLevels.filter((l) => l.value !== 'none').map((l) => (
              <Tooltip key={l.value} content={l.description}>
                <span className={`text-[10px] px-1 py-0 rounded border font-medium cursor-default flex items-center gap-0.5 ${levelColors[l.value]}`}>
                  <i className={`${levelIcons[l.value]} text-[9px]`} />
                  {l.label}
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
      {tree.map((node) => renderTreeNode(node, 1))}
    </div>
  );
}
