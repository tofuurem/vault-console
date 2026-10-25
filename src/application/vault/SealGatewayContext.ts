import { createContext, useContext } from 'react';

import type { VaultSealGateway } from '@/domain/vault/contracts';

export const SealGatewayContext = createContext<VaultSealGateway | null>(null);

export function useSealGateway(): VaultSealGateway {
  const gateway = useContext(SealGatewayContext);
  if (!gateway) throw new Error('useSealGateway must be used inside SealGatewayProvider');
  return gateway;
}
