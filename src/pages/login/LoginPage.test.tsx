import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';
import type {
  KvV2Gateway,
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
    'sys/policies/acl': ['read'],
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
  renewSelf = vi.fn(async () => ({ renewable: false }));
  getCapabilities = vi.fn(async (): Promise<VaultCapabilityMap> => this.capabilities);
}

function kvGateway(): KvV2Gateway {
  return {
    listMounts: vi.fn(async () => [{
      path: 'applications',
      accessor: 'kv_apps',
      description: 'Applications',
      version: 2 as const,
    }]),
    createKvV2Mount: vi.fn(),
    listPaths: vi.fn(async () => []),
    readSecret: vi.fn(),
    writeSecret: vi.fn(),
    readSecretHistory: vi.fn(),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(),
    destroyVersions: vi.fn(),
    deleteMetadata: vi.fn(),
  };
}

function assignNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  if (!setter) throw new Error('Native input value setter is unavailable.');
  setter.call(input, value);
}

describe('LoginPage', () => {
  it('uses the fixed same-origin Vault proxy without asking for deployment details', async () => {
    const gateway = new LoginGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={gateway} />);

    expect(screen.queryByLabelText('Vault server')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Auth mount path')).not.toBeInTheDocument();
    expect(await screen.findByText('Vault is ready')).toBeVisible();
    expect(gateway.getHealth).toHaveBeenCalledWith(window.location.origin, expect.any(AbortSignal));
  });

  it('preserves the expiry explanation while checking the fixed Vault proxy', async () => {
    const gateway = new LoginGateway();
    window.history.replaceState({ usr: { reason: 'expired' } }, '', '/login');
    render(<App authGateway={gateway} />);

    expect(await screen.findByText('Vault is ready')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your Vault session expired. Sign in again.',
    );
  });

  it('checks a custom Vault address and renders sealed state from Advanced', async () => {
    const user = userEvent.setup();
    const gateway = new LoginGateway();
    gateway.health = { ...gateway.health, sealed: true };
    window.history.replaceState({}, '', '/login');
    render(
      <App
        authGateway={gateway}
        kvV2Gateway={kvGateway()}
        runtimeConfig={{ allowCustomVaultAddress: true }}
      />,
    );

    await user.click(screen.getByText('Advanced connection settings'));
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
    render(
      <App
        authGateway={gateway}
        kvV2Gateway={kvGateway()}
        runtimeConfig={{ allowCustomVaultAddress: true }}
      />,
    );

    await user.click(screen.getByText('Advanced connection settings'));
    await user.clear(screen.getByLabelText('Vault server'));
    await user.type(screen.getByLabelText('Vault server'), 'https://vault.example.test:8200');
    await user.click(screen.getByRole('tab', { name: 'Token' }));
    const token = screen.getByLabelText('Vault token');
    expect(token).toHaveAttribute('name', 'vault-token');
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAttribute('autocomplete', 'off');
    expect(token.closest('form')).toHaveAttribute('name', 'vault-token-login');
    expect(token.closest('form')).toHaveAttribute('autocomplete', 'off');
    await user.type(token, 'hvs.operator');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(window.location.pathname).toBe('/explorer'));
    expect(gateway.validateToken.mock.calls[0][1].reveal()).toBe('hvs.operator');
    expect(screen.queryByDisplayValue('hvs.operator')).not.toBeInTheDocument();
  });

  it('returns to the complete guarded deep link after authentication', async () => {
    const user = userEvent.setup();
    const gateway = new LoginGateway();
    window.history.replaceState({
      usr: {
        reason: 'required',
        from: '/explorer/applications?secret=team%2Fapi#versions',
      },
    }, '', '/login');
    render(
      <App
        authGateway={gateway}
        kvV2Gateway={kvGateway()}
        runtimeConfig={{ allowCustomVaultAddress: true }}
      />,
    );

    await user.click(screen.getByText('Advanced connection settings'));
    await user.clear(screen.getByLabelText('Vault server'));
    await user.type(screen.getByLabelText('Vault server'), 'https://vault.example.test:8200');
    await user.click(screen.getByRole('tab', { name: 'Token' }));
    await user.type(screen.getByLabelText('Vault token'), 'hvs.operator');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/explorer/applications');
      expect(window.location.search).toBe('?secret=team%2Fapi');
      expect(window.location.hash).toBe('#versions');
    });
  });

  it('keeps a browser-native userpass form stable and accepts native autofill values', async () => {
    const user = userEvent.setup();
    const gateway = new LoginGateway();
    window.history.replaceState({}, '', '/login');
    render(<App
      authGateway={gateway}
      runtimeConfig={{
        allowCustomVaultAddress: true,
        userpassMount: 'userpass',
        allowCustomUserpassMount: true,
      }}
    />);

    expect(screen.getByRole('tab', {
      name: 'Username & password',
    })).toHaveAttribute('aria-selected', 'true');
    const username = screen.getByLabelText('Username') as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    const userpassForm = username.closest('form');

    expect(username).toHaveAttribute('name', 'username');
    expect(username).toHaveAttribute('type', 'text');
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(username).toBeRequired();
    expect(password).toHaveAttribute('name', 'password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toBeRequired();
    expect(userpassForm).toBe(password.closest('form'));
    expect(userpassForm).toHaveAttribute('name', 'vault-userpass-login');
    expect(userpassForm).toHaveAttribute('method', 'post');
    expect(userpassForm).toHaveAttribute('autocomplete', 'on');

    await user.click(screen.getByRole('tab', { name: 'Token' }));
    expect(userpassForm).toHaveAttribute('hidden');
    expect(screen.getByLabelText('Vault token')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Username & password' }));
    expect(screen.getByLabelText('Username')).toBe(username);
    expect(screen.getByLabelText('Password')).toBe(password);
    expect(userpassForm).not.toHaveAttribute('hidden');

    await user.click(screen.getByText('Advanced connection settings'));
    await user.clear(screen.getByLabelText('Vault server'));
    await user.type(screen.getByLabelText('Vault server'), 'https://vault.example.test:8200');
    await user.clear(screen.getByLabelText('Auth mount path'));
    await user.type(screen.getByLabelText('Auth mount path'), 'team/userpass');

    assignNativeValue(username, 'alice');
    assignNativeValue(password, 'not-persisted');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(window.location.pathname).toBe('/explorer'));
    const credentials = gateway.loginUserpass.mock.calls[0][0];
    expect(credentials).toMatchObject({ mount: 'team/userpass', username: 'alice' });
    expect(credentials.password.reveal()).toBe('not-persisted');
    expect(screen.queryByDisplayValue('not-persisted')).not.toBeInTheDocument();
  });

  it('clears a natively autofilled password after a failed userpass login', async () => {
    const user = userEvent.setup();
    const gateway = new LoginGateway();
    gateway.loginUserpass.mockRejectedValueOnce(new Error('Access denied'));
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={gateway} />);

    const username = screen.getByLabelText('Username') as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    assignNativeValue(username, 'alice');
    assignNativeValue(password, 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(gateway.loginUserpass).toHaveBeenCalledOnce());
    await waitFor(() => expect(password).toHaveValue(''));
    expect(username).toHaveValue('alice');
  });
});
