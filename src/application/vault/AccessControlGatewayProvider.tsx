import { useMemo, type ReactNode } from 'react';

import type { VaultAccessControlGateway } from '@/domain/vault/contracts';
import { VaultAccessControlAdapter } from '@/infrastructure/vault/access-control/vault-access-control-adapter';
import { AccessControlGatewayContext } from './AccessControlGatewayContext';

interface AccessControlGatewayProviderProps {
  readonly children: ReactNode;
  readonly gateway?: VaultAccessControlGateway;
}

export function AccessControlGatewayProvider({ children, gateway: suppliedGateway }: AccessControlGatewayProviderProps) {
  const gateway = useMemo(() => suppliedGateway ?? new VaultAccessControlAdapter(), [suppliedGateway]);
  return <AccessControlGatewayContext.Provider value={gateway}>{children}</AccessControlGatewayContext.Provider>;
}
