import { useContext } from 'react';

import { VaultSessionContext } from '@/application/vault/VaultSessionContext';
import { useOptionalWrappingGateway } from '@/application/vault/WrappingGatewayContext';
import type { VaultSession } from '@/domain/vault/contracts';

export interface InspectorEnvironment {
  readonly session?: VaultSession;
  /** The Access tab needs access-control reads, which some tokens are denied outright. */
  readonly accessTabAvailable: boolean;
  readonly shareAvailable: boolean;
}

/**
 * Session-dependent Inspector features read their context here so the
 * Inspector stays usable, without those features, when rendered standalone.
 */
export function useInspectorEnvironment(): InspectorEnvironment {
  const vault = useContext(VaultSessionContext);
  const wrappingGateway = useOptionalWrappingGateway();
  const session = vault?.status === 'authenticated' ? vault.session : undefined;
  return {
    session,
    accessTabAvailable: Boolean(session && vault && vault.accessControlPermission.state !== 'denied'),
    shareAvailable: Boolean(session && wrappingGateway),
  };
}
