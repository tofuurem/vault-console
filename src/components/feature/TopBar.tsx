import { useState, useRef, useEffect } from 'react';
import Button from '@/components/base/Button';
import Tooltip from '@/components/base/Tooltip';
import type { VaultConnection } from '@/mocks/vault';

interface TopBarProps {
  connection: VaultConnection;
  onSignOut: () => void;
  onCommandPalette: () => void;
}

export default function TopBar({ connection, onSignOut, onCommandPalette }: TopBarProps) {
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

  const ttlDays = Math.floor(connection.token_ttl / 86400);

  return (
    <div className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-background-200 bg-background-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-500">
            <i className="ri-shield-keyhole-fill text-background-50 text-xs" />
          </div>
          <span className="text-sm font-semibold text-foreground-900 tracking-tight">Vault Console</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-foreground-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="font-mono text-[11px]">{connection.server_url}</span>
        </div>
        <span className="text-[10px] px-1.5 py-0 bg-background-200 text-foreground-500 rounded font-mono">
          v{connection.vault_version}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Tooltip content="Search secrets (⌘K)" position="bottom">
          <button
            onClick={onCommandPalette}
            className="flex items-center gap-2 h-7 px-2.5 text-xs rounded-md border border-background-300 bg-background-50 text-foreground-400 hover:text-foreground-600 hover:border-background-400 cursor-pointer transition-colors"
          >
            <i className="ri-search-line text-sm" />
            <span className="hidden lg:inline">Search...</span>
            <span className="text-[10px] px-1 rounded bg-background-200 text-foreground-500 font-mono">⌘K</span>
          </button>
        </Tooltip>

        <Tooltip content="Command palette" position="bottom">
          <button
            onClick={onCommandPalette}
            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer transition-colors"
          >
            <i className="ri-terminal-box-line text-sm" />
          </button>
        </Tooltip>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-1.5 h-7 px-2 text-xs rounded-md text-foreground-600 hover:bg-background-100 cursor-pointer transition-colors"
          >
            <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-[10px] font-semibold text-primary-700">
                {connection.identity.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="font-medium">{connection.identity}</span>
            <i className="ri-arrow-down-s-line text-xs text-foreground-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-md border border-background-300 bg-background-50 shadow-sm z-50 py-1">
              <div className="px-3 py-2 border-b border-background-200">
                <div className="text-xs font-medium text-foreground-900">{connection.identity}</div>
                <div className="text-[11px] text-foreground-500 mt-0.5">
                  Token TTL: {ttlDays}d · via {connection.auth_method}
                </div>
              </div>
              <button
                onClick={() => { setMenuOpen(false); onSignOut(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground-700 hover:bg-background-100 cursor-pointer flex items-center gap-2"
              >
                <i className="ri-logout-box-r-line text-sm" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}