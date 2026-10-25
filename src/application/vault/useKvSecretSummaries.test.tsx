import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createVaultQueryClient } from '@/application/query/query-client';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type { KvV2Gateway, KvV2SecretHistory } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { testVaultSession, vaultSessionContextValue } from '@/test/vault-session-context';
import { KvV2GatewayContext } from './KvV2GatewayContext';
import { VaultSessionContext, type VaultSessionContextValue } from './VaultSessionContext';
import {
  SECRET_SUMMARY_CONCURRENCY,
  summaryFromHistory,
  useKvSecretSummaries,
} from './useKvSecretSummaries';

function history(overrides: Partial<KvV2SecretHistory> = {}): KvV2SecretHistory {
  return {
    createdTime: '2026-07-20T12:00:00Z',
    updatedTime: '2026-10-21T12:00:00Z',
    currentVersion: 4,
    oldestVersion: 1,
    maxVersions: 0,
    casRequired: false,
    deleteVersionAfter: '0s',
    customMetadata: { owner: ' platform ' },
    versions: [],
    ...overrides,
  };
}

function gatewayWith(readSecretMetadata: KvV2Gateway['readSecretMetadata']): KvV2Gateway {
  return { readSecretMetadata } as unknown as KvV2Gateway;
}

function setup(gateway: KvV2Gateway, vault: VaultSessionContextValue = vaultSessionContextValue()) {
  const client = createVaultQueryClient();
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <VaultSessionContext.Provider value={vault}>
        <KvV2GatewayContext.Provider value={gateway}>{children}</KvV2GatewayContext.Provider>
      </VaultSessionContext.Provider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

describe('summaryFromHistory', () => {
  it('keeps the update time, current version and trimmed owner', () => {
    expect(summaryFromHistory(history())).toEqual({
      updatedTime: '2026-10-21T12:00:00Z',
      currentVersion: 4,
      owner: 'platform',
    });
    expect(summaryFromHistory(history({ customMetadata: {}, currentVersion: 0 }))).toEqual({
      updatedTime: '2026-10-21T12:00:00Z',
      currentVersion: undefined,
      owner: undefined,
    });
  });
});

describe('useKvSecretSummaries', () => {
  it('loads only the requested paths under the secret query scope', async () => {
    const read = vi.fn(async () => history());
    const { client, wrapper } = setup(gatewayWith(read));
    const { result } = renderHook(() => useKvSecretSummaries('applications', ['billing/db']), { wrapper });

    expect(result.current.get('billing/db')).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.get('billing/db')).toEqual({
      status: 'success',
      data: { updatedTime: '2026-10-21T12:00:00Z', currentVersion: 4, owner: 'platform' },
    }));
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(testVaultSession, 'applications', 'billing/db', expect.any(AbortSignal));
    expect(client.getQueryData(vaultQueryKeys.secretMetadataSummary('applications', 'billing/db')))
      .toBeDefined();
    expect(vaultQueryKeys.secretMetadataSummary('applications', 'billing/db').slice(0, 4))
      .toEqual(vaultQueryKeys.secretScope('applications', 'billing/db'));
  });

  it('treats denied or missing metadata as quietly unavailable', async () => {
    const read = vi.fn(async (_session, _mount, path: string) => {
      throw new VaultError(path === 'denied' ? 'authorization' : 'not-found', {
        status: path === 'denied' ? 403 : 404,
      });
    });
    const vault = vaultSessionContextValue();
    const { wrapper } = setup(gatewayWith(read), vault);
    const { result } = renderHook(() => useKvSecretSummaries('applications', ['denied', 'gone']), { wrapper });

    await waitFor(() => expect(result.current.get('denied')).toEqual({ status: 'unavailable' }));
    expect(result.current.get('gone')).toEqual({ status: 'unavailable' });
    expect(read).toHaveBeenCalledTimes(2);
    expect(vault.expireSession).not.toHaveBeenCalled();
  });

  it('expires the session when Vault rejects the token', async () => {
    const vault = vaultSessionContextValue();
    const read = vi.fn(async () => {
      throw new VaultError('session-expired', { status: 401 });
    });
    const { wrapper } = setup(gatewayWith(read), vault);
    const { result } = renderHook(() => useKvSecretSummaries('applications', ['shared']), { wrapper });

    await waitFor(() => expect(vault.expireSession).toHaveBeenCalled());
    expect(result.current.get('shared')).toEqual({ status: 'unavailable' });
  });

  it('keeps metadata requests within the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const read = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return history();
    });
    const paths = Array.from({ length: 10 }, (_, index) => `secret-${index}`);
    const { wrapper } = setup(gatewayWith(read));
    const { result } = renderHook(() => useKvSecretSummaries('applications', paths), { wrapper });

    await waitFor(() => expect(
      paths.every((path) => result.current.get(path)?.status === 'success'),
    ).toBe(true));
    expect(read).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(SECRET_SUMMARY_CONCURRENCY);
  });
});
