import { createContext, useContext } from 'react';

import type { TransitEngineGateway } from '@/domain/engines/transit/transit';

export const TransitGatewayContext = createContext<TransitEngineGateway | null>(null);

export function useTransitGateway(): TransitEngineGateway {
  const gateway = useContext(TransitGatewayContext);
  if (!gateway) throw new Error('useTransitGateway must be used inside TransitGatewayProvider');
  return gateway;
}
