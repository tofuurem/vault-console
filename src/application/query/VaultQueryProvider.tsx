import {
  QueryClientProvider,
  type QueryClient,
} from '@tanstack/react-query';
import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { createVaultQueryClient } from './query-client';

interface VaultQueryProviderProps {
  readonly children: ReactNode;
  readonly client?: QueryClient;
}

export function VaultQueryProvider({
  children,
  client: suppliedClient,
}: VaultQueryProviderProps) {
  const vault = useVaultSession();
  const [client] = useState(() => suppliedClient ?? createVaultQueryClient());

  useEffect(() => {
    if (vault.status !== 'authenticated' && vault.status !== 'restoring') {
      client.clear();
    }
  }, [client, vault.status]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
