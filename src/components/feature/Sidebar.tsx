import { Link } from 'react-router-dom';

import Tooltip from '@/components/base/Tooltip';
import type {
  FavoriteNavigationPath,
  NavigationPath,
  RecentNavigationPath,
} from '@/application/navigation-history/navigation-history';
import { engineIcon, type SecretEngine } from '@/domain/engines/engines';
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
  /** Non-KV secrets engines; KV v2 mounts are listed separately. */
  readonly engines?: readonly SecretEngine[];
  readonly activeEngine?: string;
  readonly onEngineSelect?: (path: string) => void;
  readonly onEnableEngine?: () => void;
  readonly showAccessControl?: boolean;
  readonly activeAccessCenter?: boolean;
  readonly onAccessCenterSelect?: () => void;
  readonly activeOverview?: boolean;
  readonly onOverviewSelect?: () => void;
  readonly showActivity?: boolean;
  readonly activeActivity?: boolean;
  readonly onActivitySelect?: () => void;
  readonly favorites?: readonly FavoriteNavigationPath[];
  readonly recents?: readonly RecentNavigationPath[];
  readonly onPathSelect?: (path: NavigationPath) => void;
  readonly mobile?: boolean;
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';
const RAIL_BUTTON = `flex h-8 w-8 items-center justify-center rounded-md text-xs ${FOCUS_RING}`;

/** Row geometry shared by every navigation entry in the expanded sidebar. */
function rowLayout(mobile: boolean): string {
  return mobile
    ? 'min-h-11 justify-start px-4'
    : 'min-h-9 justify-center px-2 sm:min-h-8 sm:justify-start sm:px-3';
}

// Full class names so Tailwind can see them in source.
const WIDE_ONLY = {
  inline: 'hidden sm:inline',
  flex: 'hidden sm:flex',
  block: 'hidden sm:block',
} as const;

function wideOnly(mobile: boolean, display: keyof typeof WIDE_ONLY = 'inline'): string {
  return mobile ? display : WIDE_ONLY[display];
}

