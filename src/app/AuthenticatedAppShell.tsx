import { useEffect, useMemo, useState } from 'react';
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useShortcutCommands, useShortcuts } from '@/application/shortcuts/ShortcutContext';
import { ShortcutProvider } from '@/application/shortcuts/ShortcutProvider';
import { useTheme } from '@/application/theme/ThemeContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { useKvMounts } from '@/application/vault/useKvExplorerData';
import CommandPalette from '@/components/feature/CommandPalette';
import CreateKvMountDialog from '@/components/feature/CreateKvMountDialog';
import Sidebar from '@/components/feature/Sidebar';
import TopBar from '@/components/feature/TopBar';
import type { AuthenticatedShellContextValue } from './authenticated-shell';

const NO_MOUNTS = [] as const;
const ACCESS_SECTIONS = new Set(['users', 'groups', 'roles', 'policies']);
const ACCESS_COMMANDS = [
  ['users', 'Open users', 'ri-user-settings-line'],
  ['groups', 'Open groups', 'ri-group-line'],
  ['roles', 'Open roles', 'ri-shield-check-line'],
  ['policies', 'Open Policy Explorer', 'ri-file-code-line'],
] as const;

function accessSection(pathname: string): string | undefined {
  const section = matchPath('/access-control/:section/*', pathname)?.params.section;
  return section && ACCESS_SECTIONS.has(section) ? section : undefined;
}

export default function AuthenticatedAppShell() {
  return (
    <ShortcutProvider>
      <AuthenticatedWorkspace />
    </ShortcutProvider>
  );
}

function AuthenticatedWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const vault = useVaultSession();
  const theme = useTheme();
  const shortcuts = useShortcuts();
  const session = vault.session!;
  const [mountsState, refreshMounts] = useKvMounts(session);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createMountOpen, setCreateMountOpen] = useState(false);
  const mounts = mountsState.data ?? NO_MOUNTS;
  const explorer = matchPath('/explorer/:mount/*', location.pathname);
  const activeMount = explorer?.params.mount ? decodeURIComponent(explorer.params.mount) : '';
  const activePath = explorer?.params['*'] ?? '';
  const activeAccessSection = accessSection(location.pathname);
  const accessNotice = (location.state as { notice?: string } | null)?.notice === 'access-control-denied';
  const showAccessControl = vault.accessControlPermission.state !== 'denied';

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
  const commands = useMemo(() => [
    {
      id: 'action-create-kv-mount',
      label: 'Create KV v2 mount',
      group: 'Actions',
      keywords: ['enable', 'secrets engine', 'mount'],
      icon: 'ri-folder-add-line',
      run: () => setCreateMountOpen(true),
    },
    {
      id: 'action-refresh-mounts',
      label: 'Refresh KV mounts',
      group: 'Actions',
      keywords: ['reload', 'sync', 'list'],
      icon: 'ri-refresh-line',
      run: refreshMounts,
    },
    ...mounts.map((mount) => ({
      id: `mount-${mount.path}`,
      label: `Open ${mount.path}/`,
      group: 'KV mounts',
      keywords: ['secret', 'folder', mount.description, mount.path],
      icon: 'ri-folder-keyhole-line',
      run: () => navigate(`/explorer/${encodeURIComponent(mount.path)}`),
    })),
    ...(showAccessControl ? ACCESS_COMMANDS.map(([section, label, icon]) => ({
      id: `access-${section}`,
      label,
      group: 'Access control',
      keywords: ['identity', 'acl', section],
      icon,
      run: () => navigate(`/access-control/${section}`),
    })) : []),
    ...([
      ['system', 'Use system appearance', 'ri-computer-line'],
      ['light', 'Use light appearance', 'ri-sun-line'],
      ['dark', 'Use dark appearance', 'ri-moon-line'],
    ] as const).map(([preference, label, icon]) => ({
      id: `theme-${preference}`,
      label,
      group: 'Appearance',
      keywords: ['theme', 'color', preference],
      icon,
      disabledReason: theme.preference === preference ? 'Currently selected.' : undefined,
      run: () => theme.setPreference(preference),
    })),
  ], [
    mounts,
    navigate,
    refreshMounts,
    showAccessControl,
    theme,
  ]);
  useShortcutCommands(commands);

  return (
    <div data-testid="authenticated-app-shell" className="flex h-full flex-col bg-background-50">
      <TopBar
        session={session}
        health={vault.health}
        onSignOut={signOut}
        onOpenCommandPalette={shortcuts.openPalette}
      />
      {accessNotice && (
        <div className="flex items-center gap-2 border-b border-warning-200 bg-warning-50 px-4 py-1.5 text-xs text-warning-700" role="status">
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
          onCreateMount={() => setCreateMountOpen(true)}
          showAccessControl={showAccessControl}
          activeAccessSection={activeAccessSection}
          onAccessSectionSelect={(section) => navigate(`/access-control/${section}`)}
        />
        <Outlet context={context} />
        <CreateKvMountDialog
          open={createMountOpen}
          existingMountPaths={mounts.map((mount) => mount.path)}
          onClose={() => setCreateMountOpen(false)}
          onCreated={(mount) => {
            setCreateMountOpen(false);
            navigate(`/explorer/${encodeURIComponent(mount)}`);
          }}
        />
        <CommandPalette />
      </div>
    </div>
  );
}
