import Tooltip from '@/components/base/Tooltip';
import type {
  FavoriteNavigationPath,
  NavigationPath,
  RecentNavigationPath,
} from '@/application/navigation-history/navigation-history';
import type { KvV2Mount, VaultHealth } from '@/domain/vault/contracts';

interface SidebarProps {
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly mounts: readonly KvV2Mount[];
  readonly vaultHealth?: VaultHealth;
  readonly serverUrl?: string;
  readonly activeMount: string;
  readonly activePath: string;
  readonly onMountSelect: (mount: string) => void;
  readonly onCreateMount?: () => void;
  readonly showAccessControl?: boolean;
  readonly activeAccessSection?: string;
  readonly onAccessSectionSelect?: (section: string) => void;
  readonly favorites?: readonly FavoriteNavigationPath[];
  readonly recents?: readonly RecentNavigationPath[];
  readonly onPathSelect?: (path: NavigationPath) => void;
  readonly mobile?: boolean;
}

const accessSections = [
  { key: 'users', label: 'Users', icon: 'ri-user-settings-line' },
  { key: 'groups', label: 'Groups', icon: 'ri-group-line' },
  { key: 'roles', label: 'Roles', icon: 'ri-shield-check-line' },
  { key: 'policies', label: 'Policy Explorer', icon: 'ri-file-code-line' },
] as const;

