import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import { useVaultSealedSignal } from './useVaultSealedSignal';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useVaultSealedSignal(), { wrapper }) };
}

describe('useVaultSealedSignal', () => {
  it('turns on when a query fails because Vault is sealed and can be dismissed', async () => {
    const { client, result } = setup();
    expect(result.current[0]).toBe(false);

    await act(async () => {
      await client.fetchQuery({
        queryKey: ['vault', 'mounts'],
        queryFn: () => Promise.reject(new VaultError('sealed', { status: 503 })),
      }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current[0]).toBe(true));

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it('ignores unrelated failures', async () => {
    const { client, result } = setup();
    await act(async () => {
      await client.fetchQuery({
        queryKey: ['vault', 'mounts'],
        queryFn: () => Promise.reject(new VaultError('authorization', { status: 403 })),
      }).catch(() => undefined);
    });
    expect(result.current[0]).toBe(false);
  });
});
