import { createContext, useContext } from 'react';

import type { KvV2Gateway } from '@/domain/vault/contracts';

export const KvV2GatewayContext = createContext<KvV2Gateway | null>(null);

export function useKvV2Gateway(): KvV2Gateway {
  const gateway = useContext(KvV2GatewayContext);
  if (!gateway) throw new Error('useKvV2Gateway must be used inside KvV2GatewayProvider');
  return gateway;
}
