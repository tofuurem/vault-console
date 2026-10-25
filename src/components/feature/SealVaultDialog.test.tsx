import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SealGatewayContext } from '@/application/vault/SealGatewayContext';
import {
  VaultSessionContext,
  type VaultSessionContextValue,
} from '@/application/vault/VaultSessionContext';
import type { VaultCapabilityMap, VaultSealGateway } from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import SealVaultDialog from './SealVaultDialog';

function setup(capabilities: VaultCapabilityMap | Error) {
  const gateway = { seal: vi.fn(async () => undefined) } as unknown as VaultSealGateway;
  const session = {
    session: { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' },
    queryCapabilities: vi.fn(async () => {
      if (capabilities instanceof Error) throw capabilities;
      return capabilities;
    }),
  } as unknown as VaultSessionContextValue;
  const onSealed = vi.fn();
  render(
    <SealGatewayContext.Provider value={gateway}>
      <VaultSessionContext.Provider value={session}>
        <SealVaultDialog open onClose={vi.fn()} onSealed={onSealed} />
      </VaultSessionContext.Provider>
    </SealGatewayContext.Provider>,
  );
  return { gateway, onSealed };
}

describe('SealVaultDialog', () => {
  it('requires the typed phrase before sealing', async () => {
    const user = userEvent.setup();
    const { gateway, onSealed } = setup({ 'sys/seal': ['update', 'sudo'] });
    const confirm = screen.getByRole('button', { name: 'Seal Vault' });
    await waitFor(() => expect(screen.getByLabelText('Type SEAL VAULT to confirm')).toBeEnabled());
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Type SEAL VAULT to confirm'), 'SEAL VAULT');
    await user.click(confirm);

    expect(gateway.seal).toHaveBeenCalledTimes(1);
    expect(onSealed).toHaveBeenCalledTimes(1);
  });

  it('explains a confirmed denial and blocks the action', async () => {
    setup({ 'sys/seal': ['read'] });
    expect(await screen.findByRole('alert')).toHaveTextContent('does not allow sealing');
    expect(screen.getByLabelText('Type SEAL VAULT to confirm')).toBeDisabled();
  });

  it('lets Vault decide when permissions cannot be checked', async () => {
    setup(new Error('preflight unavailable'));
    expect(await screen.findByText(/could not be checked in advance/)).toBeVisible();
    expect(screen.getByLabelText('Type SEAL VAULT to confirm')).toBeEnabled();
  });
});
