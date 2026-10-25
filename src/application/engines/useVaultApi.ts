import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { enginePath } from '@/domain/engines/engines';
import { useEnginesGateways } from './EnginesGatewayContext';
import { engineQueryKeys } from './useSecretEngines';

/**
 * LIST is safe to run on navigation. Reads and writes are explicit actions:
 * reading `creds/` paths mints credentials, and responses stay out of the
 * query cache so secret material lives only in the component that asked.
 */
export function useEngineList(mount: string, path: string) {
  const { api } = useEnginesGateways();
  const vault = useVaultSession();
  const query = useQuery({
    queryKey: [...engineQueryKeys.mount(mount), 'list', path] as const,
    queryFn: ({ signal }) => api.list(vault.session!, enginePath(mount, path), signal),
    enabled: Boolean(vault.session),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function useEngineRead(mount: string) {
  const { api } = useEnginesGateways();
  const vault = useVaultSession();
  return useMutation({
    mutationFn: (path: string) => api.read(vault.session!, enginePath(mount, path)),
  });
}

function useInvalidateMount(mount: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: engineQueryKeys.mount(mount) });
}

export function useEngineWrite(mount: string) {
  const { api } = useEnginesGateways();
  const vault = useVaultSession();
  const invalidate = useInvalidateMount(mount);
  return useMutation({
    mutationFn: ({ path, body }: { readonly path: string; readonly body: Readonly<Record<string, unknown>> }) =>
      api.write(vault.session!, enginePath(mount, path), body),
    onSuccess: invalidate,
  });
}

export function useEngineDelete(mount: string) {
  const { api } = useEnginesGateways();
  const vault = useVaultSession();
  const invalidate = useInvalidateMount(mount);
  return useMutation({
    mutationFn: (path: string) => api.remove(vault.session!, enginePath(mount, path)),
    onSuccess: invalidate,
  });
}
