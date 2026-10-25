import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useNavigationHistory } from '@/application/navigation-history/NavigationHistoryContext';
import type { NavigationPath } from '@/application/navigation-history/navigation-history';
import { useShortcuts } from '@/application/shortcuts/ShortcutContext';
import {
  buildKvIndexCommand,
  buildVaultPathCommands,
} from '@/application/shortcuts/vault-path-commands';
import { useTheme } from '@/application/theme/ThemeContext';
import { useKvSearch } from '@/application/vault/search/KvSearchContext';
import type { KvV2Mount } from '@/domain/vault/contracts';

const ACCESS_COMMANDS = [
  ['users', 'Open users', 'ri-user-settings-line'],
  ['groups', 'Open groups', 'ri-group-line'],
  ['roles', 'Open roles', 'ri-shield-check-line'],
  ['policies', 'Open Policy Explorer', 'ri-file-code-line'],
] as const;

interface ShellCommandOptions {
  readonly mounts: readonly KvV2Mount[];
  readonly activeMount: string;
  readonly showAccessControl: boolean;
  readonly refreshMounts: () => void;
  /** Must be referentially stable. */
  readonly onCreateMount: () => void;
  readonly onOpenPath: (target: NavigationPath) => void;
}

/** Command palette entries for the authenticated workspace. */
export function useShellCommands({
  mounts,
  activeMount,
  showAccessControl,
  refreshMounts,
  onCreateMount,
  onOpenPath,
}: ShellCommandOptions) {
  const navigate = useNavigate();
  const theme = useTheme();
  const shortcuts = useShortcuts();
  const kvSearch = useKvSearch();
  const navigationHistory = useNavigationHistory();
  const activeSearchState = kvSearch.stateFor(activeMount);
  const pathCommands = useMemo(() => buildVaultPathCommands({
    favorites: navigationHistory.favorites,
    recents: navigationHistory.recents,
    indexed: shortcuts.paletteOpen ? activeSearchState.entries : [],
    onOpen: onOpenPath,
  }), [
    activeSearchState.entries,
    navigationHistory.favorites,
    navigationHistory.recents,
    onOpenPath,
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

  return useMemo(() => [
    {
      id: 'action-create-kv-mount',
      label: 'Create KV v2 mount',
      group: 'Actions',
      keywords: ['enable', 'secrets engine', 'mount'],
      icon: 'ri-folder-add-line',
      run: onCreateMount,
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
    ...(showAccessControl ? [
      {
        id: 'access-center',
        label: 'Open Access Center',
        group: 'Access control',
        keywords: ['identity', 'acl', 'users', 'groups', 'roles', 'policies'],
        icon: 'ri-shield-user-line',
        run: () => navigate('/access-control/users'),
      },
      ...ACCESS_COMMANDS.map(([section, label, icon]) => ({
        id: `access-${section}`,
        label,
        group: 'Access control',
        keywords: ['identity', 'acl', section],
        icon,
        run: () => navigate(`/access-control/${section}`),
      })),
    ] : []),
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
    onCreateMount,
    indexCommand,
    pathCommands,
    refreshMounts,
    showAccessControl,
    theme,
  ]);
}
