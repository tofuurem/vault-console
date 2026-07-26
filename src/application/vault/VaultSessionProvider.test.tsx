import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  UserpassLogin,
  VaultAuthGateway,
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
  VaultSessionLease,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken, type VaultToken } from '@/domain/vault/sensitive-value';
import {
  RECENT_PATHS_STORAGE_KEY,
  SESSION_FAVORITES_STORAGE_KEY,
} from '@/application/navigation-history/navigation-history';
import { SESSION_STORAGE_KEY, createVaultSessionStorage } from './session-storage';
import { useVaultSession } from './VaultSessionContext';
import { VaultSessionProvider } from './VaultSessionProvider';

const healthy: VaultHealth = {
  initialized: true,
  sealed: false,
  standby: false,
  version: '1.21.0',
};

class StubAuthGateway implements VaultAuthGateway {
  health = healthy;
  session: VaultSession = {
    serverUrl: 'https://vault.example.test',
    token: vaultToken('hvs.session'),
    authMethod: 'token',
    displayName: 'alice',
  };
  capabilities: VaultCapabilityMap = {};

  getHealth = vi.fn(async (): Promise<VaultHealth> => this.health);
  validateToken = vi.fn(async (_serverUrl: string, _token: VaultToken): Promise<VaultSession> => this.session);
  loginUserpass = vi.fn(async (_input: UserpassLogin): Promise<VaultSession> => this.session);
  renewSelf = vi.fn(async (): Promise<VaultSessionLease> => ({ renewable: false }));
  getCapabilities = vi.fn(async (): Promise<VaultCapabilityMap> => this.capabilities);
}

