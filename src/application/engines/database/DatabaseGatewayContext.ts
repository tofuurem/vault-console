import { createContext, useContext } from 'react';

import type { DatabaseEngineGateway } from '@/domain/engines/database/database';

export const DatabaseGatewayContext = createContext<DatabaseEngineGateway | null>(null);

export function useDatabaseGateway(): DatabaseEngineGateway {
  const gateway = useContext(DatabaseGatewayContext);
  if (!gateway) throw new Error('useDatabaseGateway must be used inside DatabaseGatewayProvider');
  return gateway;
}
