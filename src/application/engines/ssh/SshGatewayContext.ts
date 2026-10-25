import { createContext, useContext } from 'react';

import type { SshEngineGateway } from '@/domain/engines/ssh/ssh';

export const SshGatewayContext = createContext<SshEngineGateway | null>(null);

export function useSshGateway(): SshEngineGateway {
  const gateway = useContext(SshGatewayContext);
  if (!gateway) throw new Error('useSshGateway must be used inside SshGatewayProvider');
  return gateway;
}
