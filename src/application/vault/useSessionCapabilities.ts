import { useCallback } from 'react';

import type {
  VaultAuthGateway,
  VaultCapability,
  VaultCapabilityMap,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError, normalizeVaultError } from '@/domain/vault/errors';
import {
  resolveAccessControlPermission,
  resolvePermission,
  type CapabilityDiscoveryState,
} from './capability-permissions';
import type { VaultSessionStatus } from './VaultSessionContext';

interface SessionCapabilitiesInput {
  readonly gateway: VaultAuthGateway;
  readonly status: VaultSessionStatus;
  readonly session?: VaultSession;
  readonly capabilities: VaultCapabilityMap;
  readonly capabilityDiscovery: CapabilityDiscoveryState;
  readonly expireSession: () => void;
}

export function useSessionCapabilities({
  gateway,
  status,
  session,
  capabilities,
  capabilityDiscovery,
  expireSession,
}: SessionCapabilitiesInput) {
  const queryCapabilities = useCallback(async (paths: readonly string[], signal?: AbortSignal) => {
    if (!session || status !== 'authenticated') throw new VaultError('session-expired');
    try {
      return await gateway.getCapabilities(session, paths, signal);
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code === 'session-expired') expireSession();
      throw nextError;
    }
  }, [expireSession, gateway, session, status]);

  const permissionFor = useCallback((
    path: string,
    required: VaultCapability | readonly VaultCapability[],
  ) => resolvePermission(capabilities, capabilityDiscovery, path, required), [
    capabilities,
    capabilityDiscovery,
  ]);

  const accessControlPermission = resolveAccessControlPermission(
    capabilities,
    capabilityDiscovery,
  );

  return { queryCapabilities, permissionFor, accessControlPermission };
}
