import { useMemo, type ReactNode } from 'react';

import type { TransitEngineGateway } from '@/domain/engines/transit/transit';
import { VaultTransitAdapter } from '@/infrastructure/engines/transit/vault-transit-adapter';
import { TransitGatewayContext } from './TransitGatewayContext';

interface TransitGatewayProviderProps {
  readonly children: ReactNode;
  /** Replaces the Vault adapter, e.g. with a fake in tests. */
  readonly gateway?: TransitEngineGateway;
}

export function TransitGatewayProvider({ children, gateway }: TransitGatewayProviderProps) {
  const value = useMemo(() => gateway ?? new VaultTransitAdapter(), [gateway]);
  return <TransitGatewayContext.Provider value={value}>{children}</TransitGatewayContext.Provider>;
}
