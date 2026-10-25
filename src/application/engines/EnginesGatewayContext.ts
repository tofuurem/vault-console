import { createContext, useContext } from 'react';

import type { SecretEnginesGateway, VaultApiGateway } from '@/domain/engines/engines';

export interface EnginesGateways {
  readonly engines: SecretEnginesGateway;
  readonly api: VaultApiGateway;
}

export const EnginesGatewayContext = createContext<EnginesGateways | null>(null);

export function useEnginesGateways(): EnginesGateways {
  const gateways = useContext(EnginesGatewayContext);
  if (!gateways) throw new Error('useEnginesGateways must be used inside EnginesGatewayProvider');
  return gateways;
}
