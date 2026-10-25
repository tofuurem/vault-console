import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { auditFilterKey, type AuditFilter } from '@/domain/audit/audit-events';
import { useAuditGateway } from './AuditGatewayContext';

const auditKeys = {
  status: () => [...vaultQueryKeys.all, 'audit-status'] as const,
  events: (filter: AuditFilter) => [...vaultQueryKeys.all, 'audit-events', ...auditFilterKey(filter)] as const,
};

/** Newest-first audit events for the current filter, paged backwards in time. */
export function useAuditEvents(filter: AuditFilter) {
  const gateway = useAuditGateway();
  const vault = useVaultSession();
  const session = vault.session!;
  const status = useQuery({
    queryKey: auditKeys.status(),
    queryFn: ({ signal }) => gateway.status(session, signal),
    retry: false,
  });
  const events = useInfiniteQuery({
    queryKey: auditKeys.events(filter),
    queryFn: ({ pageParam, signal }) => gateway.events(session, filter, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.exhausted ? undefined : last.nextBefore),
    retry: false,
    staleTime: 0,
  });
  useSessionExpiryFromErrors(vault.expireSession, status.error, events.error);
  return { status, events };
}
