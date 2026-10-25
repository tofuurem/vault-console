import { Link } from 'react-router-dom';

import type { SessionClock } from '@/application/vault/useSessionClock';
import type { VaultHealth, VaultSession } from '@/domain/vault/contracts';
import { DetailList, HOME_FOCUS_RING, HomeCard, StatusDot, type DetailItem } from './HomeCard';

function sealItem(health: VaultHealth): DetailItem {
  if (!health.sealed) {
    return {
      label: 'Seal',
      value: <span className="inline-flex items-center gap-1.5"><StatusDot tone="success" />Unsealed</span>,
    };
  }
  return {
    label: 'Seal',
    value: (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5"><StatusDot tone="danger" />Sealed</span>
        <Link to="/unseal" className={`rounded font-medium text-primary-700 underline underline-offset-2 ${HOME_FOCUS_RING}`}>
          Unseal Vault
        </Link>
      </span>
    ),
  };
}

function healthItems(health: VaultHealth): readonly DetailItem[] {
  return [
    sealItem(health),
    { label: 'Initialized', value: health.initialized ? 'Yes' : 'No' },
    { label: 'Node role', value: health.standby ? 'Standby' : 'Active' },
    {
      label: 'Version',
      value: health.version
        ? <span className="font-mono tabular-nums">{health.version}</span>
        : 'Not reported',
    },
  ];
}

export function VaultStatusCard({
  health,
  serverUrl,
}: {
  readonly health?: VaultHealth;
  readonly serverUrl: string;
}) {
  const tls = serverUrl.startsWith('https://');
  const items: readonly DetailItem[] = [
    ...(health ? healthItems(health) : [{ label: 'Status', value: 'Not checked yet' }]),
    {
      label: 'TLS',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone={tls ? 'success' : 'warning'} />
          {tls ? 'Enabled' : 'Not enabled'}
        </span>
      ),
    },
    { label: 'Server', value: <span className="break-all font-mono text-[11px]">{serverUrl}</span> },
  ];
  return (
    <HomeCard title="Vault status" icon="ri-server-line">
      <DetailList items={items} />
    </HomeCard>
  );
}

function authMethodLabel(method: VaultSession['authMethod']): string {
  return method === 'userpass' ? 'Username and password' : 'Token';
}

function renewableLabel(renewable: boolean | undefined): string {
  if (renewable === undefined) return 'Unknown';
  return renewable ? 'Yes' : 'No';
}

export function SessionCard({
  session,
  clock,
}: {
  readonly session: VaultSession;
  readonly clock: SessionClock;
}) {
  return (
    <HomeCard title="Current session" icon="ri-user-line">
      <DetailList
        items={[
          { label: 'Signed in as', value: session.displayName || 'Token without a display name' },
          { label: 'Sign-in method', value: authMethodLabel(session.authMethod) },
          {
            label: 'Time left',
            value: (
              <span className={`tabular-nums ${clock.warning ? 'font-medium text-warning-700' : ''}`}>
                {clock.remainingLabel}
              </span>
            ),
          },
          { label: 'Renewable', value: renewableLabel(session.renewable) },
        ]}
      />
    </HomeCard>
  );
}
