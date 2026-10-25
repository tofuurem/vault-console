import { Link } from 'react-router-dom';

import type { VaultHealth } from '@/domain/vault/contracts';
import type { ConnectionStatus } from '../useVaultConnection';

interface ConnectionStatusBarProps {
  readonly status: ConnectionStatus;
  readonly health?: VaultHealth;
  readonly serverUrl: string;
}

function statusContent(status: Exclude<ConnectionStatus, 'idle'>, health?: VaultHealth) {
  switch (status) {
    case 'checking': return { dot: 'bg-warning-400 animate-pulse motion-reduce:animate-none', title: 'Checking Vault…' };
    case 'ready': return { dot: 'bg-success-500', title: health?.standby ? 'Connected to standby' : 'Vault is ready' };
    case 'sealed': return { dot: 'bg-warning-500', title: 'Vault is sealed' };
    case 'uninitialized': return { dot: 'bg-danger-500', title: 'Vault is not initialized' };
    case 'unavailable': return { dot: 'bg-danger-500', title: 'Vault is unavailable' };
  }
}

export default function ConnectionStatusBar({ status, health, serverUrl }: ConnectionStatusBarProps) {
  if (status === 'idle') return null;
  const content = statusContent(status, health);
  return (
    <div className="border-b border-background-200 px-6 py-3">
      <div className="flex items-center gap-2 text-[11px]" aria-live="polite">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${content.dot}`} aria-hidden="true" />
        <span className="font-medium text-foreground-700">{content.title}</span>
        {health?.version && <span className="font-mono text-foreground-500">v{health.version}</span>}
        {status === 'ready' && (
          <span className="ml-auto text-foreground-500">{serverUrl.trim().startsWith('https://') ? 'TLS' : 'No TLS'}</span>
        )}
        {status === 'sealed' && (
          <Link
            to="/unseal"
            state={{ serverUrl }}
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded px-1 font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-0"
          >
            <i className="ri-lock-unlock-line" aria-hidden="true" />
            Unseal Vault
          </Link>
        )}
      </div>
    </div>
  );
}
