import { useState, useCallback } from 'react';
import type { VaultRole, PermissionLevel, PathPermission } from '@/mocks/vault-acl';
import { permissionLevels, vaultMountTree } from '@/mocks/vault-acl';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import PermissionTree from './PermissionTree';

interface RoleEditorProps {
  role: VaultRole | null;
  onBack: () => void;
  onSaved: () => void;
}

export default function RoleEditor({ role, onBack, onSaved }: RoleEditorProps) {
  const isNew = !role;
  const [roleName, setRoleName] = useState(role?.name || '');
  const [displayName, setDisplayName] = useState(role?.display_name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [permissions, setPermissions] = useState<PathPermission[]>(role?.permissions || []);
  const [showHCL, setShowHCL] = useState(false);
  const [showImpact, setShowImpact] = useState(false);

  const handlePermissionChange = useCallback((path: string, level: PermissionLevel) => {
    setPermissions((prev) => {
      const existing = prev.findIndex((p) => p.path === path);
      if (existing >= 0) {
        if (level === 'none') {
          return prev.filter((_, i) => i !== existing);
        }
        const next = [...prev];
        next[existing] = { ...next[existing], level };
        return next;
      }
      if (level === 'none') return prev;
      return [...prev, { path, level, source: displayName || 'New Role' }];
    });
  }, [displayName]);

  const generateHCL = (): string => {
    const lines = [`# ${roleName || 'new-role'}`];
    permissions.forEach((perm) => {
      const caps = perm.level === 'view' ? ['read', 'list'] :
        perm.level === 'edit' ? ['create', 'read', 'update', 'list'] :
        perm.level === 'manage' ? ['create', 'read', 'update', 'delete', 'list'] :
        perm.level === 'owner' ? ['create', 'read', 'update', 'delete', 'list'] : [];
      if (caps.length > 0) {
        lines.push(`\npath "${perm.path}" {`);
        lines.push(`  capabilities = [${caps.map((c) => `"${c}"`).join(', ')}]`);
        lines.push(`}`);
      }
    });
    return lines.join('\n');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
            <i className="ri-arrow-left-line text-sm" />
          </button>
          <h2 className="text-sm font-semibold text-foreground-900">{isNew ? 'Create role' : 'Edit role'}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-foreground-700">Role name (policy name)</label>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="vc-role-..."
              className="w-full h-8 mt-1 px-2.5 text-sm font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground-700">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Platform Readers"
              className="w-full h-8 mt-1 px-2.5 text-sm rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground-700">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this role grants access to"
            className="w-full h-8 mt-1 px-2.5 text-sm rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
          />
        </div>

        <div className="border-t border-background-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-foreground-700">KV Permission Tree</span>
            <div className="flex items-center gap-1.5">
              {permissionLevels.filter((l) => l.value !== 'none').map((l) => (
                <span key={l.value} className={`text-[10px] px-1.5 py-0 rounded border font-medium cursor-default ${
                  l.value === 'view' ? 'text-sky-600 bg-sky-50 border-sky-200' :
                  l.value === 'edit' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                  l.value === 'manage' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                  'text-violet-600 bg-violet-50 border-violet-200'
                }`}>{l.label}</span>
              ))}
            </div>
          </div>
          <div className="border border-background-200 rounded-md p-3 max-h-[420px] overflow-y-auto">
            <PermissionTree
              tree={vaultMountTree}
              permissions={permissions}
              onPermissionChange={handlePermissionChange}
            />
          </div>
        </div>

        <div className="space-y-2">
          <button onClick={() => setShowHCL(!showHCL)} className="text-xs text-foreground-500 hover:text-foreground-700 cursor-pointer flex items-center gap-1">
            <i className="ri-arrow-down-s-line text-sm" />
            Generated HCL preview
          </button>
          {showHCL && (
            <pre className="text-[11px] font-mono text-foreground-700 bg-background-100 border border-background-200 rounded-md p-3 whitespace-pre overflow-x-auto">{generateHCL() || '# No permissions defined'}</pre>
          )}
        </div>

        <div className="space-y-2">
          <button onClick={() => setShowImpact(!showImpact)} className="text-xs text-foreground-500 hover:text-foreground-700 cursor-pointer flex items-center gap-1">
            <i className="ri-arrow-down-s-line text-sm" />
            Impact preview
          </button>
          {showImpact && role && (
            <div className="text-xs text-foreground-600 space-y-1 px-3 py-2 bg-background-100 border border-background-200 rounded-md">
              <p><strong>{role.groups.length}</strong> groups affected</p>
              <p><strong>{role.direct_users.length}</strong> direct users affected</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-background-200 shrink-0 flex items-center justify-end gap-2 bg-background-50">
        <Button variant="secondary" size="sm" onClick={onBack}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={onSaved}>{isNew ? 'Create role' : 'Save changes'}</Button>
      </div>
    </div>
  );
}