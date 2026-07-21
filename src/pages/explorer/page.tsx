import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import TopBar from '@/components/feature/TopBar';
import Sidebar from '@/components/feature/Sidebar';
import ExplorerMain from './components/ExplorerMain';
import CreateSecretDrawer from './components/CreateSecretDrawer';
import EditSecretDrawer from './components/EditSecretDrawer';
import VersionComparison from './components/VersionComparison';
import DestructionConfirm from './components/DestructionConfirm';
import type { VaultSecret } from '@/mocks/vault';
import { vaultMounts, vaultSecrets, vaultConnection, restrictedConnection } from '@/mocks/vault';

export default function ExplorerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRestricted = (location.state as any)?.isRestricted || false;

  const connection = isRestricted ? restrictedConnection : vaultConnection;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMount, setActiveMount] = useState('applications/');
  const [activePath, setActivePath] = useState('applications/');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<VaultSecret | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparingSecret, setComparingSecret] = useState<VaultSecret | null>(null);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [destroyMode, setDestroyMode] = useState<'soft-delete' | 'destroy' | 'destroy-all'>('soft-delete');
  const [destroySecret, setDestroySecret] = useState<VaultSecret | null>(null);

  const handleSignOut = () => {
    navigate('/login');
  };

  const handleAccessSectionSelect = (section: string) => {
    navigate('/access-control', { state: { isRestricted: false, activeSection: section } });
  };

  const handleNavigateToFolder = (path: string) => {
    setActivePath(path);
  };

  const handleNavigateToBreadcrumb = (path: string) => {
    setActivePath(path);
    const mountMatch = vaultMounts.find((m) => path.startsWith(m.name));
    if (mountMatch) setActiveMount(mountMatch.name);
  };

  const handleCreateSecret = () => {
    setCreateDrawerOpen(true);
  };

  const handleCreateSave = (name: string, data: Record<string, string>) => {
    // In a real app, this would call the Vault API
  };

  const handleEditSecret = (secret: VaultSecret) => {
    setEditingSecret(secret);
    setEditDrawerOpen(true);
  };

  const handleEditSave = (secret: VaultSecret, data: Record<string, string>) => {
    // In a real app, this would call the Vault API
  };

  const handleVersionCompare = (secret: VaultSecret) => {
    setComparingSecret(secret);
    setCompareOpen(true);
  };

  const handleRestore = (secret: VaultSecret, version: number) => {
    // In a real app, this would create a new version from the old version
  };

  const handleDestroy = (secret: VaultSecret) => {
    // In a real app, this would call the Vault API
  };

  const filteredSecrets = vaultSecrets.filter((s) => connection.permissions.mounts.includes(s.mount));

  return (
    <div className="h-full flex flex-col bg-background-50">
      <TopBar
        connection={connection}
        onSignOut={handleSignOut}
        onCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {isRestricted && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
          <i className="ri-shield-user-line text-sm shrink-0" />
          <span>Restricted access — You can only view secrets in mounts allowed by your Vault policy. Edit, create, and delete operations are not available.</span>
        </div>
      )}

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
          showAccessControl={!isRestricted}
          onAccessSectionSelect={handleAccessSectionSelect}
        />

        <ExplorerMain
          mount={activeMount}
          currentPath={activePath}
          mounts={vaultMounts}
          secrets={filteredSecrets}
          allSecrets={vaultSecrets}
          onNavigateToFolder={handleNavigateToFolder}
          onNavigateToBreadcrumb={handleNavigateToBreadcrumb}
          onCreateSecret={handleCreateSecret}
          onEditSecret={handleEditSecret}
          onVersionCompare={handleVersionCompare}
          onDestroy={(secret, mode) => { setDestroySecret(secret); setDestroyMode(mode); setDestroyOpen(true); }}
          connectionPermissions={connection.permissions}
        />
      </div>

      <CreateSecretDrawer
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        mount={activeMount}
        currentPath={activePath}
        onSave={handleCreateSave}
      />

      <EditSecretDrawer
        open={editDrawerOpen}
        onClose={() => { setEditDrawerOpen(false); setEditingSecret(null); }}
        secret={editingSecret}
        onSave={handleEditSave}
      />

      <VersionComparison
        open={compareOpen}
        onClose={() => { setCompareOpen(false); setComparingSecret(null); }}
        secret={comparingSecret}
        onRestore={handleRestore}
      />

      <DestructionConfirm
        open={destroyOpen}
        onClose={() => { setDestroyOpen(false); setDestroySecret(null); }}
        secret={destroySecret}
        mode={destroyMode}
        onConfirm={handleDestroy}
      />

      {commandPaletteOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/30 modal-backdrop-enter" onClick={() => setCommandPaletteOpen(false)} />
          <div className="relative w-[500px] bg-background-50 rounded-lg border border-background-300 overflow-hidden modal-content-enter shadow-sm">
            <div className="flex items-center gap-2 px-3 h-9 border-b border-background-200">
              <i className="ri-search-line text-sm text-foreground-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search secrets, folders, or run commands..."
                className="flex-1 text-sm bg-transparent border-none outline-none text-foreground-900 placeholder:text-foreground-400"
              />
              <span className="text-[10px] text-foreground-400 font-mono px-1.5 py-0.5 rounded bg-background-200">esc</span>
            </div>
            <div className="px-2 py-2 text-xs text-foreground-400">
              Type to search across all mounts
            </div>
          </div>
        </div>
      )}
    </div>
  );
}