function PathSection({
  title,
  icon,
  paths,
  onPathSelect,
  mobile = false,
}: {
  readonly title: string;
  readonly icon: string;
  readonly paths: readonly NavigationPath[];
  readonly onPathSelect: (path: NavigationPath) => void;
  readonly mobile?: boolean;
}) {
  if (paths.length === 0) return null;
  return (
    <div className="mt-3 border-t border-background-200 pt-2">
      <div className={`${mobile ? 'flex' : 'hidden sm:flex'} h-6 items-center px-3`}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-400">
          {title}
        </span>
      </div>
      {paths.slice(0, 8).map((path) => {
        const logicalPath = `${path.mount}/${path.path}`;
        return (
          <button
            key={`${path.kind}:${logicalPath}`}
            type="button"
            aria-label={`Open ${title.toLowerCase()} path ${logicalPath}`}
            onClick={() => onPathSelect(path)}
            className={`flex w-full items-center gap-2 text-left text-xs text-foreground-600 transition-colors hover:bg-background-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${
              mobile
                ? 'min-h-11 justify-start px-4'
                : 'min-h-9 justify-center px-2 sm:min-h-8 sm:justify-start sm:px-3'
            }`}
          >
            <i className={`${icon} shrink-0 text-xs`} aria-hidden="true" />
            <span className={`${mobile ? 'inline' : 'hidden sm:inline'} min-w-0 flex-1 truncate font-mono text-[10px]`}>
              {logicalPath}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mounts,
  vaultHealth,
  serverUrl,
  activeMount,
  onMountSelect,
  onCreateMount,
  showAccessControl,
  activeAccessSection,
  onAccessSectionSelect,
  favorites = [],
  recents = [],
  onPathSelect,
  mobile = false,
}: SidebarProps) {
  if (collapsed && !mobile) {
    return (
      <aside aria-label="Vault navigation" className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r border-background-200 bg-background-100 py-3 sm:flex">
        <Tooltip content="Expand sidebar" position="right">
          <button type="button" aria-label="Expand sidebar" onClick={onToggleCollapse} className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-400 hover:bg-background-200 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className="ri-layout-right-2-line text-sm" aria-hidden="true" />
          </button>
        </Tooltip>
        {onCreateMount && (
          <Tooltip content="Create KV v2 mount" position="right">
            <button type="button" aria-label="Create KV v2 mount" onClick={onCreateMount} className="flex h-7 w-7 items-center justify-center rounded-md text-primary-600 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              <i className="ri-add-line text-sm" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {mounts.map((mount) => (
          <Tooltip key={mount.path} content={mount.path} position="right">
            <button
              type="button"
              aria-label={`Open ${mount.path} mount`}
              onClick={() => onMountSelect(mount.path)}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${activeMount === mount.path ? 'bg-primary-100 text-primary-700' : 'text-foreground-400 hover:bg-background-200'}`}
            >
              <i className="ri-folder-keyhole-line text-sm" aria-hidden="true" />
            </button>
          </Tooltip>
        ))}
        {showAccessControl && (
          <>
            <div className="my-1 h-px w-6 bg-background-300" />
            {accessSections.map((section) => (
              <Tooltip key={section.key} content={section.label} position="right">
                <button
                  type="button"
                  aria-label={section.label}
                  onClick={() => onAccessSectionSelect?.(section.key)}
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${activeAccessSection === section.key ? 'bg-primary-100 text-primary-700' : 'text-foreground-400 hover:bg-background-200'}`}
                >
                  <i className={`${section.icon} text-sm`} aria-hidden="true" />
                </button>
              </Tooltip>
            ))}
          </>
        )}
      </aside>
    );
  }

  return (
    <aside
      aria-label="Vault navigation"
      className={`${mobile
        ? 'flex h-full w-full'
        : 'hidden w-11 shrink-0 sm:flex sm:w-[240px]'} flex-col border-r border-background-200 bg-background-100`}
    >
      <div className={`flex items-center border-b border-background-200 ${
        mobile
          ? 'min-h-11 justify-between px-4'
          : 'h-9 justify-center px-2 sm:justify-between sm:px-3'
      }`}>
        <span className={`${mobile ? 'inline' : 'hidden sm:inline'} text-[11px] font-semibold uppercase tracking-wider text-foreground-500`}>KV v2 mounts</span>
        <div className="flex items-center gap-1">
          {onCreateMount && (
            <Tooltip content="Create KV v2 mount" position="right">
              <button type="button" aria-label="Create KV v2 mount" onClick={onCreateMount} className={`flex items-center justify-center rounded text-primary-600 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${mobile ? 'h-11 w-11' : 'h-6 w-6'}`}>
                <i className="ri-add-line text-sm" aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          {!mobile && (
            <Tooltip content="Collapse sidebar" position="right">
              <button type="button" aria-label="Collapse sidebar" onClick={onToggleCollapse} className="hidden h-5 w-5 items-center justify-center rounded text-foreground-400 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:flex">
                <i className="ri-layout-left-2-line text-xs" aria-hidden="true" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-1" aria-label="Secret mounts">
        {mounts.length === 0 && (
          <p className="px-3 py-4 text-xs leading-5 text-foreground-400">No visible KV v2 mounts.</p>
        )}
        {mounts.map((mount) => (
          <button
            key={mount.path}
            type="button"
            aria-label={`Open ${mount.path} mount`}
            onClick={() => onMountSelect(mount.path)}
            className={`flex w-full items-center gap-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${
              mobile
                ? 'min-h-11 justify-start px-4'
                : 'min-h-9 justify-center px-2 sm:min-h-8 sm:justify-start sm:px-3'
            } ${activeMount === mount.path ? 'bg-primary-100 font-medium text-primary-700' : 'text-foreground-700 hover:bg-background-200'}`}
          >
            <i className="ri-folder-keyhole-line shrink-0 text-sm text-primary-500" aria-hidden="true" />
            <span className={`${mobile ? 'inline' : 'hidden sm:inline'} min-w-0 flex-1 truncate font-mono`}>{mount.path}/</span>
            <span className={`${mobile ? 'inline' : 'hidden sm:inline'} rounded bg-background-200 px-1 py-0.5 font-mono text-[9px] text-foreground-400`}>v2</span>
          </button>
        ))}

        {onPathSelect && (
          <>
            <PathSection
              title="Favorites"
              icon="ri-star-fill text-warning-500"
              paths={favorites}
              onPathSelect={onPathSelect}
              mobile={mobile}
            />
            <PathSection
              title="Recent"
              icon="ri-history-line"
              paths={recents}
              onPathSelect={onPathSelect}
              mobile={mobile}
            />
          </>
        )}

        {showAccessControl && (
          <div className="mt-3 border-t border-background-200 pt-3">
            <div className={`${mobile ? 'flex' : 'hidden sm:flex'} h-6 items-center px-3`}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">Access control</span>
            </div>
            {accessSections.map((section) => (
              <button
                key={section.key}
                type="button"
                aria-label={section.label}
                onClick={() => onAccessSectionSelect?.(section.key)}
                className={`flex w-full items-center gap-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${
                  mobile
                    ? 'h-11 justify-start px-4'
                    : 'h-9 justify-center px-2 sm:h-8 sm:justify-start sm:px-3'
                } ${activeAccessSection === section.key ? 'bg-primary-100 font-medium text-primary-700' : 'text-foreground-700 hover:bg-background-200'}`}
              >
                <i className={`${section.icon} shrink-0 text-xs`} aria-hidden="true" />
                <span className={`${mobile ? 'inline' : 'hidden sm:inline'} truncate`}>{section.label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className={`${mobile ? 'block' : 'hidden sm:block'} space-y-0.5 border-t border-background-200 px-3 py-2 text-[10px] text-foreground-400`}>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${vaultHealth?.sealed ? 'bg-danger-500' : 'bg-success-500'}`} />
          <span>{vaultHealth?.sealed ? 'Sealed' : 'Unsealed'}</span>
          {vaultHealth?.standby && <span>· standby</span>}
        </div>
        <div>TLS: {serverUrl?.startsWith('https://') ? 'Enabled' : 'Disabled'}</div>
        {vaultHealth?.version && <div className="font-mono">v{vaultHealth.version}</div>}
      </div>
    </aside>
  );
}
