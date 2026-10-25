import { useOutletContext } from 'react-router-dom';

import type { VaultQueryState } from '@/application/vault/useKvExplorerData';
import type { SecretEngine } from '@/domain/engines/engines';
import type { KvV2Mount } from '@/domain/vault/contracts';

export interface AuthenticatedShellContextValue {
  readonly mountsState: VaultQueryState<readonly KvV2Mount[]>;
  refreshMounts(): void;
  /** Non-KV secrets engines visible to the token, once listed. */
  readonly engines?: readonly SecretEngine[];
  readonly onEnableEngine?: () => void;
}

export function useAuthenticatedShell(): AuthenticatedShellContextValue {
  return useOutletContext<AuthenticatedShellContextValue>();
}
