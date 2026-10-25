import { useMemo, type ReactNode } from 'react';

import type { VaultWrappingGateway } from '@/domain/vault/wrapping';
import { VaultWrappingAdapter } from '@/infrastructure/vault/wrapping/vault-wrapping-adapter';
import { WrappingGatewayContext } from './WrappingGatewayContext';

interface WrappingGatewayProviderProps {
  readonly children: ReactNode;
  readonly gateway?: VaultWrappingGateway;
}

export function WrappingGatewayProvider({ children, gateway: suppliedGateway }: WrappingGatewayProviderProps) {
  const gateway = useMemo(() => suppliedGateway ?? new VaultWrappingAdapter(), [suppliedGateway]);
  return <WrappingGatewayContext.Provider value={gateway}>{children}</WrappingGatewayContext.Provider>;
}
