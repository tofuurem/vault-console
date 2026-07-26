import { useCallback, useEffect, useMemo, useState } from 'react';
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useNavigationHistory } from '@/application/navigation-history/NavigationHistoryContext';
import { NavigationHistoryProvider } from '@/application/navigation-history/NavigationHistoryProvider';
import type { NavigationPath } from '@/application/navigation-history/navigation-history';
import { useToast } from '@/application/notifications/ToastContext';
import { useShortcutCommands, useShortcuts } from '@/application/shortcuts/ShortcutContext';
import { ShortcutProvider } from '@/application/shortcuts/ShortcutProvider';
import {
  buildKvIndexCommand,
  buildVaultPathCommands,
} from '@/application/shortcuts/vault-path-commands';
import { useTheme } from '@/application/theme/ThemeContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { useKvMounts } from '@/application/vault/useKvExplorerData';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { KvSearchProvider } from '@/application/vault/search/KvSearchProvider';
import { useKvSearch } from '@/application/vault/search/KvSearchContext';
import { useSessionClock } from '@/application/vault/useSessionClock';
import CommandPalette from '@/components/feature/CommandPalette';
import CreateKvMountDialog from '@/components/feature/CreateKvMountDialog';
import SessionExpiryBanner from '@/components/feature/SessionExpiryBanner';
import Sidebar from '@/components/feature/Sidebar';
import TopBar from '@/components/feature/TopBar';
import Drawer from '@/components/base/Drawer';
import type { AuthenticatedShellContextValue } from './authenticated-shell';
import { directoryPathForSecret, explorerRoute } from '@/router/explorer-route';
import { normalizeVaultError } from '@/domain/vault/errors';

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
  const vault = useVaultSession();
  const gateway = useKvV2Gateway();
  return (
    <ShortcutProvider>
      <NavigationHistoryProvider session={vault.session!}>
        <KvSearchProvider
          session={vault.session!}
          gateway={gateway}
          onSessionExpired={vault.expireSession}
        >
          <AuthenticatedWorkspace />
        </KvSearchProvider>
      </NavigationHistoryProvider>
    </ShortcutProvider>
  );
}

function AuthenticatedWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const vault = useVaultSession();
  const theme = useTheme();
  const toast = useToast();
  const shortcuts = useShortcuts();
  const kvSearch = useKvSearch();
  const navigationHistory = useNavigationHistory();
  const session = vault.session!;
  const sessionClock = useSessionClock({
    expiresAt: session.expiresAt,
    leaseDurationSeconds: session.leaseDurationSeconds,
    onExpire: vault.expireSession,
  });
  const renewSession = useCallback(async () => {
    try {
      await vault.renewSession();
      toast.success('Vault session renewed with the TTL returned by Vault.');
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'aborted' || error.code === 'session-expired') return;
      if (error.code === 'authorization' || error.code === 'invalid-request') {
        toast.warning('Vault could not renew this token. The current session remains active until its existing expiry.');
        return;
      }
      toast.error(error.message, { title: 'Session renewal failed' });
    }
  }, [toast, vault]);
  const [mountsState, refreshMounts] = useKvMounts(session);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
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

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname, location.search]);

  const signOut = () => {
    vault.signOut();
    navigate('/login', { replace: true });
  };
  const openNavigationPath = useCallback((target: NavigationPath) => {
    navigate(target.kind === 'folder'
      ? explorerRoute(target.mount, target.path)
      : explorerRoute(
          target.mount,
          directoryPathForSecret(target.path),
          target.path,
        ));
  }, [navigate]);
  const activeSearchState = kvSearch.stateFor(activeMount);
  const pathCommands = useMemo(() => buildVaultPathCommands({
    favorites: navigationHistory.favorites,
    recents: navigationHistory.recents,
    indexed: shortcuts.paletteOpen ? activeSearchState.entries : [],
    onOpen: openNavigationPath,
  }), [
    activeSearchState.entries,
    navigationHistory.favorites,
    navigationHistory.recents,
    openNavigationPath,
    shortcuts.paletteOpen,
  ]);
  const indexCommand = useMemo(() => buildKvIndexCommand({
    mount: activeMount,
    state: activeSearchState,
    onStart: () => kvSearch.start(activeMount),
    onContinue: () => kvSearch.continueScan(activeMount),
    onRestart: () => kvSearch.restart(activeMount),
    onCancel: () => kvSearch.cancel(activeMount),
  }), [activeMount, activeSearchState, kvSearch]);

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
    ...pathCommands,
    ...(indexCommand ? [indexCommand] : []),
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
    indexCommand,
    pathCommands,
    refreshMounts,
    showAccessControl,
    theme,
  ]);
  useShortcutCommands(commands);

  return (
    <div data-testid="authenticated-app-shell" className="relative flex h-full flex-col bg-background-50">
      <TopBar
        session={session}
        health={vault.health}
        onSignOut={signOut}
        onOpenCommandPalette={shortcuts.openPalette}
        onClearNavigationData={navigationHistory.clearLocalNavigationData}
        remainingLabel={sessionClock.remainingLabel}
        renewal={vault.renewal}
        onRenewSession={renewSession}
        onOpenNavigation={() => setMobileNavigationOpen(true)}
      />
      <SessionExpiryBanner
        session={session}
        clock={sessionClock}
        renewal={vault.renewal}
        onRenew={renewSession}
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
          favorites={navigationHistory.favorites}
          recents={navigationHistory.recents}
          onPathSelect={openNavigationPath}
        />
        <Drawer
          open={mobileNavigationOpen}
          onClose={() => setMobileNavigationOpen(false)}
          title="Vault navigation"
          width="320px"
          side="left"
        >
          <Sidebar
            mobile
            collapsed={false}
            onToggleCollapse={() => {}}
            mounts={mounts}
            vaultHealth={vault.health}
            serverUrl={session.serverUrl}
            activeMount={activeMount}
            activePath={activePath}
            onMountSelect={(mount) => {
              setMobileNavigationOpen(false);
              navigate(`/explorer/${encodeURIComponent(mount)}`);
            }}
            onCreateMount={() => {
              setMobileNavigationOpen(false);
              setCreateMountOpen(true);
            }}
            showAccessControl={showAccessControl}
            activeAccessSection={activeAccessSection}
            onAccessSectionSelect={(section) => {
              setMobileNavigationOpen(false);
              navigate(`/access-control/${section}`);
            }}
            favorites={navigationHistory.favorites}
            recents={navigationHistory.recents}
            onPathSelect={(target) => {
              setMobileNavigationOpen(false);
              openNavigationPath(target);
            }}
          />
        </Drawer>
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
