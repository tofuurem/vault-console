import { useMemo, type ReactNode } from 'react';

import type { VaultSealGateway } from '@/domain/vault/contracts';
import { VaultSealAdapter } from '@/infrastructure/vault/seal/vault-seal-adapter';
import { SealGatewayContext } from './SealGatewayContext';

interface SealGatewayProviderProps {
  readonly children: ReactNode;
  readonly gateway?: VaultSealGateway;
}

export function SealGatewayProvider({ children, gateway: suppliedGateway }: SealGatewayProviderProps) {
  const gateway = useMemo(() => suppliedGateway ?? new VaultSealAdapter(), [suppliedGateway]);
  return <SealGatewayContext.Provider value={gateway}>{children}</SealGatewayContext.Provider>;
}
