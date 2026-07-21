import { useMemo, type ReactNode } from 'react';

import type { KvV2Gateway } from '@/domain/vault/contracts';
import { VaultKvV2Adapter } from '@/infrastructure/vault/kv-v2/vault-kv-v2-adapter';
import { KvV2GatewayContext } from './KvV2GatewayContext';

interface KvV2GatewayProviderProps {
  readonly children: ReactNode;
  readonly gateway?: KvV2Gateway;
}

export function KvV2GatewayProvider({ children, gateway: suppliedGateway }: KvV2GatewayProviderProps) {
  const gateway = useMemo(() => suppliedGateway ?? new VaultKvV2Adapter(), [suppliedGateway]);
  return <KvV2GatewayContext.Provider value={gateway}>{children}</KvV2GatewayContext.Provider>;
}
