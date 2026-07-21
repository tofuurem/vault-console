import Tooltip from '@/components/base/Tooltip';
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
  readonly showAccessControl?: boolean;
  readonly activeAccessSection?: string;
  readonly onAccessSectionSelect?: (section: string) => void;
}

const accessSections = [
  { key: 'users', label: 'Users', icon: 'ri-user-settings-line' },
  { key: 'groups', label: 'Groups', icon: 'ri-group-line' },
  { key: 'roles', label: 'Roles', icon: 'ri-shield-check-line' },
  { key: 'policies', label: 'Policy Explorer', icon: 'ri-file-code-line' },
] as const;

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mounts,
  vaultHealth,
  serverUrl,
  activeMount,
  onMountSelect,
  showAccessControl,
  activeAccessSection,
  onAccessSectionSelect,
}: SidebarProps) {
  if (collapsed) {
    return (
      <aside aria-label="Vault navigation" className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-background-200 bg-background-100 py-3">
        <Tooltip content="Expand sidebar" position="right">
          <button type="button" aria-label="Expand sidebar" onClick={onToggleCollapse} className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-400 hover:bg-background-200 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className="ri-layout-right-2-line text-sm" aria-hidden="true" />
          </button>
        </Tooltip>
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
    <aside aria-label="Vault navigation" className="flex w-11 shrink-0 flex-col border-r border-background-200 bg-background-100 sm:w-[240px]">
      <div className="flex h-9 items-center justify-center border-b border-background-200 px-2 sm:justify-between sm:px-3">
        <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-foreground-500 sm:inline">KV v2 mounts</span>
        <Tooltip content="Collapse sidebar" position="right">
          <button type="button" aria-label="Collapse sidebar" onClick={onToggleCollapse} className="hidden h-5 w-5 items-center justify-center rounded text-foreground-400 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:flex">
            <i className="ri-layout-left-2-line text-xs" aria-hidden="true" />
          </button>
        </Tooltip>
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
            className={`flex min-h-9 w-full items-center justify-center gap-2 px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-8 sm:justify-start sm:px-3 ${activeMount === mount.path ? 'bg-primary-100 font-medium text-primary-700' : 'text-foreground-700 hover:bg-background-200'}`}
          >
            <i className="ri-folder-keyhole-line shrink-0 text-sm text-primary-500" aria-hidden="true" />
            <span className="hidden min-w-0 flex-1 truncate font-mono sm:inline">{mount.path}/</span>
            <span className="hidden rounded bg-background-200 px-1 py-0.5 font-mono text-[9px] text-foreground-400 sm:inline">v2</span>
          </button>
        ))}

        {showAccessControl && (
          <div className="mt-3 border-t border-background-200 pt-3">
            <div className="hidden h-6 items-center px-3 sm:flex">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">Access control</span>
            </div>
            {accessSections.map((section) => (
              <button
                key={section.key}
                type="button"
                aria-label={section.label}
                onClick={() => onAccessSectionSelect?.(section.key)}
                className={`flex h-9 w-full items-center justify-center gap-2 px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:h-8 sm:justify-start sm:px-3 ${activeAccessSection === section.key ? 'bg-primary-100 font-medium text-primary-700' : 'text-foreground-700 hover:bg-background-200'}`}
              >
                <i className={`${section.icon} shrink-0 text-xs`} aria-hidden="true" />
                <span className="hidden truncate sm:inline">{section.label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="hidden space-y-0.5 border-t border-background-200 px-3 py-2 text-[10px] text-foreground-400 sm:block">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${vaultHealth?.sealed ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <span>{vaultHealth?.sealed ? 'Sealed' : 'Unsealed'}</span>
          {vaultHealth?.standby && <span>· standby</span>}
        </div>
        <div>TLS: {serverUrl?.startsWith('https://') ? 'Enabled' : 'Disabled'}</div>
        {vaultHealth?.version && <div className="font-mono">v{vaultHealth.version}</div>}
      </div>
    </aside>
  );
}
