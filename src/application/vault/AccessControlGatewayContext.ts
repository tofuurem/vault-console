import { createContext, useContext } from 'react';

import type { VaultAccessControlGateway } from '@/domain/vault/contracts';

export const AccessControlGatewayContext = createContext<VaultAccessControlGateway | null>(null);

export function useAccessControlGateway(): VaultAccessControlGateway {
  const gateway = useContext(AccessControlGatewayContext);
  if (!gateway) throw new Error('useAccessControlGateway must be used inside AccessControlGatewayProvider');
  return gateway;
}