function activeRow(active: boolean | undefined): string {
  return active
    ? 'bg-primary-100 font-medium text-primary-700'
    : 'text-foreground-700 hover:bg-background-200';
}

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
      <div className={`${wideOnly(mobile, 'flex')} h-6 items-center px-3`}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-500">
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
            title={logicalPath}
            onClick={() => onPathSelect(path)}
            className={`flex w-full items-center gap-2 text-left text-xs text-foreground-600 transition-colors hover:bg-background-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${rowLayout(mobile)}`}
          >
            <i className={`${icon} shrink-0 text-xs`} aria-hidden="true" />
            <span className={`${wideOnly(mobile)} min-w-0 flex-1 truncate font-mono text-[11px]`}>
              {logicalPath}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CollapsedSidebar({
  onToggleCollapse,
  mounts,
  activeMount,
  onMountSelect,
  onCreateMount,
  engines = [],
  activeEngine,
  onEngineSelect,
  showAccessControl,
  activeAccessCenter,
  onAccessCenterSelect,
  showActivity,
  activeActivity,
  onActivitySelect,
}: SidebarProps) {
  return (
    <aside aria-label="Vault navigation" className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-background-200 bg-background-100 py-3 sm:flex">
      <Tooltip content="Expand sidebar" position="right">
        <button type="button" aria-label="Expand sidebar" onClick={onToggleCollapse} className={`${RAIL_BUTTON} text-foreground-500 hover:bg-background-200 hover:text-foreground-800`}>
          <i className="ri-layout-right-2-line text-sm" aria-hidden="true" />
        </button>
      </Tooltip>
      {onCreateMount && (
        <Tooltip content="Create KV v2 mount" position="right">
          <button type="button" aria-label="Create KV v2 mount" onClick={onCreateMount} className={`${RAIL_BUTTON} text-primary-600 hover:bg-primary-100`}>
            <i className="ri-add-line text-sm" aria-hidden="true" />
          </button>
        </Tooltip>
      )}
      {mounts.map((mount) => (
        <Tooltip key={mount.path} content={mount.path} position="right">
          <button
            type="button"
            aria-label={`Open ${mount.path} mount`}
            aria-current={activeMount === mount.path ? 'page' : undefined}
            onClick={() => onMountSelect(mount.path)}
            className={`${RAIL_BUTTON} ${activeMount === mount.path ? 'bg-primary-100 text-primary-700' : 'text-foreground-500 hover:bg-background-200'}`}
          >
            <i className="ri-folder-keyhole-line text-sm" aria-hidden="true" />
          </button>
        </Tooltip>
      ))}
      {onEngineSelect && engines.length > 0 && (
        <div className="my-1 h-px w-6 bg-background-300" aria-hidden="true" />
      )}
      {onEngineSelect && engines.map((engine) => (
        <Tooltip key={engine.path} content={`${engine.path}/ · ${engine.type}`} position="right">
          <button
            type="button"
            aria-label={`Open ${engine.path} engine`}
            aria-current={activeEngine === engine.path ? 'page' : undefined}
            onClick={() => onEngineSelect(engine.path)}
            className={`${RAIL_BUTTON} ${activeEngine === engine.path ? 'bg-primary-100 text-primary-700' : 'text-foreground-500 hover:bg-background-200'}`}
          >
            <i className={`${engineIcon(engine.kind)} text-sm`} aria-hidden="true" />
          </button>
        </Tooltip>
      ))}
      {(showAccessControl || showActivity) && (
        <div className="my-1 h-px w-6 bg-background-300" aria-hidden="true" />
      )}
      {showActivity && (
        <Tooltip content="Activity" position="right">
          <button
            type="button"
            aria-label="Activity"
            aria-current={activeActivity ? 'page' : undefined}
            onClick={onActivitySelect}
            className={`${RAIL_BUTTON} ${activeActivity ? 'bg-primary-100 text-primary-700' : 'text-foreground-500 hover:bg-background-200'}`}
          >
            <i className="ri-pulse-line text-sm" aria-hidden="true" />
          </button>
        </Tooltip>
      )}
      {showAccessControl && (
        <>
          <Tooltip content="Access Center" position="right">
            <button
              type="button"
              aria-label="Access Center"
              aria-current={activeAccessCenter ? 'page' : undefined}
              onClick={onAccessCenterSelect}
              className={`${RAIL_BUTTON} ${activeAccessCenter ? 'bg-primary-100 text-primary-700' : 'text-foreground-500 hover:bg-background-200'}`}
            >
              <i className="ri-shield-user-line text-sm" aria-hidden="true" />
            </button>
          </Tooltip>
        </>
      )}
    </aside>
  );
}

