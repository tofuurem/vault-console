import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { engineQueryKeys } from '@/application/engines/useSecretEngines';
import { VaultSessionContext } from '@/application/vault/VaultSessionContext';
import type { DatabaseEngineGateway } from '@/domain/engines/database/database';
import { VaultError } from '@/domain/vault/errors';
import { vaultSessionContextValue } from '@/test/vault-session-context';
import { DatabaseGatewayProvider } from './DatabaseGatewayProvider';
import { databaseQueryKeys, useDatabaseRoles, useGenerateCredentials } from './useDatabaseEngine';

function wrapper(gateway: Partial<DatabaseEngineGateway>, vault = vaultSessionContextValue()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <VaultSessionContext.Provider value={vault}>
        <DatabaseGatewayProvider gateway={gateway as DatabaseEngineGateway}>{children}</DatabaseGatewayProvider>
      </VaultSessionContext.Provider>
    </QueryClientProvider>
  );
  return { client, Wrapper };
}

describe('database engine hooks', () => {
  it('roots every key under the engine mount so disabling the engine drops it', () => {
    const mountKey = engineQueryKeys.mount('db');
    expect(databaseQueryKeys.detail('db', 'roles', 'web').slice(0, mountKey.length)).toEqual(mountKey);
    expect(databaseQueryKeys.list('db', 'connections').slice(0, mountKey.length)).toEqual(mountKey);
  });

  it('expires the session when Vault reports an invalid token', async () => {
    const vault = vaultSessionContextValue();
    const { Wrapper } = wrapper({ listRoles: vi.fn(async () => { throw new VaultError('session-expired'); }) }, vault);
    renderHook(() => useDatabaseRoles('db'), { wrapper: Wrapper });
    await waitFor(() => expect(vault.expireSession).toHaveBeenCalled());
  });

  it('keeps generated credentials out of the query cache', async () => {
    const { client, Wrapper } = wrapper({
      generateCredentials: vi.fn(async () => ({ data: { password: 'secret-value' }, leaseId: 'l', warnings: [] })),
    });
    const { result, unmount } = renderHook(() => useGenerateCredentials('db'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync('web');
    });
    expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain('secret-value');
    unmount();
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
  });
});
