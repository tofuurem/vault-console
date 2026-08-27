import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/application/theme/ThemeContext';
import type {
  VaultSessionRenewalState,
  VaultSessionRevocationState,
} from '@/application/vault/VaultSessionContext';
import type { VaultHealth, VaultSession } from '@/domain/vault/contracts';
import RevokeSessionDialog from './RevokeSessionDialog';

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
  const [copyStatus, setCopyStatus] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const identity = session.displayName || (session.authMethod === 'token' ? 'token session' : 'userpass user');

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(session.token.reveal());
      setCopyStatus('Token copied');
    } catch {
      setCopyStatus('Clipboard unavailable');
    }
  };

  const renewalLabel = renewal.status === 'succeeded'
    ? 'Last renewal succeeded'
    : renewal.status === 'failed'
      ? 'Last renewal failed'
      : renewal.status === 'renewing'
        ? 'Renewing now'
        : 'Not renewed in this session';

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
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        {onOpenNavigation && (
          <button
            type="button"
            aria-label="Open navigation"
            onClick={onOpenNavigation}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground-600 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:hidden"
          >
            <i className="ri-menu-line text-lg" aria-hidden="true" />
          </button>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-500">
            <i className="ri-shield-keyhole-fill text-background-50 text-xs" aria-hidden="true" />
          </div>
          <span className="truncate text-sm font-semibold tracking-tight text-foreground-900">Vault Console</span>
        </div>
        <div className="hidden items-center gap-1.5 text-xs text-foreground-500 sm:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${health?.sealed ? 'bg-danger-500' : 'bg-success-500'}`} />
          <span className="sr-only">{health?.sealed ? 'Vault sealed' : 'Vault unsealed'}</span>
          <span className="max-w-[260px] truncate font-mono text-[11px]">{session.serverUrl}</span>
        </div>
        {health?.version && (
          <span className="hidden rounded bg-background-200 px-1.5 py-0 font-mono text-[10px] text-foreground-500 md:inline">v{health.version}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {onOpenCommandPalette && (
          <button
            type="button"
            aria-label="Open command palette"
            onClick={onOpenCommandPalette}
            className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800 sm:h-7 sm:min-w-0"
          >
            <i className="ri-search-line text-sm" aria-hidden="true" />
            <kbd className="hidden rounded border border-background-300 bg-background-100 px-1 py-0.5 font-mono text-[9px] text-foreground-400 md:inline">
              ⌘K
            </kbd>
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`Session menu for ${identity}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-11 min-w-11 items-center gap-1.5 rounded-md px-2 text-xs text-foreground-600 transition-colors hover:bg-background-100 sm:h-7 sm:min-w-0"
          >
            <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-[10px] font-semibold text-primary-700">
                {identity.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="hidden max-w-28 truncate font-medium sm:inline">{identity}</span>
            <i className="ri-arrow-down-s-line text-xs text-foreground-400" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-16px)] rounded-md border border-background-300 bg-background-50 py-1 shadow-sm">
              <div className="px-3 py-2 border-b border-background-200">
                <div className="text-xs font-medium text-foreground-900">{identity}</div>
                <dl className="mt-2 space-y-1 text-[10px]">
                  <div className="flex justify-between gap-3"><dt className="text-foreground-400">Authentication</dt><dd className="font-medium text-foreground-700">{session.authMethod}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-foreground-400">Vault address</dt><dd className="max-w-44 truncate font-mono text-foreground-700" title={session.serverUrl}>{session.serverUrl}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-foreground-400">Expires</dt><dd className="text-right font-medium text-foreground-700">{remainingLabel}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-foreground-400">Renewable</dt><dd className="font-medium text-foreground-700">{session.renewable === true ? 'Yes' : 'No'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-foreground-400">Renewal</dt><dd className="text-right font-medium text-foreground-700">{renewalLabel}</dd></div>
                </dl>
                {renewal.status === 'succeeded' && (
                  <p className="mt-1 text-[10px] font-medium text-success-700">
                    Session renewed with Vault&apos;s returned TTL.
                  </p>
                )}
                {renewal.status === 'failed' && (
                  <p className="mt-1 text-[10px] font-medium text-danger-700" role="alert">
                    Renewal failed; this session remains active until expiry.
                  </p>
                )}
              </div>
              <fieldset className="border-b border-background-200 px-3 py-2">
                <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-400">
                  Appearance
                </legend>
                <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Appearance">
                  {([
                    ['system', 'ri-computer-line', 'System'],
                    ['light', 'ri-sun-line', 'Light'],
                    ['dark', 'ri-moon-line', 'Dark'],
                  ] as const).map(([preference, icon, label]) => (
                    <button
                      key={preference}
                      type="button"
                      role="radio"
                      aria-checked={theme.preference === preference}
                      onClick={() => theme.setPreference(preference)}
                      className={`flex h-11 items-center justify-center gap-1 rounded border text-[10px] font-medium transition-colors sm:h-8 ${
                        theme.preference === preference
                          ? 'border-primary-300 bg-primary-100 text-primary-700'
                          : 'border-background-200 text-foreground-500 hover:bg-background-100 hover:text-foreground-800'
                      }`}
                    >
                      <i className={`${icon} text-xs`} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
                {!theme.persistenceAvailable && (
                  <p className="mt-1.5 text-[10px] leading-4 text-warning-700">
                    This choice applies only until the page closes.
                  </p>
                )}
              </fieldset>
              <button
                type="button"
                onClick={() => void copyToken()}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground-700 hover:bg-background-100 sm:min-h-0"
              >
                <i className={`${copyStatus === 'Token copied' ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} text-sm`} aria-hidden="true" />
                {copyStatus || 'Copy token'}
              </button>
              {session.renewable === true && onRenewSession && (
                <button
                  type="button"
                  disabled={renewal.status === 'renewing'}
                  onClick={() => void onRenewSession().catch(() => undefined)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground-700 hover:bg-background-100 disabled:cursor-wait disabled:text-foreground-400 sm:min-h-0"
                >
                  <i
                    className={`${renewal.status === 'renewing' ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} text-sm`}
                    aria-hidden="true"
                  />
                  {renewal.status === 'renewing' ? 'Renewing token…' : 'Renew token'}
                </button>
              )}
              {onRevokeSession && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setRevokeOpen(true);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger-700 hover:bg-danger-50 sm:min-h-0"
                >
                  <i className="ri-shield-cross-line text-sm" aria-hidden="true" />
                  Revoke token…
                </button>
              )}
              {onClearNavigationData && (
                <button
                  type="button"
                  onClick={() => {
                    onClearNavigationData();
                    setMenuOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground-700 hover:bg-background-100 sm:min-h-0"
                >
                  <i className="ri-eraser-line text-sm" aria-hidden="true" />
                  Clear recent &amp; favorite paths
                </button>
              )}
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onSignOut(); }}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground-700 hover:bg-background-100 sm:min-h-0"
              >
                <i className="ri-logout-box-r-line text-sm" aria-hidden="true" />
                <span><span className="block">Sign out</span><span className="block text-[9px] text-foreground-400">Clear this browser tab only</span></span>
              </button>
            </div>
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
