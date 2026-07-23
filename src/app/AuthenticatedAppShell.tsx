import { useEffect, useState } from 'react';
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { useKvMounts } from '@/application/vault/useKvExplorerData';
import Sidebar from '@/components/feature/Sidebar';
import TopBar from '@/components/feature/TopBar';
import type { AuthenticatedShellContextValue } from './authenticated-shell';

const NO_MOUNTS = [] as const;
const ACCESS_SECTIONS = new Set(['users', 'groups', 'roles', 'policies']);

function accessSection(pathname: string): string | undefined {
  const section = matchPath('/access-control/:section/*', pathname)?.params.section;
  return section && ACCESS_SECTIONS.has(section) ? section : undefined;
}

export default function AuthenticatedAppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const vault = useVaultSession();
  const session = vault.session!;
  const [mountsState, refreshMounts] = useKvMounts(session);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mounts = mountsState.data ?? NO_MOUNTS;
  const explorer = matchPath('/explorer/:mount/*', location.pathname);
  const activeMount = explorer?.params.mount ? decodeURIComponent(explorer.params.mount) : '';
  const activePath = explorer?.params['*'] ?? '';
  const activeAccessSection = accessSection(location.pathname);
  const accessNotice = (location.state as { notice?: string } | null)?.notice === 'access-control-denied';

  useEffect(() => {
    if (mountsState.status === 'error' && mountsState.error.code === 'session-expired') {
      vault.expireSession();
    }
  }, [mountsState, vault]);

  const signOut = () => {
    vault.signOut();
    navigate('/login', { replace: true });
  };

  const context: AuthenticatedShellContextValue = {
    mountsState,
    refreshMounts,
  };

  return (
    <div data-testid="authenticated-app-shell" className="flex h-full flex-col bg-background-50">
      <TopBar session={session} health={vault.health} onSignOut={signOut} />
      {accessNotice && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-700" role="status">
          <i className="ri-shield-user-line shrink-0 text-sm" aria-hidden="true" />
          <span>Your Vault policy does not allow access-control administration.</span>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          mounts={mounts}
          vaultHealth={vault.health}
          serverUrl={session.serverUrl}
          activeMount={activeMount}
          activePath={activePath}
          onMountSelect={(mount) => navigate(`/explorer/${encodeURIComponent(mount)}`)}
          showAccessControl={vault.accessControlPermission.state !== 'denied'}
          activeAccessSection={activeAccessSection}
          onAccessSectionSelect={(section) => navigate(`/access-control/${section}`)}
        />
        <Outlet context={context} />
      </div>
    </div>
  );
}
