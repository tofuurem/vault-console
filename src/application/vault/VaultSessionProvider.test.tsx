import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  UserpassLogin,
  VaultAuthGateway,
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken, type VaultToken } from '@/domain/vault/sensitive-value';
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
  getCapabilities = vi.fn(async (): Promise<VaultCapabilityMap> => this.capabilities);
}

function SessionProbe() {
  const session = useVaultSession();

  return (
    <div>
      <output data-testid="status">{session.status}</output>
      <output data-testid="identity">{session.session?.displayName ?? 'none'}</output>
      <output data-testid="admin">{String(session.canManageAccess)}</output>
      <output data-testid="error">{session.error?.code ?? 'none'}</output>
      <button
        type="button"
        onClick={() => void session.signInWithToken('https://vault.example.test', 'hvs.raw').catch(() => undefined)}
      >
        Token login
      </button>
      <button type="button" onClick={session.signOut}>Sign out</button>
    </div>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('VaultSessionProvider', () => {
  it('opens an in-memory token session and derives access navigation from Vault capabilities', async () => {
    const gateway = new StubAuthGateway();
    gateway.capabilities = {
      'sys/auth': ['read', 'sudo'],
      'sys/policy': ['deny'],
      'identity/group/id': ['deny'],
      'identity/entity/id': ['deny'],
    };
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Token login' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('identity')).toHaveTextContent('alice');
    expect(screen.getByTestId('admin')).toHaveTextContent('true');
    expect(gateway.validateToken.mock.calls[0][1].reveal()).toBe('hvs.raw');
    expect(storageWrite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
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

  it('expires the in-memory session when the token lease ends', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));
    const gateway = new StubAuthGateway();
    gateway.session = { ...gateway.session, expiresAt: Date.now() + 1_000 };

    render(
      <VaultSessionProvider gateway={gateway}>
        <SessionProbe />
      </VaultSessionProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Token login' }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId('status')).toHaveTextContent('expired');
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
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
});