function SidebarHeader({
  mobile,
  onCreateMount,
  onToggleCollapse,
}: {
  readonly mobile: boolean;
  readonly onCreateMount?: () => void;
  readonly onToggleCollapse: () => void;
}) {
  return (
    <div className={`flex items-center border-b border-background-200 ${
      mobile
        ? 'min-h-11 justify-between px-4'
        : 'h-9 justify-center px-2 sm:justify-between sm:px-3'
    }`}>
      <span className={`${wideOnly(mobile)} text-[11px] font-semibold uppercase tracking-wider text-foreground-500`}>KV v2 mounts</span>
      <div className="flex items-center gap-1">
        {onCreateMount && (
          <Tooltip content="Create KV v2 mount" position="right">
            <button type="button" aria-label="Create KV v2 mount" onClick={onCreateMount} className={`flex items-center justify-center rounded text-primary-600 hover:bg-primary-100 ${FOCUS_RING} ${mobile ? 'h-11 w-11' : 'h-6 w-6'}`}>
              <i className="ri-add-line text-sm" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {!mobile && (
          <Tooltip content="Collapse sidebar" position="right">
            <button type="button" aria-label="Collapse sidebar" onClick={onToggleCollapse} className={`hidden h-6 w-6 items-center justify-center rounded text-foreground-500 hover:bg-background-200 hover:text-foreground-800 sm:flex ${FOCUS_RING}`}>
              <i className="ri-layout-left-2-line text-xs" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function MountList({
  mounts,
  activeMount,
  onMountSelect,
  mobile,
}: Pick<SidebarProps, 'mounts' | 'activeMount' | 'onMountSelect'> & { readonly mobile: boolean }) {
  if (mounts.length === 0) {
    return <p className="px-3 py-4 text-xs leading-5 text-foreground-500">No visible KV v2 mounts.</p>;
  }
  return mounts.map((mount) => (
    <button
      key={mount.path}
      type="button"
      aria-label={`Open ${mount.path} mount`}
      aria-current={activeMount === mount.path ? 'page' : undefined}
      onClick={() => onMountSelect(mount.path)}
      className={`flex w-full items-center gap-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${rowLayout(mobile)} ${activeRow(activeMount === mount.path)}`}
    >
      <i className="ri-folder-keyhole-line shrink-0 text-sm text-primary-500" aria-hidden="true" />
      <span className={`${wideOnly(mobile)} min-w-0 flex-1 truncate font-mono`}>{mount.path}/</span>
      <span className={`${wideOnly(mobile)} rounded bg-background-200 px-1 py-0.5 font-mono text-[10px] text-foreground-600`}>v2</span>
    </button>
  ));
}

function EnginesSection({
  mobile,
  engines,
  activeEngine,
  onEngineSelect,
  onEnableEngine,
}: {
  readonly mobile: boolean;
  readonly engines: readonly SecretEngine[];
  readonly activeEngine?: string;
  readonly onEngineSelect: (path: string) => void;
  readonly onEnableEngine?: () => void;
}) {
  return (
    <div className="mt-3 border-t border-background-200 pt-2">
      <div className={`${wideOnly(mobile, 'flex')} h-6 items-center justify-between px-3`}>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">Secrets engines</span>
        {onEnableEngine && (
          <Tooltip content="Enable secrets engine" position="right">
            <button type="button" aria-label="Enable secrets engine" onClick={onEnableEngine} className={`flex items-center justify-center rounded text-primary-600 hover:bg-primary-100 ${FOCUS_RING} ${mobile ? 'h-11 w-11' : 'h-6 w-6'}`}>
              <i className="ri-add-line text-sm" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      {engines.length === 0 && (
        <p className={`${wideOnly(mobile, 'block')} px-3 py-2 text-xs leading-5 text-foreground-500`}>No other engines visible.</p>
      )}
      {engines.map((engine) => (
        <button
          key={engine.path}
          type="button"
          aria-label={`Open ${engine.path} engine`}
          aria-current={activeEngine === engine.path ? 'page' : undefined}
          title={engine.description || undefined}
          onClick={() => onEngineSelect(engine.path)}
          className={`flex w-full items-center gap-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${rowLayout(mobile)} ${activeRow(activeEngine === engine.path)}`}
        >
          <i className={`${engineIcon(engine.kind)} shrink-0 text-sm text-primary-500`} aria-hidden="true" />
          <span className={`${wideOnly(mobile)} min-w-0 flex-1 truncate font-mono`}>{engine.path}/</span>
          <span className={`${wideOnly(mobile)} rounded bg-background-200 px-1 py-0.5 font-mono text-[10px] text-foreground-600`}>{engine.type}</span>
        </button>
      ))}
    </div>
  );
}

function AdministrationSection({
  mobile,
  showAccessControl,
  activeAccessCenter,
  onAccessCenterSelect,
  showActivity,
  activeActivity,
  onActivitySelect,
}: {
  readonly mobile: boolean;
  readonly showAccessControl?: boolean;
  readonly activeAccessCenter?: boolean;
  readonly onAccessCenterSelect?: () => void;
  readonly showActivity?: boolean;
  readonly activeActivity?: boolean;
  readonly onActivitySelect?: () => void;
}) {
  return (
    <div className="mt-3 border-t border-background-200 pt-3">
      <div className={`${wideOnly(mobile, 'flex')} h-6 items-center px-3`}>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">Administration</span>
      </div>
      {showAccessControl && (
        <button
          type="button"
          aria-label="Access Center"
          aria-current={activeAccessCenter ? 'page' : undefined}
          onClick={onAccessCenterSelect}
          className={`flex w-full items-center gap-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${rowLayout(mobile)} ${activeRow(activeAccessCenter)}`}
        >
          <i className="ri-shield-user-line shrink-0 text-sm" aria-hidden="true" />
          <span className={`${wideOnly(mobile)} truncate`}>Access Center</span>
        </button>
      )}
      {showActivity && (
        <button
          type="button"
          aria-label="Activity"
          aria-current={activeActivity ? 'page' : undefined}
          onClick={onActivitySelect}
          className={`flex w-full items-center gap-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${rowLayout(mobile)} ${activeRow(activeActivity)}`}
        >
          <i className="ri-pulse-line shrink-0 text-sm" aria-hidden="true" />
          <span className={`${wideOnly(mobile)} truncate`}>Activity</span>
        </button>
      )}
    </div>
  );
}

function sealPresentation(health: VaultHealth | undefined) {
  if (!health) return { icon: 'ri-question-line', tone: 'text-foreground-500', label: 'Status unknown' };
  if (health.sealed) return { icon: 'ri-lock-2-fill', tone: 'text-danger-600', label: 'Sealed' };
  return { icon: 'ri-lock-unlock-line', tone: 'text-success-600', label: health.standby ? 'Unsealed · standby' : 'Unsealed' };
}

function VaultStatus({
  mobile,
  vaultHealth,
  serverUrl,
}: {
  readonly mobile: boolean;
  readonly vaultHealth?: VaultHealth;
  readonly serverUrl?: string;
}) {
  const seal = sealPresentation(vaultHealth);
  const tls = serverUrl?.startsWith('https://');
  return (
    <div className={`${wideOnly(mobile, 'block')} border-t border-background-200 p-2`}>
      <div className="flex items-center gap-2.5 rounded-md bg-background-50 px-2.5 py-2 ring-1 ring-background-200">
        <i className={`${seal.icon} text-base ${seal.tone}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[11px] font-medium text-foreground-800">Vault {seal.label.toLowerCase()}</p>
          <p className="truncate font-mono text-[10px] tabular-nums text-foreground-500">
            {vaultHealth?.version ? `v${vaultHealth.version}` : 'version unknown'} · {tls ? 'TLS' : 'no TLS'}
          </p>
        </div>
        {vaultHealth?.sealed && (
          <Link to="/unseal" className={`shrink-0 rounded px-1 text-[11px] font-medium text-primary-700 underline-offset-2 hover:underline ${FOCUS_RING}`}>
            Unseal
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Sidebar(props: SidebarProps) {
  const {
    collapsed,
    onToggleCollapse,
    mounts,
    vaultHealth,
    serverUrl,
    activeMount,
    onMountSelect,
    onCreateMount,
    engines = [],
    activeEngine,
    onEngineSelect,
    onEnableEngine,
    showAccessControl,
    activeAccessCenter,
    onAccessCenterSelect,
    showActivity,
    activeActivity,
    onActivitySelect,
    activeOverview,
    onOverviewSelect,
    favorites = [],
    recents = [],
    onPathSelect,
    mobile = false,
  } = props;
  if (collapsed && !mobile) return <CollapsedSidebar {...props} />;

  return (
    <aside
      aria-label="Vault navigation"
      className={`${mobile
        ? 'flex h-full w-full'
        : 'hidden w-12 shrink-0 sm:flex sm:w-[240px]'} flex-col border-r border-background-200 bg-background-100`}
    >
      {onOverviewSelect && (
        <button
          type="button"
          aria-label="Overview"
          aria-current={activeOverview ? 'page' : undefined}
          onClick={onOverviewSelect}
          className={`flex w-full items-center gap-2 border-b border-background-200 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${rowLayout(mobile)} ${activeRow(activeOverview)}`}
        >
          <i className="ri-dashboard-line shrink-0 text-sm" aria-hidden="true" />
          <span className={`${wideOnly(mobile)} truncate`}>Overview</span>
        </button>
      )}
      <SidebarHeader mobile={mobile} onCreateMount={onCreateMount} onToggleCollapse={onToggleCollapse} />

      <nav className="flex-1 overflow-y-auto py-1" aria-label="Secret mounts">
        <MountList mounts={mounts} activeMount={activeMount} onMountSelect={onMountSelect} mobile={mobile} />

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

        {onEngineSelect && (
          <EnginesSection
            mobile={mobile}
            engines={engines}
            activeEngine={activeEngine}
            onEngineSelect={onEngineSelect}
            onEnableEngine={onEnableEngine}
          />
        )}

        {(showAccessControl || showActivity) && (
          <AdministrationSection
            mobile={mobile}
            showAccessControl={showAccessControl}
            activeAccessCenter={activeAccessCenter}
            onAccessCenterSelect={onAccessCenterSelect}
            showActivity={showActivity}
            activeActivity={activeActivity}
            onActivitySelect={onActivitySelect}
          />
        )}
      </nav>

      <VaultStatus mobile={mobile} vaultHealth={vaultHealth} serverUrl={serverUrl} />
    </aside>
  );
}
