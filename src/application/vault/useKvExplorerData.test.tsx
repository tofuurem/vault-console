import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  KvV2Gateway,
  KvV2Secret,
  KvV2SecretHistory,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { KvV2GatewayContext } from './KvV2GatewayContext';
import type { KvActionPermissions } from './useKvActionPermissions';
import {
  type VaultQueryState,
  useKvDirectory,
  useKvMounts,
  useKvSecretDetails,
} from './useKvExplorerData';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.reader'),
  authMethod: 'token',
};

const secret: KvV2Secret = {
  mount: 'applications',
  path: 'billing/database',
  data: { username: 'billing' },
  metadata: {
    createdTime: '2026-07-21T12:00:00Z',
    version: 3,
    customMetadata: {},
    destroyed: false,
  },
};

const history: KvV2SecretHistory = {
  currentVersion: 3,
  oldestVersion: 1,
  customMetadata: {},
  versions: [
    { version: 3, createdTime: '2026-07-21T12:00:00Z', destroyed: false },
  ],
};

function gateway(): KvV2Gateway {
  return {
    listMounts: vi.fn(async () => [{ path: 'applications', accessor: 'kv_apps', description: 'Apps', version: 2 as const }]),
    listPaths: vi.fn(async () => ['billing/', 'shared']),
    readSecret: vi.fn(async () => secret),
    readSecretHistory: vi.fn(async () => history),
    writeSecret: vi.fn(),
    deleteLatestVersion: vi.fn(),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(),
    destroyVersions: vi.fn(),
    deleteMetadata: vi.fn(),
  };
}

function QueryProbe({
  permissions,
}: {
  readonly permissions?: VaultQueryState<KvActionPermissions>;
}) {
  const [mounts] = useKvMounts(session);
  const [directory] = useKvDirectory(session, 'applications', '');
  const [details] = useKvSecretDetails(
    session,
    'applications',
    'billing/database',
    permissions,
  );
  return (
    <div>
      <output data-testid="mounts">{mounts.status === 'success' ? mounts.data.map((mount) => mount.path).join(',') : mounts.status}</output>
      <output data-testid="directory">{directory.status === 'success' ? directory.data.join(',') : directory.status}</output>
      <output data-testid="secret">{details.status === 'success' ? `${details.data.secret?.path}:v${details.data.history?.currentVersion}` : details.status}</output>
      <output data-testid="data-error">{details.status === 'success' ? details.data.dataError?.code ?? 'none' : 'none'}</output>
      <output data-testid="history-error">{details.status === 'success' ? details.data.historyError?.code ?? 'none' : 'none'}</output>
    </div>
  );
}

describe('KV explorer queries', () => {
  it('loads visible mounts, a virtual folder, and selected secret details from the gateway', async () => {
    render(
      <KvV2GatewayContext.Provider value={gateway()}>
        <QueryProbe />
      </KvV2GatewayContext.Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('mounts')).toHaveTextContent('applications'));
    expect(screen.getByTestId('directory')).toHaveTextContent('billing/,shared');
    expect(screen.getByTestId('secret')).toHaveTextContent('billing/database:v3');
  });

  it('keeps version history available without exposing a deleted current version', async () => {
    const deletedGateway = gateway();
    deletedGateway.readSecretHistory = vi.fn(async () => ({
      ...history,
      versions: [{ ...history.versions[0], deletionTime: '2026-07-21T13:00:00Z' }],
    }));

    render(
      <KvV2GatewayContext.Provider value={deletedGateway}>
        <QueryProbe />
      </KvV2GatewayContext.Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('secret')).toHaveTextContent('undefined:v3'));
    expect(deletedGateway.readSecret).toHaveBeenCalled();
  });

  it('keeps readable secret data when version history is forbidden', async () => {
    const dataOnlyGateway = gateway();
    dataOnlyGateway.readSecretHistory = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });

    render(
      <KvV2GatewayContext.Provider value={dataOnlyGateway}>
        <QueryProbe />
      </KvV2GatewayContext.Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('secret')).toHaveTextContent('billing/database:vundefined'));
    expect(screen.getByTestId('history-error')).toHaveTextContent('authorization');
    expect(screen.getByTestId('data-error')).toHaveTextContent('none');
  });

  it('keeps readable version history when secret data is forbidden', async () => {
    const historyOnlyGateway = gateway();
    historyOnlyGateway.readSecret = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });

    render(
      <KvV2GatewayContext.Provider value={historyOnlyGateway}>
        <QueryProbe />
      </KvV2GatewayContext.Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('secret')).toHaveTextContent('undefined:v3'));
    expect(screen.getByTestId('data-error')).toHaveTextContent('authorization');
    expect(screen.getByTestId('history-error')).toHaveTextContent('none');
  });

  it('returns an overall error when neither resource can be read', async () => {
    const deniedGateway = gateway();
    deniedGateway.readSecret = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    deniedGateway.readSecretHistory = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });

    render(
      <KvV2GatewayContext.Provider value={deniedGateway}>
        <QueryProbe />
      </KvV2GatewayContext.Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('secret')).toHaveTextContent('error'));
  });

  it('treats a session expiry as global even if the parallel data read completed', async () => {
    const expiringGateway = gateway();
    expiringGateway.readSecretHistory = vi.fn(async () => {
      throw new VaultError('session-expired', { status: 401 });
    });

    render(
      <KvV2GatewayContext.Provider value={expiringGateway}>
        <QueryProbe />
      </KvV2GatewayContext.Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('secret')).toHaveTextContent('error'));
  });

  it('does not call a metadata endpoint that capabilities already deny', async () => {
    const dataOnlyGateway = gateway();
    const permissions: KvActionPermissions = {
      scope: 'applications/data/billing/database',
      canReadData: true,
      canReadMetadata: false,
      canEdit: false,
      canDeleteLatest: false,
      canDeleteVersions: false,
      canUndelete: false,
      canDestroy: false,
      canDeleteMetadata: false,
    };

    render(
      <KvV2GatewayContext.Provider value={dataOnlyGateway}>
        <QueryProbe permissions={{ status: 'success', data: permissions }} />
      </KvV2GatewayContext.Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('secret')).toHaveTextContent('billing/database:vundefined'));
    expect(screen.getByTestId('history-error')).toHaveTextContent('authorization');
    expect(dataOnlyGateway.readSecret).toHaveBeenCalledOnce();
    expect(dataOnlyGateway.readSecretHistory).not.toHaveBeenCalled();
  });
});
