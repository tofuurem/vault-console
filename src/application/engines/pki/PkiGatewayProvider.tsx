import { useMemo, type ReactNode } from 'react';

import type { PkiEngineGateway } from '@/domain/engines/pki/pki';
import { VaultPkiAdapter } from '@/infrastructure/engines/pki/vault-pki-adapter';
import { PkiGatewayContext } from './PkiGatewayContext';

interface PkiGatewayProviderProps {
  readonly children: ReactNode;
  /** Replaces the Vault adapter, e.g. with a fake in tests. */
  readonly gateway?: PkiEngineGateway;
}

export function PkiGatewayProvider({ children, gateway }: PkiGatewayProviderProps) {
  const value = useMemo(() => gateway ?? new VaultPkiAdapter(), [gateway]);
  return <PkiGatewayContext.Provider value={value}>{children}</PkiGatewayContext.Provider>;
}
