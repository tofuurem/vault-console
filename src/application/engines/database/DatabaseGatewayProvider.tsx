import { useMemo, type ReactNode } from 'react';

import type { DatabaseEngineGateway } from '@/domain/engines/database/database';
import { VaultDatabaseAdapter } from '@/infrastructure/engines/database/vault-database-adapter';
import { DatabaseGatewayContext } from './DatabaseGatewayContext';

interface DatabaseGatewayProviderProps {
  readonly children: ReactNode;
  /** Overrides the Vault adapter, e.g. with a fake in tests. */
  readonly gateway?: DatabaseEngineGateway;
}

export function DatabaseGatewayProvider({ children, gateway }: DatabaseGatewayProviderProps) {
  const value = useMemo(() => gateway ?? new VaultDatabaseAdapter(), [gateway]);
  return <DatabaseGatewayContext.Provider value={value}>{children}</DatabaseGatewayContext.Provider>;
}
