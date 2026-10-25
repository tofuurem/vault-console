import { useMemo, type ReactNode } from 'react';

import type { SshEngineGateway } from '@/domain/engines/ssh/ssh';
import { VaultSshAdapter } from '@/infrastructure/engines/ssh/vault-ssh-adapter';
import { SshGatewayContext } from './SshGatewayContext';

interface SshGatewayProviderProps {
  readonly children: ReactNode;
  /** Replaces the Vault adapter, e.g. with a fake in tests. */
  readonly gateway?: SshEngineGateway;
}

export function SshGatewayProvider({ children, gateway }: SshGatewayProviderProps) {
  const value = useMemo(() => gateway ?? new VaultSshAdapter(), [gateway]);
  return <SshGatewayContext.Provider value={value}>{children}</SshGatewayContext.Provider>;
}
