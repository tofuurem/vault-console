import { useMemo, type ReactNode } from 'react';

import type { SecretEnginesGateway, VaultApiGateway } from '@/domain/engines/engines';
import { VaultApiAdapter, VaultEnginesAdapter } from '@/infrastructure/engines/vault-engines-adapter';
import { EnginesGatewayContext } from './EnginesGatewayContext';

interface EnginesGatewayProviderProps {
  readonly children: ReactNode;
  readonly engines?: SecretEnginesGateway;
  readonly api?: VaultApiGateway;
}

export function EnginesGatewayProvider({ children, engines, api }: EnginesGatewayProviderProps) {
  const value = useMemo(() => ({
    engines: engines ?? new VaultEnginesAdapter(),
    api: api ?? new VaultApiAdapter(),
  }), [api, engines]);
  return <EnginesGatewayContext.Provider value={value}>{children}</EnginesGatewayContext.Provider>;
}