function SessionProbe() {
  const session = useVaultSession();

  return (
    <div>
      <output data-testid="status">{session.status}</output>
      <output data-testid="identity">{session.session?.displayName ?? 'none'}</output>
      <output data-testid="admin">{session.accessControlPermission.state}</output>
      <output data-testid="capability-discovery">{session.capabilityDiscovery}</output>
      <output data-testid="persistence">{String(session.sessionPersistenceAvailable)}</output>
      <output data-testid="error">{session.error?.code ?? 'none'}</output>
      <output data-testid="renewable">{String(session.session?.renewable)}</output>
      <output data-testid="expiry">{session.session?.expiresAt ?? 'none'}</output>
      <output data-testid="renewal-status">{session.renewal.status}</output>
      <output data-testid="renewal-error">{session.renewal.error?.code ?? 'none'}</output>
      <button
        type="button"
        onClick={() => void session.signInWithToken('https://vault.example.test', 'hvs.raw').catch(() => undefined)}
      >
        Token login
      </button>
      <button type="button" onClick={session.signOut}>Sign out</button>
      <button
        type="button"
        onClick={() => void session.renewSession().catch(() => undefined)}
      >
        Renew
      </button>
      <button type="button" onClick={session.expireSession}>Expire</button>
    </div>
  );
}

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('VaultSessionProvider', () => {
  it('opens and persists a token session for this browser tab', async () => {
    const gateway = new StubAuthGateway();
    gateway.capabilities = {
      'sys/auth': ['read', 'sudo'],
      'sys/policies/acl': ['deny'],
      'identity/group/id': ['deny'],
      'identity/entity/id': ['deny'],
    };
    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('identity')).toHaveTextContent('alice');
    expect(screen.getByTestId('admin')).toHaveTextContent('allowed');
    expect(gateway.validateToken.mock.calls[0][1].reveal()).toBe('hvs.raw');
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toMatchObject({
      version: 1,
      token: 'hvs.session',
      displayName: 'alice',
    });
    sessionStorage.setItem(RECENT_PATHS_STORAGE_KEY, '{"version":1,"paths":[]}');
    sessionStorage.setItem(SESSION_FAVORITES_STORAGE_KEY, '{"version":1,"paths":[]}');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(RECENT_PATHS_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_FAVORITES_STORAGE_KEY)).toBeNull();
  });

  it('restores a saved tab session without asking for credentials again', async () => {
    const gateway = new StubAuthGateway();
    gateway.capabilities = { 'sys/auth': ['read'] };
    createVaultSessionStorage(sessionStorage).save({
      ...gateway.session,
      token: vaultToken('hvs.restored'),
    });

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );

    expect(screen.getByTestId('status')).toHaveTextContent('restoring');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('identity')).toHaveTextContent('alice');
    expect(gateway.validateToken).not.toHaveBeenCalled();
    expect(gateway.getHealth).toHaveBeenCalledWith(
      'https://vault.example.test',
      expect.any(AbortSignal),
    );
    expect(gateway.getCapabilities).toHaveBeenCalled();
  });

  it('keeps authentication in memory when sessionStorage is blocked', async () => {
    const gateway = new StubAuthGateway();
    const unavailable = {
      getItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
      setItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
      removeItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
    };

    render(
      <VaultSessionProvider gateway={gateway} storage={unavailable}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('persistence')).toHaveTextContent('false');
  });

  it('does not authenticate when token validation proves the token is invalid', async () => {
    const gateway = new StubAuthGateway();
    gateway.validateToken.mockRejectedValue(
      new VaultError('session-expired', { status: 403 }),
    );

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
    expect(screen.getByTestId('error')).toHaveTextContent('session-expired');
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('expires a restored session when capability discovery proves the token is invalid', async () => {
    const gateway = new StubAuthGateway();
    createVaultSessionStorage(sessionStorage).save({
      ...gateway.session,
      token: vaultToken('hvs.revoked'),
    });
    gateway.getCapabilities.mockRejectedValue(
      new VaultError('session-expired', { status: 403 }),
    );

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('expired'));
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
    expect(screen.getByTestId('error')).toHaveTextContent('session-expired');
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('keeps a valid session open when capability discovery is forbidden', async () => {
    const gateway = new StubAuthGateway();
    gateway.getCapabilities.mockRejectedValue(
      new VaultError('authorization', { status: 403 }),
    );

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('capability-discovery')).toHaveTextContent('unavailable');
    expect(screen.getByTestId('admin')).toHaveTextContent('unknown');
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('does not publish an authenticated route before capability discovery settles', async () => {
    const gateway = new StubAuthGateway();
    let resolveCapabilities!: (value: VaultCapabilityMap) => void;
    gateway.getCapabilities.mockReturnValue(new Promise((resolve) => {
      resolveCapabilities = resolve;
    }));

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));

    await waitFor(() => expect(gateway.getCapabilities).toHaveBeenCalled());
    expect(screen.getByTestId('status')).toHaveTextContent('authenticating');
    await act(async () => resolveCapabilities({}));
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });

  it('blocks authentication while Vault is sealed', async () => {
    const gateway = new StubAuthGateway();
    gateway.health = { ...healthy, sealed: true };

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('sealed'));
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    expect(gateway.validateToken).not.toHaveBeenCalled();
  });

  it('cleans the in-memory session when the session clock reports expiry', async () => {
    const gateway = new StubAuthGateway();

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    sessionStorage.setItem(RECENT_PATHS_STORAGE_KEY, '{"version":1,"paths":[]}');
    sessionStorage.setItem(SESSION_FAVORITES_STORAGE_KEY, '{"version":1,"paths":[]}');

    fireEvent.click(screen.getByRole('button', { name: 'Expire' }));
    expect(screen.getByTestId('status')).toHaveTextContent('expired');
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(RECENT_PATHS_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_FAVORITES_STORAGE_KEY)).toBeNull();
  });

  it('invalidates the active session when a capability query receives a 401', async () => {
    const gateway = new StubAuthGateway();
    gateway.getCapabilities
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new VaultError('session-expired'));

    function CapabilityProbe() {
      const value = useVaultSession();
      return (
        <div>
          <output data-testid="capability-status">{value.status}</output>
          <button type="button" onClick={() => void value.signInWithToken('https://vault.example.test', 'hvs.raw')}>Open</button>
          <button type="button" onClick={() => void value.queryCapabilities(['secret/data/app']).catch(() => undefined)}>Query</button>
        </div>
      );
    }

    render(<VaultSessionProvider gateway={gateway}><CapabilityProbe /></VaultSessionProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.getByTestId('capability-status')).toHaveTextContent('authenticated'));
    fireEvent.click(screen.getByRole('button', { name: 'Query' }));
    await waitFor(() => expect(screen.getByTestId('capability-status')).toHaveTextContent('expired'));
  });

  it('serializes renewal and persists the exact shorter lease returned by Vault', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));
    const gateway = new StubAuthGateway();
    gateway.session = {
      ...gateway.session,
      renewable: true,
      expiresAt: Date.parse('2026-07-21T13:00:00Z'),
      leaseDurationSeconds: 3600,
    };
    let resolveRenewal!: (lease: {
      expiresAt: number;
      leaseDurationSeconds: number;
      renewable: boolean;
      renewedAt: number;
    }) => void;
    gateway.renewSelf.mockReturnValue(new Promise((resolve) => {
      resolveRenewal = resolve;
    }));

    render(<VaultSessionProvider gateway={gateway}><SessionProbe /></VaultSessionProvider>);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Token login' }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');

    fireEvent.click(screen.getByRole('button', { name: 'Renew' }));
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }));
    expect(gateway.renewSelf).toHaveBeenCalledOnce();
    expect(screen.getByTestId('renewal-status')).toHaveTextContent('renewing');

    const returnedExpiry = Date.parse('2026-07-21T12:05:00Z');
    await act(async () => resolveRenewal({
      expiresAt: returnedExpiry,
      leaseDurationSeconds: 300,
      renewable: true,
      renewedAt: Date.now(),
    }));

    expect(screen.getByTestId('renewal-status')).toHaveTextContent('succeeded');
    expect(screen.getByTestId('expiry')).toHaveTextContent(String(returnedExpiry));
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toMatchObject({
      expiresAt: returnedExpiry,
      leaseDurationSeconds: 300,
      renewable: true,
      renewedAt: Date.now(),
    });
  });

  it('keeps a valid session after renewal denial and removes the renewal action', async () => {
    const gateway = new StubAuthGateway();
    gateway.session = {
      ...gateway.session,
      renewable: true,
      expiresAt: Date.now() + 60_000,
    };
    gateway.renewSelf.mockRejectedValue(new VaultError('authorization', { status: 403 }));

    render(<VaultSessionProvider gateway={gateway}><SessionProbe /></VaultSessionProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }));

    await waitFor(() => expect(screen.getByTestId('renewal-status')).toHaveTextContent('failed'));
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('renewable')).toHaveTextContent('false');
    expect(screen.getByTestId('renewal-error')).toHaveTextContent('authorization');
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toMatchObject({
      renewable: false,
    });
  });

  it('expires globally when renewal proves the token is no longer valid', async () => {
    const gateway = new StubAuthGateway();
    gateway.session = {
      ...gateway.session,
      renewable: true,
      expiresAt: Date.now() + 60_000,
    };
    gateway.renewSelf.mockRejectedValue(new VaultError('session-expired', { status: 401 }));

    render(<VaultSessionProvider gateway={gateway}><SessionProbe /></VaultSessionProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    sessionStorage.setItem(RECENT_PATHS_STORAGE_KEY, '{"version":1,"paths":[]}');
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('expired'));
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(RECENT_PATHS_STORAGE_KEY)).toBeNull();
  });

  it('renews a restored eligible session', async () => {
    const gateway = new StubAuthGateway();
    const restored = {
      ...gateway.session,
      token: vaultToken('hvs.restored-renewable'),
      renewable: true,
      expiresAt: Date.now() + 60_000,
    };
    createVaultSessionStorage(sessionStorage).save(restored);
    gateway.renewSelf.mockResolvedValue({
      expiresAt: Date.now() + 120_000,
      leaseDurationSeconds: 120,
      renewable: true,
      renewedAt: Date.now(),
    });

    render(<VaultSessionProvider gateway={gateway}><SessionProbe /></VaultSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }));

    await waitFor(() => expect(gateway.renewSelf).toHaveBeenCalledWith(
      expect.objectContaining({ token: restored.token }),
      expect.any(AbortSignal),
    ));
    expect(screen.getByTestId('renewal-status')).toHaveTextContent('succeeded');
  });
});
