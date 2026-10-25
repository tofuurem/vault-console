import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RuntimeConfigProvider } from '@/application/config/RuntimeConfigProvider';
import { WrappingGatewayProvider } from '@/application/vault/WrappingGatewayProvider';
import { VaultError } from '@/domain/vault/errors';
import { unwrappedSecretFields, type VaultWrappingGateway } from '@/domain/vault/wrapping';
import type { VaultWrappingToken } from '@/domain/vault/sensitive-value';
import UnwrapPage from './page';

const TOKEN = 'hvs.CAESIJ0e2WmOneTimeToken';

function gatewayMock(): VaultWrappingGateway & {
  readonly lookupWrappingToken: ReturnType<typeof vi.fn>;
  readonly unwrapSecret: ReturnType<typeof vi.fn>;
} {
  return {
    wrapKvSecretVersion: vi.fn(),
    lookupWrappingToken: vi.fn(async (_serverUrl: string, token: VaultWrappingToken) => {
      if (token.reveal() !== TOKEN) throw new VaultError('invalid-request', { status: 400 });
      return {
        creationPath: 'applications/data/billing/database',
        creationTime: new Date().toISOString(),
        ttlSeconds: 3600,
      };
    }),
    unwrapSecret: vi.fn(async () => ({
      fields: unwrappedSecretFields({ API_KEY: 'unwrapped-memory-value', CONFIG: { port: 5432 } }),
      version: 3,
      createdTime: '2026-10-24T09:00:00Z',
    })),
  };
}

function renderUnwrap(gateway: VaultWrappingGateway) {
  return render(
    <RuntimeConfigProvider config={{ allowCustomVaultAddress: false }}>
      <WrappingGatewayProvider gateway={gateway}>
        <MemoryRouter initialEntries={['/unwrap']}>
          <UnwrapPage />
        </MemoryRouter>
      </WrappingGatewayProvider>
    </RuntimeConfigProvider>,
  );
}

describe('UnwrapPage', () => {
  it('checks the token first, then unwraps once and shows masked values with reveal and copy', async () => {
    const user = userEvent.setup();
    const gateway = gatewayMock();
    renderUnwrap(gateway);

    expect(screen.getByRole('heading', { name: 'Open a shared secret' })).toBeVisible();
    const input = screen.getByLabelText('Wrapping token');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
    await user.type(input, TOKEN);
    await user.click(screen.getByRole('button', { name: 'Check token' }));

    expect(await screen.findByText('applications/data/billing/database')).toBeVisible();
    expect(screen.getByText(/\(in (59m|1h)\)/)).toBeVisible();
    expect(gateway.lookupWrappingToken).toHaveBeenCalledWith(
      window.location.origin,
      expect.objectContaining({ reveal: expect.any(Function) }),
      expect.any(AbortSignal),
    );
    expect(gateway.unwrapSecret).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(TOKEN);

    await user.click(screen.getByRole('button', { name: 'Open secret' }));
    expect(await screen.findByText('This token is now used.')).toBeVisible();
    expect(gateway.unwrapSecret).toHaveBeenCalledTimes(1);
    expect(vi.mocked(gateway.unwrapSecret).mock.calls[0][1].reveal()).toBe(TOKEN);
    expect(screen.getByText('v3')).toBeVisible();
    expect(document.body).not.toHaveTextContent('unwrapped-memory-value');

    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copy API_KEY' }));
    expect(writeText).toHaveBeenCalledWith('unwrapped-memory-value');
    expect(document.body).not.toHaveTextContent('unwrapped-memory-value');

    await user.click(screen.getByRole('button', { name: 'Reveal API_KEY' }));
    expect(screen.getByText('unwrapped-memory-value')).toBeVisible();

    expect(window.location.href).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify(window.history.state ?? null)).not.toContain(TOKEN);

    await user.click(screen.getByRole('button', { name: 'Clear and open another token' }));
    expect(screen.queryByText('API_KEY')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Wrapping token')).toHaveValue('');
  });

  it('explains unknown, expired, or used tokens without consuming anything', async () => {
    const user = userEvent.setup();
    const gateway = gatewayMock();
    renderUnwrap(gateway);

    await user.type(screen.getByLabelText('Wrapping token'), 'hvs.CAESalreadyUsedToken');
    await user.click(screen.getByRole('button', { name: 'Check token' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'It may have expired, already been used, or been copied incompletely.',
    );
    expect(screen.getByLabelText('Wrapping token')).toHaveValue('');
    expect(gateway.unwrapSecret).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Wrapping token'), 'not a token');
    await user.click(screen.getByRole('button', { name: 'Check token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like a wrapping token');
    expect(gateway.lookupWrappingToken).toHaveBeenCalledTimes(1);
  });

  it('keeps a checked token for a retry after a transient failure and drops it after a rejection', async () => {
    const user = userEvent.setup();
    const gateway = gatewayMock();
    gateway.unwrapSecret
      .mockRejectedValueOnce(new VaultError('unavailable', { status: 503 }))
      .mockRejectedValueOnce(new VaultError('invalid-request', { status: 400 }));
    renderUnwrap(gateway);

    await user.type(screen.getByLabelText('Wrapping token'), TOKEN);
    await user.click(screen.getByRole('button', { name: 'Check token' }));
    await user.click(await screen.findByRole('button', { name: 'Open secret' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Vault is currently unavailable.');
    await user.click(screen.getByRole('button', { name: 'Open secret' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/already been used/)).toBeVisible();
    expect(screen.getByLabelText('Wrapping token')).toBeVisible();
    expect(gateway.unwrapSecret).toHaveBeenCalledTimes(2);
  });
});
