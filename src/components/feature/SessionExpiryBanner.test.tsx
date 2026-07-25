import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { vaultToken } from '@/domain/vault/sensitive-value';
import SessionExpiryBanner from './SessionExpiryBanner';

const clock = {
  remainingMs: 45_000,
  remainingLabel: '45s remaining',
  warning: true,
};

describe('SessionExpiryBanner', () => {
  it('renews an eligible session and dismisses only the current expiry', async () => {
    const user = userEvent.setup();
    const onRenew = vi.fn(async () => undefined);
    const session = {
      serverUrl: 'https://vault.example.test',
      token: vaultToken('hvs.renewable'),
      authMethod: 'userpass' as const,
      expiresAt: 1_000,
      renewable: true,
    };
    const view = render(
      <SessionExpiryBanner
        session={session}
        clock={clock}
        renewal={{ status: 'idle' }}
        onRenew={onRenew}
      />,
    );

    expect(screen.getByText('Vault session expires in 45s')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Renew session' }));
    expect(onRenew).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Dismiss for this expiry' }));
    expect(screen.queryByRole('status', { name: 'Vault session expiry warning' })).not.toBeInTheDocument();

    view.rerender(
      <SessionExpiryBanner
        session={{ ...session, renewedAt: 2_000 }}
        clock={clock}
        renewal={{ status: 'succeeded' }}
        onRenew={onRenew}
      />,
    );
    expect(screen.getByRole('status', { name: 'Vault session expiry warning' })).toBeVisible();
    expect(screen.getByText(/countdown uses the TTL returned by Vault/)).toBeVisible();
  });

  it('explains reauthentication when renewal is unavailable', () => {
    render(
      <SessionExpiryBanner
        session={{
          serverUrl: 'https://vault.example.test',
          token: vaultToken('hvs.batch'),
          authMethod: 'token',
          expiresAt: 1_000,
          renewable: false,
        }}
        clock={clock}
        renewal={{ status: 'failed' }}
        onRenew={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Renew session' })).not.toBeInTheDocument();
    expect(screen.getByText(/sign in again before expiry/)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('current session remains active');
  });

  it('stays hidden outside the warning window', () => {
    render(
      <SessionExpiryBanner
        session={{
          serverUrl: 'https://vault.example.test',
          token: vaultToken('hvs.long'),
          authMethod: 'token',
          expiresAt: 1_000,
          renewable: true,
        }}
        clock={{ ...clock, warning: false }}
        renewal={{ status: 'idle' }}
        onRenew={vi.fn()}
      />,
    );

    expect(screen.queryByRole('status', { name: 'Vault session expiry warning' })).not.toBeInTheDocument();
  });
});
