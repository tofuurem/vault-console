import { useState } from 'react';
import type { VaultGroup } from '@/mocks/vault-acl';
import { vaultUsers, vaultRoles, getEffectiveAccess } from '@/mocks/vault-acl';
import Tabs from '@/components/base/Tabs';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';

interface GroupDetailProps {
  group: VaultGroup;
  onBack: () => void;
}

export default function GroupDetail({ group, onBack }: GroupDetailProps) {
  const [activeTab, setActiveTab] = useState('members');
  const [previewOpen, setPreviewOpen] = useState(false);

  const tabs = [
    { key: 'members', label: 'Members', icon: 'ri-user-line', count: group.members.length },
    { key: 'roles', label: 'Roles', icon: 'ri-shield-check-line', count: group.roles.length },
    { key: 'effective', label: 'Effective Access', icon: 'ri-eye-line' },
    { key: 'metadata', label: 'Metadata', icon: 'ri-information-line' },
  ];

  const membersTab = (
    <div className="p-5">
      <div className="space-y-1.5">
        {group.members.map((username) => {
          const user = vaultUsers.find((u) => u.username === username);
          return (
            <div key={username} className="flex items-center justify-between px-3 py-2 rounded-md border border-background-200 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-700 font-semibold text-xs">{user?.display_name?.charAt(0) || username.charAt(0)}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground-800">{user?.display_name || username}</span>
                  <span className="text-foreground-400 ml-1.5 font-mono">{username}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {user?.direct_roles.map((r) => (
                  <span key={r} className="text-[10px] px-1 py-0 rounded bg-primary-100 text-primary-600">{vaultRoles.find((x) => x.name === r)?.display_name || r}</span>
                ))}
                <button className="w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-red-500 cursor-pointer">
                  <i className="ri-close-line text-xs" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <Button size="sm" variant="secondary">
          <i className="ri-user-add-line" /> Add members
        </Button>
      </div>
    </div>
  );

  const rolesTab = (
    <div className="p-5 space-y-3">
      {group.roles.map((roleName) => {
        const role = vaultRoles.find((r) => r.name === roleName);
        return (
          <div key={roleName} className="px-3 py-3 rounded-md border border-background-200 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="ri-shield-check-line text-foreground-400" />
                <span className="font-medium text-foreground-800">{role?.display_name || roleName}</span>
                <span className="font-mono text-foreground-400">{roleName}</span>
              </div>
              <button className="w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-red-500 cursor-pointer">
                <i className="ri-close-line text-xs" />
              </button>
            </div>
            <p className="text-[11px] text-foreground-500 mt-1">{role?.description}</p>
            <p className="text-[11px] text-foreground-400 mt-1">{role?.access_summary}</p>
          </div>
        );
      })}
      <div className="pt-2">
        <Button size="sm" variant="secondary">
          <i className="ri-add-line" /> Add role
        </Button>
      </div>
    </div>
  );

  const effectiveTab = (
    <div className="p-5 space-y-2">
      <p className="text-xs text-foreground-500">Effective access for all members of this group</p>
      {group.roles.map((roleName) => {
        const role = vaultRoles.find((r) => r.name === roleName);
        return (
          <div key={roleName} className="border border-background-200 rounded-md p-3">
            <span className="text-xs font-medium text-foreground-800">{role?.display_name || roleName}</span>
            <div className="mt-2 space-y-1">
              {role?.permissions.map((perm) => (
                <div key={perm.path} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-foreground-600">{perm.path}</span>
                  <span className="text-[10px] px-1 py-0 rounded border bg-primary-50 text-primary-600 border-primary-200">
                    {perm.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const metadataTab = (
    <div className="p-5 space-y-3 text-xs">
      <div className="flex justify-between">
        <span className="text-foreground-500">Group ID</span>
        <span className="font-mono text-foreground-800">{group.id}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-foreground-500">Created</span>
        <span className="text-foreground-800">{new Date(group.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-foreground-500">Child groups</span>
        <span className="text-foreground-800">{group.child_groups.length || 'None'}</span>
      </div>
      {Object.entries(group.metadata).map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <span className="text-foreground-500 font-mono">{k}</span>
          <span className="text-foreground-800">{v}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
            <i className="ri-arrow-left-line text-sm" />
          </button>
          <h2 className="text-sm font-semibold text-foreground-900">{group.name}</h2>
          <span className="text-xs text-foreground-400">{group.member_count} members</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
          {activeTab === 'members' && membersTab}
          {activeTab === 'roles' && rolesTab}
          {activeTab === 'effective' && effectiveTab}
          {activeTab === 'metadata' && metadataTab}
        </Tabs>
      </div>

      <div className="px-5 py-3 border-t border-background-200 shrink-0 flex items-center justify-end gap-2 bg-background-50">
        <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(true)}>
          <i className="ri-eye-line" /> Preview affected users
        </Button>
        <Button size="sm" variant="primary">Save changes</Button>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPreviewOpen(false)} />
          <div className="relative w-[440px] bg-background-50 rounded-lg border border-background-300 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-background-200">
              <h3 className="text-sm font-semibold text-foreground-900">Affected users</h3>
              <button onClick={() => setPreviewOpen(false)} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                <i className="ri-close-line" />
              </button>
            </div>
            <div className="p-4 space-y-2 text-xs">
              <p className="text-foreground-500">The following users will be affected by changes to this group:</p>
              {group.members.map((username) => (
                <div key={username} className="px-2 py-1.5 rounded border border-background-200 flex items-center gap-2">
                  <i className="ri-user-line text-foreground-400" />
                  <span className="font-mono text-foreground-800">{username}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}