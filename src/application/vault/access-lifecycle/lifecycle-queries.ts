import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type { VaultAccessControlGateway, VaultSession } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import { loadGroupLifecycleSnapshot } from './group-lifecycle';
import { loadRoleLifecycleSnapshot } from './role-lifecycle';
import {
  loadIdentityTombstoneSnapshot,
  loadUserLifecycleSnapshot,
  type UserLifecycleRef,
} from './user-lifecycle';

interface LifecycleQueryContext {
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
}

export function useGroupLifecycleSnapshot(
  { gateway, session }: LifecycleQueryContext,
  groupId?: string,
) {
  return useQuery({
    queryKey: vaultQueryKeys.groupEditor(groupId ?? 'new'),
    queryFn: ({ signal }) => loadGroupLifecycleSnapshot(gateway, session, groupId, signal),
  });
}

export function useRoleLifecycleSnapshot(
  { gateway, session }: LifecycleQueryContext,
  policyName?: string,
) {
  return useQuery({
    queryKey: vaultQueryKeys.roleEditor(policyName ?? 'new'),
    queryFn: ({ signal }) => loadRoleLifecycleSnapshot(gateway, session, policyName, signal),
  });
}

export function useUserLifecycleSnapshot(
  { gateway, session }: LifecycleQueryContext,
  reference: UserLifecycleRef,
  options: { readonly enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: vaultQueryKeys.userEditor(reference.mount, reference.username),
    queryFn: ({ signal }) => loadUserLifecycleSnapshot(gateway, session, reference, signal),
    enabled: options.enabled ?? true,
  });
}

export function useIdentityTombstoneSnapshot(
  { gateway, session }: LifecycleQueryContext,
  entityId: string,
) {
  return useQuery({
    queryKey: vaultQueryKeys.identityTombstone(entityId),
    queryFn: ({ signal }) => loadIdentityTombstoneSnapshot(gateway, session, entityId, signal),
  });
}

/** Capability preflight for the exact paths a change plan will touch. */
export function usePlanCapabilities(
  { gateway, session }: LifecycleQueryContext,
  paths: readonly string[],
) {
  return useQuery({
    queryKey: vaultQueryKeys.accessPlanCapabilities(paths),
    queryFn: ({ signal }) => gateway.getCapabilities(session, paths, signal),
    enabled: paths.length > 0,
  });
}

/** Ends the session once any of the given query errors is an invalid token. */
export function useSessionExpiryFromErrors(
  onSessionExpired: (() => void) | undefined,
  ...errors: readonly unknown[]
): void {
  const cause = errors.find((error) => error !== null && error !== undefined);
  useEffect(() => {
    if (cause && normalizeVaultError(cause).code === 'session-expired') onSessionExpired?.();
  }, [cause, onSessionExpired]);
}
