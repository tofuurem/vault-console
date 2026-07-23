import { useState, useRef, useEffect } from 'react';
import Tooltip from '@/components/base/Tooltip';
import type { VaultHealth, VaultSession } from '@/domain/vault/contracts';

interface TopBarProps {
  session: VaultSession;
  health?: VaultHealth;
  onSignOut: () => void;
  onCommandPalette?: () => void;
}

function formatTtl(expiresAt: number | undefined): string {
  if (!expiresAt) return 'No fixed expiry';
  const seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1_000));
  if (seconds >= 86_400) return `${Math.floor(seconds / 86_400)}d remaining`;
  if (seconds >= 3_600) return `${Math.floor(seconds / 3_600)}h remaining`;
  return `${Math.floor(seconds / 60)}m remaining`;
}

export default function TopBar({ session, health, onSignOut, onCommandPalette }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="h-11 shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 border-b border-background-200 bg-background-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-500">
            <i className="ri-shield-keyhole-fill text-background-50 text-xs" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold text-foreground-900 tracking-tight">Vault Console</span>
        </div>
        <div className="hidden items-center gap-1.5 text-xs text-foreground-500 sm:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${health?.sealed ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <span className="max-w-[260px] truncate font-mono text-[11px]">{session.serverUrl}</span>
        </div>
        {health?.version && (
          <span className="hidden rounded bg-background-200 px-1.5 py-0 font-mono text-[10px] text-foreground-500 md:inline">v{health.version}</span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {onCommandPalette && <Tooltip content="Search secrets (⌘K)" position="bottom">
          <button
            type="button"
            aria-label="Search and commands"
            onClick={onCommandPalette}
            className="flex items-center gap-2 h-7 px-2.5 text-xs rounded-md border border-background-300 bg-background-50 text-foreground-400 hover:text-foreground-600 hover:border-background-400 cursor-pointer transition-colors"
          >
            <i className="ri-search-line text-sm" aria-hidden="true" />
            <span className="hidden lg:inline">Search...</span>
            <span className="text-[10px] px-1 rounded bg-background-200 text-foreground-500 font-mono">⌘K</span>
          </button>
        </Tooltip>}

        {onCommandPalette && <Tooltip content="Command palette" position="bottom">
          <button
            type="button"
            aria-label="Open command palette"
            onClick={onCommandPalette}
            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer transition-colors"
          >
            <i className="ri-terminal-box-line text-sm" aria-hidden="true" />
          </button>
        </Tooltip>}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`Session menu for ${identity}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-1.5 h-7 px-2 text-xs rounded-md text-foreground-600 hover:bg-background-100 cursor-pointer transition-colors"
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
            <div className="absolute right-0 top-full mt-1 w-52 rounded-md border border-background-300 bg-background-50 shadow-sm z-50 py-1">
              <div className="px-3 py-2 border-b border-background-200">
                <div className="text-xs font-medium text-foreground-900">{identity}</div>
                <div className="text-[11px] text-foreground-500 mt-0.5">
                  {formatTtl(session.expiresAt)} · via {session.authMethod}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onSignOut(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2"
              >
                <i className="ri-logout-box-r-line text-sm" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
