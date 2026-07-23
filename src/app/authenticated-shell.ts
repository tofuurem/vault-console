import { useOutletContext } from 'react-router-dom';

import type { VaultQueryState } from '@/application/vault/useKvExplorerData';
import type { KvV2Mount } from '@/domain/vault/contracts';

export interface AuthenticatedShellContextValue {
  readonly mountsState: VaultQueryState<readonly KvV2Mount[]>;
  refreshMounts(): void;
}

export function useAuthenticatedShell(): AuthenticatedShellContextValue {
  return useOutletContext<AuthenticatedShellContextValue>();
}
