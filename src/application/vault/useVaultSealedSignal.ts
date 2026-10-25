import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { normalizeVaultError } from '@/domain/vault/errors';

function isSealedError(error: unknown): boolean {
  return error !== null && error !== undefined && normalizeVaultError(error).code === 'sealed';
}

/**
 * Reports whether any Vault query or mutation in this workspace failed because
 * Vault became sealed, for example after a server restart mid-session.
 */
export function useVaultSealedSignal(): readonly [boolean, () => void] {
  const queryClient = useQueryClient();
  const [sealed, setSealed] = useState(false);

  useEffect(() => {
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && isSealedError(event.query.state.error)) setSealed(true);
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && isSealedError(event.mutation.state.error)) setSealed(true);
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient]);

  return [sealed, () => setSealed(false)] as const;
}
