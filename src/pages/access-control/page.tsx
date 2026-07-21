import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import TopBar from '@/components/feature/TopBar';
import Sidebar from '@/components/feature/Sidebar';
import { vaultMounts, vaultConnection, restrictedConnection } from '@/mocks/vault';
import UsersList from './components/UsersList';
import CreateUserWizard from './components/CreateUserWizard';
import UserProfile from './components/UserProfile';
import RolesList from './components/RolesList';
import RoleEditor from './components/RoleEditor';
import GroupsList from './components/GroupsList';
import GroupDetail from './components/GroupDetail';
import PolicyExplorer from './components/PolicyExplorer';
import type { VaultUserAccess, VaultRole, VaultGroup } from '@/mocks/vault-acl';

type ViewMode = 'users-list' | 'users-create' | 'users-profile' | 'roles-list' | 'roles-editor' | 'groups-list' | 'groups-detail' | 'policies';

export default function AccessControlPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRestricted = (location.state as any)?.isRestricted || false;
  const initialSection = (location.state as any)?.activeSection || 'users';
  const connection = isRestricted ? restrictedConnection : vaultConnection;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMount, setActiveMount] = useState('applications/');
  const [activePath, setActivePath] = useState('applications/');
  const [activeSection, setActiveSection] = useState<string>(initialSection);
  const [viewMode, setViewMode] = useState<ViewMode>(initialSection === 'users' ? 'users-list' : initialSection === 'groups' ? 'groups-list' : initialSection === 'roles' ? 'roles-list' : 'policies');

  const [profileUser, setProfileUser] = useState<VaultUserAccess | null>(null);
  const [editingRole, setEditingRole] = useState<VaultRole | null>(null);
  const [detailGroup, setDetailGroup] = useState<VaultGroup | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleSignOut = () => navigate('/login');

  const handleAccessSectionSelect = (section: string) => {
    setActiveSection(section);
    switch (section) {
      case 'users': setViewMode('users-list'); break;
      case 'groups': setViewMode('groups-list'); break;
      case 'roles': setViewMode('roles-list'); break;
      case 'policies': setViewMode('policies'); break;
    }
  };

  const handleUserCreated = () => {
    setViewMode('users-list');
  };

  return (
    <div className="h-full flex flex-col bg-background-50">
      <TopBar
        connection={connection}
        onSignOut={handleSignOut}
        onCommandPalette={() => setCommandPaletteOpen(true)}
      />

      <div className="flex-1 flex min-h-0 relative">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          mounts={vaultMounts}
          connection={connection}
          activeMount={activeMount}
          activePath={activePath}
          onMountSelect={(m) => { setActiveMount(m); setActivePath(m); }}
          onPathSelect={(mount, path) => { setActiveMount(mount); setActivePath(path); }}
          showAccessControl
          activeAccessSection={activeSection}
          onAccessSectionSelect={handleAccessSectionSelect}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {viewMode === 'users-list' && (
            <UsersList
              onCreateUser={() => setViewMode('users-create')}
              onViewUser={(user) => { setProfileUser(user); setViewMode('users-profile'); }}
              connection={connection}
            />
          )}
          {viewMode === 'users-create' && (
            <CreateUserWizard
              onDone={handleUserCreated}
              onCancel={() => setViewMode('users-list')}
            />
          )}
          {viewMode === 'users-profile' && profileUser && (
            <UserProfile
              user={profileUser}
              onBack={() => setViewMode('users-list')}
            />
          )}
          {viewMode === 'roles-list' && (
            <RolesList
              onEditRole={(role) => { setEditingRole(role); setViewMode('roles-editor'); }}
              onCreateRole={() => { setEditingRole(null); setViewMode('roles-editor'); }}
            />
          )}
          {viewMode === 'roles-editor' && (
            <RoleEditor
              role={editingRole}
              onBack={() => setViewMode('roles-list')}
              onSaved={() => setViewMode('roles-list')}
            />
          )}
          {viewMode === 'groups-list' && (
            <GroupsList
              onViewGroup={(group) => { setDetailGroup(group); setViewMode('groups-detail'); }}
            />
          )}
          {viewMode === 'groups-detail' && detailGroup && (
            <GroupDetail
              group={detailGroup}
              onBack={() => setViewMode('groups-list')}
            />
          )}
          {viewMode === 'policies' && (
            <PolicyExplorer />
          )}
        </div>
      </div>

      {commandPaletteOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCommandPaletteOpen(false)} />
          <div className="relative w-[500px] bg-background-50 rounded-lg border border-background-300 overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-3 h-9 border-b border-background-200">
              <i className="ri-search-line text-sm text-foreground-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search users, groups, roles, or run commands..."
                className="flex-1 text-sm bg-transparent border-none outline-none text-foreground-900 placeholder:text-foreground-400"
              />
              <span className="text-[10px] text-foreground-400 font-mono px-1.5 py-0.5 rounded bg-background-200">esc</span>
            </div>
            <div className="px-2 py-2 text-xs text-foreground-400">Type to search across access control</div>
          </div>
        </div>
      )}
    </div>
  );
}