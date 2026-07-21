import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';
import type {
  UserpassLogin,
  VaultAuthGateway,
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
} from '@/domain/vault/contracts';
import { vaultToken, type VaultToken } from '@/domain/vault/sensitive-value';

class LoginGateway implements VaultAuthGateway {
  health: VaultHealth = { initialized: true, sealed: false, standby: false, version: '1.21.0' };
  capabilities: VaultCapabilityMap = {
    'sys/auth': ['read'],
    'sys/policy': ['read'],
    'identity/group/id': ['list'],
    'identity/entity/id': ['list'],
  };
  session: VaultSession = {
    serverUrl: 'https://vault.example.test:8200',
    token: vaultToken('hvs.session'),
    authMethod: 'token',
    displayName: 'alice',
  };

  getHealth = vi.fn(async (): Promise<VaultHealth> => this.health);
  validateToken = vi.fn(async (_serverUrl: string, _token: VaultToken): Promise<VaultSession> => this.session);
  loginUserpass = vi.fn(async (_input: UserpassLogin): Promise<VaultSession> => ({ ...this.session, authMethod: 'userpass' }));
  getCapabilities = vi.fn(async (): Promise<VaultCapabilityMap> => this.capabilities);
}

describe('LoginPage', () => {
  it('checks the actual Vault health endpoint and renders sealed state', async () => {
    const user = userEvent.setup();
    const gateway = new LoginGateway();
    gateway.health = { ...gateway.health, sealed: true };
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={gateway} />);

    await user.clear(screen.getByLabelText('Vault server'));
    await user.type(screen.getByLabelText('Vault server'), 'https://vault.example.test:8200');
    await user.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText('Vault is sealed')).toBeVisible();
    expect(screen.getByText('v1.21.0')).toBeVisible();
  });

  it('authenticates with a token, clears the field, and enters the guarded explorer', async () => {
    const user = userEvent.setup();
    const gateway = new LoginGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={gateway} />);

    await user.clear(screen.getByLabelText('Vault server'));
    await user.type(screen.getByLabelText('Vault server'), 'https://vault.example.test:8200');
    await user.type(screen.getByLabelText('Vault token'), 'hvs.operator');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(window.location.pathname).toBe('/explorer'));
    expect(gateway.validateToken.mock.calls[0][1].reveal()).toBe('hvs.operator');
    expect(screen.queryByDisplayValue('hvs.operator')).not.toBeInTheDocument();
  });

  it('supports userpass at a custom mount and removes the password after use', async () => {
    const user = userEvent.setup();
    const gateway = new LoginGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={gateway} />);

    await user.click(screen.getByRole('tab', { name: 'Username & password' }));
    await user.clear(screen.getByLabelText('Vault server'));
    await user.type(screen.getByLabelText('Vault server'), 'https://vault.example.test:8200');
    await user.clear(screen.getByLabelText('Auth mount path'));
    await user.type(screen.getByLabelText('Auth mount path'), 'team/userpass');
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'not-persisted');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(window.location.pathname).toBe('/explorer'));
    const credentials = gateway.loginUserpass.mock.calls[0][0];
    expect(credentials).toMatchObject({ mount: 'team/userpass', username: 'alice' });
    expect(credentials.password.reveal()).toBe('not-persisted');
    expect(screen.queryByDisplayValue('not-persisted')).not.toBeInTheDocument();
  });
});
