import { QueryClient } from '@tanstack/react-query';

import { normalizeVaultError } from '@/domain/vault/errors';

export function createVaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, cause) => {
          const error = normalizeVaultError(cause);
          return failureCount < 1 && error.retryable;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
