import { useEffect, useRef, useState } from 'react';

import type {
  VaultSessionRenewalState,
  VaultSessionRevocationState,
} from '@/application/vault/VaultSessionContext';
import type { VaultHealth, VaultSession } from '@/domain/vault/contracts';
import RevokeSessionDialog from './RevokeSessionDialog';
import SessionMenu from './SessionMenu';

interface TopBarProps {
  session: VaultSession;
  health?: VaultHealth;
  onSignOut: () => void;
  onOpenCommandPalette?: () => void;
  onClearNavigationData?: () => void;
  remainingLabel?: string;
  renewal?: VaultSessionRenewalState;
  onRenewSession?: () => Promise<void>;
  revocation?: VaultSessionRevocationState;
  onRevokeSession?: () => Promise<void>;
  onOpenNavigation?: () => void;
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';

function sealIndicator(health: VaultHealth | undefined) {
  if (!health) return { dot: 'bg-foreground-300', label: 'Vault status unknown' };
  return health.sealed
    ? { dot: 'bg-danger-500', label: 'Vault sealed' }
    : { dot: 'bg-success-500', label: 'Vault unsealed' };
}

function sessionIdentity(session: VaultSession): string {
  return session.displayName || (session.authMethod === 'token' ? 'token session' : 'userpass user');
}

/** Closes a popover on outside pointer down or Escape. */
function useDismissable(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  return ref;
}

function Brand({ health, serverUrl, onOpenNavigation }: {
  readonly health?: VaultHealth;
  readonly serverUrl: string;
  readonly onOpenNavigation?: () => void;
}) {
  const seal = sealIndicator(health);
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-4">
      {onOpenNavigation && (
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenNavigation}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground-600 hover:bg-background-100 sm:hidden ${FOCUS_RING}`}
        >
          <i className="ri-menu-line text-lg" aria-hidden="true" />
        </button>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-500">
          <i className="ri-shield-keyhole-fill text-xs text-background-50" aria-hidden="true" />
        </div>
        <span className="truncate text-sm font-semibold tracking-tight text-foreground-900">Vault Console</span>
      </div>
      <div className="hidden items-center gap-1.5 text-xs text-foreground-500 sm:flex">
        <span className={`h-1.5 w-1.5 rounded-full ${seal.dot}`} aria-hidden="true" />
        <span className="sr-only">{seal.label}</span>
        <span className="max-w-[260px] truncate font-mono text-[11px]">{serverUrl}</span>
      </div>
      {health?.version && (
        <span className="hidden rounded bg-background-200 px-1.5 py-0 font-mono text-[10px] text-foreground-600 md:inline">v{health.version}</span>
      )}
    </div>
  );
}

export default function TopBar({
  session,
  health,
  onSignOut,
  onOpenCommandPalette,
  onClearNavigationData,
  remainingLabel = 'No fixed expiry',
  renewal = { status: 'idle' },
  onRenewSession,
  revocation = { status: 'idle' },
  onRevokeSession,
  onOpenNavigation,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const menuRef = useDismissable(menuOpen, () => setMenuOpen(false));
  const identity = sessionIdentity(session);
  const closeMenuAfter = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <>
    <div
      className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-background-200 bg-background-50 px-2 sm:h-11 sm:px-4"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'max(8px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(8px, env(safe-area-inset-right, 0px))',
      }}
    >
      <Brand health={health} serverUrl={session.serverUrl} onOpenNavigation={onOpenNavigation} />

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {onOpenCommandPalette && (
          <button
            type="button"
            aria-label="Open command palette"
            onClick={onOpenCommandPalette}
            className={`flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800 sm:h-7 sm:min-w-0 ${FOCUS_RING}`}
          >
            <i className="ri-search-line text-sm" aria-hidden="true" />
            <kbd className="hidden rounded border border-background-300 bg-background-100 px-1 py-0.5 font-mono text-[10px] text-foreground-500 md:inline">
              ⌘K
            </kbd>
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`Session menu for ${identity}`}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            onClick={() => setMenuOpen(!menuOpen)}
            className={`flex h-11 min-w-11 items-center gap-1.5 rounded-md px-2 text-xs text-foreground-600 transition-colors hover:bg-background-100 sm:h-7 sm:min-w-0 ${FOCUS_RING}`}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100">
              <span className="text-[10px] font-semibold text-primary-700">
                {identity.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="hidden max-w-28 truncate font-medium sm:inline">{identity}</span>
            <i className="ri-arrow-down-s-line text-xs text-foreground-400" aria-hidden="true" />
          </button>

          {menuOpen && (
            <SessionMenu
              session={session}
              identity={identity}
              remainingLabel={remainingLabel}
              renewal={renewal}
              onRenewSession={onRenewSession}
              onRequestRevoke={onRevokeSession ? closeMenuAfter(() => setRevokeOpen(true)) : undefined}
              onClearNavigationData={onClearNavigationData ? closeMenuAfter(onClearNavigationData) : undefined}
              onSignOut={closeMenuAfter(onSignOut)}
            />
          )}
        </div>
      </div>
    </div>
    <RevokeSessionDialog
      open={revokeOpen}
      revocation={revocation}
      onClose={() => setRevokeOpen(false)}
      onConfirm={onRevokeSession ?? (async () => undefined)}
    />
    </>
  );
}
