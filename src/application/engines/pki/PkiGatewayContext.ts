import { createContext, useContext } from 'react';

import type { PkiEngineGateway } from '@/domain/engines/pki/pki';

export const PkiGatewayContext = createContext<PkiEngineGateway | null>(null);

export function usePkiGateway(): PkiEngineGateway {
  const gateway = useContext(PkiGatewayContext);
  if (!gateway) throw new Error('usePkiGateway must be used inside PkiGatewayProvider');
  return gateway;
}
