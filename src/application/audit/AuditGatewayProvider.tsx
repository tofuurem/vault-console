import { useMemo, type ReactNode } from 'react';

import type { AuditGateway } from '@/domain/audit/audit-events';
import { AuditHttpAdapter } from '@/infrastructure/audit/audit-http-adapter';
import { AuditGatewayContext } from './AuditGatewayContext';

interface AuditGatewayProviderProps {
  readonly children: ReactNode;
  readonly gateway?: AuditGateway;
}

export function AuditGatewayProvider({ children, gateway: suppliedGateway }: AuditGatewayProviderProps) {
  const gateway = useMemo(() => suppliedGateway ?? new AuditHttpAdapter(), [suppliedGateway]);
  return <AuditGatewayContext.Provider value={gateway}>{children}</AuditGatewayContext.Provider>;
}
