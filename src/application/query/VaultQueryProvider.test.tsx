import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VaultSessionContextValue } from '@/application/vault/VaultSessionContext';
import { VaultSessionContext } from '@/application/vault/VaultSessionContext';
import type { VaultSessionStatus } from '@/application/vault/VaultSessionContext';
import { vaultQueryKeys } from './vault-query-keys';
import { createVaultQueryClient } from './query-client';
import { VaultQueryProvider } from './VaultQueryProvider';

function context(status: VaultSessionStatus): VaultSessionContextValue {
  return {
    status,
    capabilities: {},
    capabilityDiscovery: 'idle',
    accessControlPermission: { state: 'unknown', reason: 'Capabilities are unavailable.' },
    sessionPersistenceAvailable: true,
    checkHealth: vi.fn(),
    queryCapabilities: vi.fn(),
    permissionFor: vi.fn(() => ({
      state: 'unknown' as const,
      reason: 'Capabilities are unavailable.',
    })),
    signInWithToken: vi.fn(),
    signInWithUserpass: vi.fn(),
    expireSession: vi.fn(),
    signOut: vi.fn(),
  };
}

describe('VaultQueryProvider', () => {
  it('clears cached Vault data when the active session ends', async () => {
    const client = createVaultQueryClient();
    const view = render(
      <VaultSessionContext.Provider value={context('authenticated')}>
        <VaultQueryProvider client={client}>
          <div>Console</div>
        </VaultQueryProvider>
      </VaultSessionContext.Provider>,
    );
    act(() => {
      client.setQueryData(vaultQueryKeys.mounts(), ['applications']);
    });
    expect(client.getQueryData(vaultQueryKeys.mounts())).toEqual(['applications']);

    view.rerender(
      <VaultSessionContext.Provider value={context('anonymous')}>
        <VaultQueryProvider client={client}>
          <div>Signed out</div>
        </VaultQueryProvider>
      </VaultSessionContext.Provider>,
    );

    await waitFor(() => expect(client.getQueryData(vaultQueryKeys.mounts())).toBeUndefined());
  });
});
