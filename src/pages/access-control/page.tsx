import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAccessControlData, type AccessControlUserRecord } from '@/application/vault/useAccessControlData';
import { useAccessControlGateway } from '@/application/vault/AccessControlGatewayContext';
import { useKvAccessTree } from '@/application/vault/useKvAccessTree';
import { useKvMounts } from '@/application/vault/useKvExplorerData';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import Sidebar from '@/components/feature/Sidebar';
import TopBar from '@/components/feature/TopBar';
import { classifyPolicyName } from '@/domain/access-control/managed-resources';
import type { CreateUserAccessCatalog } from './components/create-user/access';
import CreateUserWizard from './components/CreateUserWizard';
import GroupsList from './components/GroupsList';
import PolicyExplorer from './components/PolicyExplorer';
import RolesList from './components/RolesList';
import UserProfile from './components/UserProfile';
import UsersList from './components/UsersList';

type ViewMode = 'users-list' | 'users-create' | 'users-profile' | 'roles' | 'groups' | 'policies';
const EMPTY_MOUNTS = [] as const;
const EMPTY_TREE = [] as const;

export default function AccessControlPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const vault = useVaultSession();
  const session = vault.session!;
  const accessGateway = useAccessControlGateway();
  const initialSection = (location.state as { activeSection?: string } | null)?.activeSection || 'users';
  const [accessState, refreshAccess] = useAccessControlData(session);
  const [mountsState] = useKvMounts(session);
  const mounts = mountsState.data ?? EMPTY_MOUNTS;
  const [treeState] = useKvAccessTree(session, mounts);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMount, setActiveMount] = useState('');
  const [activeSection, setActiveSection] = useState(initialSection);
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialSection === 'groups' ? 'groups' : initialSection === 'roles' ? 'roles' : initialSection === 'policies' ? 'policies' : 'users-list',
  );
  const [profileUser, setProfileUser] = useState<AccessControlUserRecord | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const snapshot = accessState.data;

  useEffect(() => {
    const errors = [
      accessState.status === 'error' ? accessState.error : undefined,
      mountsState.status === 'error' ? mountsState.error : undefined,
      treeState.status === 'error' ? treeState.error : undefined,
    ];
    if (errors.some((error) => error?.code === 'session-expired')) vault.expireSession();
  }, [accessState, mountsState, treeState, vault]);

  const catalog = useMemo<CreateUserAccessCatalog>(() => ({
    groups: (snapshot?.groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      roleIds: group.policies.filter((policy) => classifyPolicyName(policy) === 'role'),
      policyNames: group.policies.filter((policy) => classifyPolicyName(policy) !== 'role'),
    })),
    roles: snapshot?.roles.map((role) => ({ id: role.id, name: role.name, policyNames: [role.policyName] })) ?? [],
    policies: snapshot?.policies.map((policy) => ({
      name: policy.name,
      managed: policy.kind !== 'external',
      rules: policy.rules,
    })) ?? [],
    tree: treeState.data ?? EMPTY_TREE,
  }), [snapshot, treeState.data]);

  const signOut = () => {
    vault.signOut();
    navigate('/login', { replace: true });
  };
  const selectSection = (section: string) => {
    setActiveSection(section);
    setProfileUser(null);
    setViewMode(section === 'groups' ? 'groups' : section === 'roles' ? 'roles' : section === 'policies' ? 'policies' : 'users-list');
  };

  return (
    <div className="flex h-full flex-col bg-background-50">
      <TopBar session={session} health={vault.health} onSignOut={signOut} onCommandPalette={() => setCommandPaletteOpen(true)} />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((current) => !current)} mounts={mounts} vaultHealth={vault.health} serverUrl={session.serverUrl} activeMount={activeMount} activePath="" onMountSelect={setActiveMount} showAccessControl activeAccessSection={activeSection} onAccessSectionSelect={selectSection} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {accessState.status === 'loading' && !snapshot ? <div className="flex h-full items-center justify-center"><div className="text-center"><i className="ri-loader-4-line animate-spin text-xl text-primary-500" aria-hidden="true" /><p className="mt-2 text-xs text-foreground-500">Loading users, groups, and policies…</p></div></div>
            : accessState.status === 'error' && !snapshot ? <div className="flex h-full items-center justify-center p-6"><div role="alert" className="max-w-md rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-semibold">Access-control data could not be loaded</p><p className="mt-1 text-xs leading-5">{accessState.error.message}</p><button type="button" onClick={refreshAccess} className="mt-2 text-xs font-medium underline">Retry</button></div></div>
              : snapshot && <>
                {viewMode === 'users-list' && <UsersList users={snapshot.users} warnings={snapshot.warnings} onCreateUser={() => setViewMode('users-create')} onViewUser={(user) => { setProfileUser(user); setViewMode('users-profile'); }} onRefresh={refreshAccess} />}
                {viewMode === 'users-create' && <CreateUserWizard catalog={catalog} snapshot={snapshot} gateway={accessGateway} session={session} onSessionExpired={vault.expireSession} onDone={() => { refreshAccess(); setViewMode('users-list'); }} onCancel={() => setViewMode('users-list')} />}
                {viewMode === 'users-profile' && profileUser && <UserProfile user={profileUser} catalog={catalog} onBack={() => setViewMode('users-list')} />}
                {viewMode === 'groups' && <GroupsList groups={snapshot.groups} />}
                {viewMode === 'roles' && <RolesList roles={snapshot.roles} />}
                {viewMode === 'policies' && <PolicyExplorer policies={snapshot.policies} />}
              </>}
        </main>
      </div>
      {commandPaletteOpen && <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh]"><button type="button" aria-label="Close command palette" onClick={() => setCommandPaletteOpen(false)} className="absolute inset-0 bg-black/30" /><div role="dialog" aria-modal="true" className="relative w-[500px] rounded-lg border border-background-300 bg-background-50 p-4 text-xs text-foreground-500">Search across live access-control resources is planned after the mutation workflows.</div></div>}
    </div>
  );
}
