import { createContext, useContext } from 'react';

import type { VaultWrappingGateway } from '@/domain/vault/wrapping';

export const WrappingGatewayContext = createContext<VaultWrappingGateway | null>(null);

export function useWrappingGateway(): VaultWrappingGateway {
  const gateway = useContext(WrappingGatewayContext);
  if (!gateway) throw new Error('useWrappingGateway must be used inside WrappingGatewayProvider');
  return gateway;
}

/** For optional features that disappear when wrapping is not configured. */
export function useOptionalWrappingGateway(): VaultWrappingGateway | null {
  return useContext(WrappingGatewayContext);
}
