import { useState } from 'react';
import type { VaultUserAccess, PathPermission, PermissionLevel } from '@/mocks/vault-acl';
import { getEffectiveAccess, getEffectivePermission, vaultRoles, vaultGroups, generatePassword, passwordStrength, permissionLevels, vaultMountTree } from '@/mocks/vault-acl';
import Tabs from '@/components/base/Tabs';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import Tooltip from '@/components/base/Tooltip';
import { Input } from '@/components/base/Input';
import PermissionTree from './PermissionTree';
import {
  resolveAccessSelection,
  resolveEffectiveKvTree,
} from '@/domain/access-control/effective-access';
import type { LogicalKvAccessRule } from '@/domain/access-control/kv-v2-policy-compiler';
import type { PolicySource } from '@/domain/access-control/types';
import { mockCreateUserAccessCatalog } from '@/mocks/vault-access-catalog';
import EffectivePermissionTree from './create-user/EffectivePermissionTree';
import type { DirectKvAccessRule } from './create-user/access';

interface UserProfileProps {
  user: VaultUserAccess;
  onBack: () => void;
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

export default function UserProfile({ user, onBack }: UserProfileProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [pwRevealed, setPwRevealed] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showHandoff, setShowHandoff] = useState(false);

  const directSource: PolicySource = {
    kind: 'user-rule',
    id: `vc-user-${user.username}`,
    label: `${user.username} direct access`,
  };
  const profileDirectRules: readonly DirectKvAccessRule[] = user.direct_access.map((permission) => {
    const normalized = permission.path.replace(/\*$/, '').replace(/\/+$/, '');
    const [mount, ...pathParts] = normalized.split('/');
    const path = pathParts.join('/');
    return {
      nodeId: `${mount}:${path}`,
      mount,
      path,
      target: 'folder',
      level: permission.explicitDeny || permission.level === 'none'
        ? 'deny'
        : permission.level === 'manage'
          ? 'manage-versions'
          : permission.level,
    };
  });
  const logicalDirectRules: readonly LogicalKvAccessRule[] = profileDirectRules.map((rule) => ({
    mount: rule.mount,
    path: rule.path,
    target: rule.target,
    level: rule.level,
    source: directSource,
  }));
  const directRoleIds = user.direct_roles.flatMap((policyName) => {
    const role = mockCreateUserAccessCatalog.roles.find((candidate) => candidate.policyNames.includes(policyName));
    return role ? [role.id] : [];
  });
  const profileSelection = resolveAccessSelection({
    groups: mockCreateUserAccessCatalog.groups,
    roles: mockCreateUserAccessCatalog.roles,
    policies: mockCreateUserAccessCatalog.policies,
    selectedGroupIds: user.groups,
    directRoleIds,
    directRules: logicalDirectRules,
  });
  const profileEffectiveTree = resolveEffectiveKvTree(
    mockCreateUserAccessCatalog.tree,
    profileSelection.rules,
  );

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'ri-dashboard-line' },
    { key: 'effective', label: 'Effective Access', icon: 'ri-shield-check-line' },
    { key: 'direct', label: 'Direct Access', icon: 'ri-key-2-line' },
    { key: 'groups-roles', label: 'Groups & Roles', icon: 'ri-group-line' },
    { key: 'identity', label: 'Identity', icon: 'ri-fingerprint-line' },
    { key: 'credentials', label: 'Credentials', icon: 'ri-lock-line' },
  ];

  const pwStrength = passwordStrength(newPassword);

  const overviewTab = (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
          <span className="text-primary-700 font-semibold text-lg">{user.display_name.charAt(0)}</span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground-900">{user.display_name}</h3>
          <span className="text-xs font-mono text-foreground-500">{user.username}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border border-background-200 rounded-md p-3">
          <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-wider">Auth mount</span>
          <p className="text-sm font-mono text-foreground-800 mt-1">{user.auth_mount}/</p>
        </div>
        <div className="border border-background-200 rounded-md p-3">
          <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-wider">Entity ID</span>
          <p className="text-xs font-mono text-foreground-600 mt-1 truncate">{user.entity_id}</p>
        </div>
        <div className="border border-background-200 rounded-md p-3">
          <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-wider">Groups</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {user.groups.length === 0 ? <span className="text-xs text-foreground-400">None</span> :
              user.groups.map((g) => <span key={g} className="text-[11px] px-1.5 py-0 rounded bg-secondary-100 text-secondary-700 font-medium">{g}</span>)
            }
          </div>
        </div>
        <div className="border border-background-200 rounded-md p-3">
          <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-wider">Direct Roles</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {user.direct_roles.length === 0 ? <span className="text-xs text-foreground-400">None</span> :
              user.direct_roles.map((r) => <span key={r} className="text-[11px] px-1.5 py-0 rounded bg-primary-100 text-primary-700 font-medium">{vaultRoles.find((x) => x.name === r)?.display_name || r}</span>)
            }
          </div>
        </div>
      </div>

      <div className="border-t border-background-200 pt-4">
        <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Access Summary</span>
        <div className="mt-2 space-y-1">
          {getEffectiveAccess(user.username).slice(0, 6).map((perm) => (
            <div key={perm.path} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-foreground-700">{perm.path}</span>
              <span className={`text-[10px] px-1.5 py-0 rounded border font-medium flex items-center gap-0.5 ${levelColors[perm.level]}`}>
                <i className={`${levelIcons[perm.level]} text-[9px]`} />
                {permissionLevels.find((l) => l.value === perm.level)?.label}
              </span>
              {perm.source && <span className="text-foreground-400 text-[10px]">— {perm.source}</span>}
            </div>
          ))}
          {getEffectiveAccess(user.username).length > 6 && (
            <button onClick={() => setActiveTab('effective')} className="text-xs text-primary-600 hover:text-primary-700 cursor-pointer">
              View all {getEffectiveAccess(user.username).length} permissions →
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const effectiveTab = (
    <div className="p-5 space-y-3">
      <p className="text-xs text-foreground-500">
        Final resolved permissions combining groups, roles, and direct access using Vault path priority.
      </p>
      <EffectivePermissionTree
        nodes={profileEffectiveTree}
        directRules={profileDirectRules}
        onDirectRuleChange={() => undefined}
        readOnly
      />
      {profileSelection.unresolvedPolicies.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          One or more external policies could not be resolved. Vault may grant additional access.
        </div>
      )}
    </div>
  );

  const directAccessTab = (
    <div className="p-5 space-y-3">
      <p className="text-xs text-foreground-500">
        User-specific permissions. Editing creates a new version of the policy.
      </p>
      <div className="border border-background-200 rounded-md p-3">
        <PermissionTree
          tree={vaultMountTree}
          permissions={user.direct_access}
          onPermissionChange={() => {}}
          readOnly
          showSource
          getEffectivePermission={(path) => getEffectivePermission(path, user.username)}
        />
      </div>
    </div>
  );

  const groupsRolesTab = (
    <div className="p-5 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground-700">Groups</span>
          <button className="text-[10px] text-primary-600 hover:text-primary-700 cursor-pointer">Edit</button>
        </div>
        <div className="space-y-1.5">
          {user.groups.length === 0 ? <p className="text-xs text-foreground-400">No groups</p> :
            user.groups.map((g) => {
              const group = vaultGroups.find((x) => x.name === g);
              return (
                <div key={g} className="flex items-center justify-between px-3 py-2 rounded-md border border-background-200 text-xs">
                  <div className="flex items-center gap-2">
                    <i className="ri-group-line text-foreground-400" />
                    <span className="font-medium text-foreground-800">{g}</span>
                    <span className="text-foreground-400">· {group?.member_count || 0} members</span>
                  </div>
                  <span className="text-[10px] text-foreground-400">
                    Roles: {group?.roles.map((r) => vaultRoles.find((x) => x.name === r)?.display_name || r).join(', ')}
                  </span>
                </div>
              );
            })
          }
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground-700">Direct Roles</span>
          <button className="text-[10px] text-primary-600 hover:text-primary-700 cursor-pointer">Edit</button>
        </div>
        <div className="space-y-1.5">
          {user.direct_roles.length === 0 ? <p className="text-xs text-foreground-400">No direct roles</p> :
            user.direct_roles.map((r) => {
              const role = vaultRoles.find((x) => x.name === r);
              return (
                <div key={r} className="flex items-center justify-between px-3 py-2 rounded-md border border-background-200 text-xs">
                  <div className="flex items-center gap-2">
                    <i className="ri-shield-check-line text-foreground-400" />
                    <span className="font-medium text-foreground-800">{role?.display_name || r}</span>
                  </div>
                  <span className="text-[10px] text-foreground-400">{role?.access_summary}</span>
                </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );

  const identityTab = (
    <div className="p-5 space-y-4">
      <div className="px-3 py-2 rounded-md bg-background-100 border border-background-200 text-[11px] text-foreground-500">
        Advanced — Vault identity entity information
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-foreground-500">Entity ID</span>
          <span className="font-mono text-foreground-800">{user.entity_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground-500">Alias ID</span>
          <span className="font-mono text-foreground-800">{user.alias_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground-500">Mount accessor</span>
          <span className="font-mono text-foreground-800">{user.mount_accessor}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground-500">Auth mount</span>
          <span className="text-foreground-800">{user.auth_mount}/</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground-500">Created</span>
          <span className="text-foreground-800">{new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>
      {Object.keys(user.entity_metadata).length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-foreground-500 uppercase tracking-wider">Entity Metadata</span>
          <div className="mt-1.5 space-y-1">
            {Object.entries(user.entity_metadata).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="font-mono text-foreground-600">{k}</span>
                <span className="text-foreground-800">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const credentialsTab = (
    <div className="p-5 space-y-5">
      <div className="border border-background-200 rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-foreground-700">Reset password</span>
          <Tooltip content="Generate new password">
            <button onClick={() => { setNewPassword(generatePassword()); setPwRevealed(false); setShowHandoff(false); }} className="h-7 px-2.5 text-xs rounded-md bg-background-100 text-foreground-600 hover:bg-background-200 border border-background-300 cursor-pointer flex items-center gap-1">
              <i className="ri-refresh-line text-sm" /> Regenerate
            </button>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <input
              type={pwRevealed ? 'text' : 'password'}
              value={newPassword}
              readOnly
              className="w-full h-8 px-2.5 pr-16 text-sm font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button onClick={() => setPwRevealed(!pwRevealed)} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                <i className={`${pwRevealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-xs`} />
              </button>
              <button onClick={() => navigator.clipboard.writeText(newPassword)} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                <i className="ri-file-copy-line text-xs" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <span className={`px-1.5 py-0 rounded font-medium text-background-50 ${pwStrength.color}`}>{pwStrength.label}</span>
            <span className="text-foreground-400">{newPassword.length} chars</span>
          </div>
        </div>

        {!showHandoff ? (
          <Button size="sm" variant="primary" className="mt-3" onClick={() => setShowHandoff(true)}>Reset password</Button>
        ) : (
          <div className="mt-3 px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 space-y-2">
            <p className="text-xs text-emerald-700 font-medium">Password reset successfully</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(`Username: ${user.username}\nPassword: ${newPassword}`)}>
                <i className="ri-file-copy-line" /> Copy handoff
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(`vault login -method=userpass -path=${user.auth_mount} username=${user.username}`)}>
                <i className="ri-terminal-line" /> Copy login command
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-background-200 pt-4">
        <button
          onClick={() => setShowDeleteSection(!showDeleteSection)}
          className="text-xs text-red-500 hover:text-red-600 cursor-pointer flex items-center gap-1"
        >
          <i className="ri-arrow-up-s-line text-sm" />
          Danger zone — Delete userpass account
        </button>
        {showDeleteSection && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-red-600">
              This will permanently remove the userpass account, entity alias, and all associated generated policies. This action cannot be undone.
            </p>
            <p className="text-xs text-foreground-500">Type <span className="font-mono font-medium">{user.username}</span> to confirm:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={user.username}
                className="flex-1 h-8 px-2.5 text-sm font-mono rounded-md border border-background-300 bg-background-50 focus:outline-none focus:border-red-400"
              />
              <Button size="sm" variant="danger" disabled={deleteConfirm !== user.username}>Delete account</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
            <i className="ri-arrow-left-line text-sm" />
          </button>
          <h2 className="text-sm font-semibold text-foreground-900">{user.display_name}</h2>
          <span className="text-xs font-mono text-foreground-500">{user.username}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
          {activeTab === 'overview' && overviewTab}
          {activeTab === 'effective' && effectiveTab}
          {activeTab === 'direct' && directAccessTab}
          {activeTab === 'groups-roles' && groupsRolesTab}
          {activeTab === 'identity' && identityTab}
          {activeTab === 'credentials' && credentialsTab}
        </Tabs>
      </div>
    </div>
  );
}
