import { createContext, useContext } from 'react';

import type { AuditGateway } from '@/domain/audit/audit-events';

export const AuditGatewayContext = createContext<AuditGateway | null>(null);

export function useAuditGateway(): AuditGateway {
  const gateway = useContext(AuditGatewayContext);
  if (!gateway) throw new Error('useAuditGateway must be used inside AuditGatewayProvider');
  return gateway;
}
