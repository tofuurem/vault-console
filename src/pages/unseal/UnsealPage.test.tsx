import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';
import type {
  VaultAuthGateway,
  VaultHealth,
  VaultSealGateway,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import type { VaultSealStatus } from '@/domain/vault/seal';
import type { VaultUnsealKey } from '@/domain/vault/sensitive-value';

const HEX_SHARE_A = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08aa';
const HEX_SHARE_B = '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752bb';
const HEX_SHARE_C = 'fd61a03af4f77d870fc21e05e7e80678095c92d808cfb3b5c279ee04c74aca13cc';

class SealGateway implements VaultSealGateway {
  status: VaultSealStatus = {
    type: 'shamir',
    initialized: true,
    sealed: true,
    threshold: 3,
    shares: 5,
    progress: 0,
    version: '2.0.3',
    migration: false,
    recoverySeal: false,
  };
  readonly submitted: string[] = [];

  getSealStatus = vi.fn(async (): Promise<VaultSealStatus> => this.status);
  submitUnsealKey = vi.fn(async (_serverUrl: string, key: VaultUnsealKey): Promise<VaultSealStatus> => {
    const share = key.reveal();
    if (!this.submitted.includes(share)) this.submitted.push(share);
    const progress = this.submitted.length;
    this.status = progress >= this.status.threshold
      ? { ...this.status, sealed: false, progress: 0, nonce: undefined, clusterName: 'vault-cluster-test' }
      : { ...this.status, progress, nonce: 'nonce-1' };
    return this.status;
  });
  resetUnseal = vi.fn(async (): Promise<VaultSealStatus> => {
    this.submitted.length = 0;
    this.status = { ...this.status, progress: 0, nonce: undefined };
    return this.status;
  });
}

function sealedAuthGateway(): VaultAuthGateway {
  const health: VaultHealth = { initialized: true, sealed: true, standby: false, version: '2.0.3' };
  return {
    getHealth: vi.fn(async () => health),
    validateToken: vi.fn(),
    loginUserpass: vi.fn(),
    renewSelf: vi.fn(),
    revokeSelf: vi.fn(),
    getCapabilities: vi.fn(async () => ({})),
  };
}

function renderUnseal(sealGateway: VaultSealGateway, path = '/unseal') {
  window.history.replaceState({}, '', path);
  return render(
    <App
      authGateway={sealedAuthGateway()}
      sealGateway={sealGateway}
      runtimeConfig={{ allowCustomVaultAddress: false }}
    />,
  );
}

describe('UnsealPage', () => {
  it('collects shares one by one until Vault is unsealed', async () => {
    const user = userEvent.setup();
    const gateway = new SealGateway();
    renderUnseal(gateway);

    expect(await screen.findByRole('heading', { name: 'Unseal Vault' })).toBeVisible();
    expect(await screen.findByText('Shamir · 3 of 5')).toBeVisible();
    const progress = screen.getByRole('progressbar', { name: 'Unseal progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '0');

    const input = screen.getByLabelText('Unseal key share');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');

    await user.type(input, HEX_SHARE_A);
    await user.click(screen.getByRole('button', { name: 'Submit key share' }));

    expect(await screen.findByText(/Key share accepted/)).toBeVisible();
    expect(input).toHaveValue('');
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(gateway.submitUnsealKey).toHaveBeenCalledWith(
      window.location.origin,
      expect.objectContaining({ reveal: expect.any(Function) }),
      expect.any(AbortSignal),
    );

    await user.type(input, HEX_SHARE_A);
    await user.click(screen.getByRole('button', { name: 'Submit key share' }));
    expect(await screen.findByText(/already counted this key share/)).toBeVisible();

    await user.type(input, HEX_SHARE_B);
    await user.click(screen.getByRole('button', { name: 'Submit key share' }));
    await user.type(screen.getByLabelText('Unseal key share'), HEX_SHARE_C);
    await user.click(screen.getByRole('button', { name: 'Submit key share' }));

    expect(await screen.findByText('Vault is unsealed and serving requests')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute('href', '/login');
  });

  it('validates the share format locally and never stores the value', async () => {
    const user = userEvent.setup();
    const gateway = new SealGateway();
    renderUnseal(gateway);

    const input = await screen.findByLabelText('Unseal key share');
    await user.type(input, 'not a key share!');
    await user.click(screen.getByRole('button', { name: 'Submit key share' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like an unseal key share');
    expect(gateway.submitUnsealKey).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('not a key share');
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('not a key share');
  });

  it('explains when Vault discards an attempt with invalid combined shares', async () => {
    const user = userEvent.setup();
    const gateway = new SealGateway();
    gateway.status = { ...gateway.status, progress: 2, nonce: 'nonce-1' };
    gateway.submitUnsealKey.mockImplementationOnce(async () => {
      gateway.status = { ...gateway.status, progress: 0, nonce: undefined };
      throw new VaultError('invalid-request', { status: 400 });
    });
    renderUnseal(gateway);

    await user.type(await screen.findByLabelText('Unseal key share'), HEX_SHARE_C);
    await user.click(screen.getByRole('button', { name: 'Submit key share' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Vault discarded this attempt');
    expect(screen.getByRole('progressbar', { name: 'Unseal progress' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('requires confirmation before resetting submitted shares', async () => {
    const user = userEvent.setup();
    const gateway = new SealGateway();
    gateway.status = { ...gateway.status, progress: 2, nonce: 'nonce-1' };
    renderUnseal(gateway);

    await user.click(await screen.findByRole('button', { name: 'Reset attempt' }));
    expect(screen.getByText('Discard 2 submitted shares?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(gateway.resetUnseal).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Unseal progress was reset/)).toBeVisible();
  });

  it('explains auto-unseal and uninitialized servers instead of asking for shares', async () => {
    const gateway = new SealGateway();
    gateway.status = { ...gateway.status, type: 'auto', recoverySeal: true };
    const { unmount } = renderUnseal(gateway);

    expect(await screen.findByText(/uses an auto-unseal mechanism/)).toBeVisible();
    expect(screen.queryByLabelText('Unseal key share')).not.toBeInTheDocument();
    unmount();

    gateway.status = { ...gateway.status, type: 'shamir', initialized: false };
    renderUnseal(gateway);
    expect(await screen.findByText(/Initialize Vault with vault operator init/)).toBeVisible();
  });

  it('is reachable from the sign-in screen when Vault is sealed', async () => {
    const user = userEvent.setup();
    const gateway = new SealGateway();
    renderUnseal(gateway, '/login');

    expect(await screen.findByText('Vault is sealed')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Unseal Vault' }));

    expect(await screen.findByRole('heading', { name: 'Unseal Vault' })).toBeVisible();
  });

  it('shows a recoverable error when seal status cannot be read', async () => {
    const user = userEvent.setup();
    const gateway = new SealGateway();
    gateway.getSealStatus.mockRejectedValueOnce(new VaultError('unavailable'));
    renderUnseal(gateway);

    expect(await screen.findByText('Vault is unavailable')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Shamir · 3 of 5')).toBeVisible();
  });
});
