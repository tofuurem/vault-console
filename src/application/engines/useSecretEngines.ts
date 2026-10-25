import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { EnableEngineInput, TuneEngineInput } from '@/domain/engines/engines';
import { useEnginesGateways } from './EnginesGatewayContext';

export const engineQueryKeys = {
  all: () => [...vaultQueryKeys.all, 'secret-engines'] as const,
  tune: (path: string) => [...engineQueryKeys.all(), 'tune', path] as const,
  /** Root for engine-specific data so a disable/enable refreshes everything under a mount. */
  mount: (path: string) => [...vaultQueryKeys.all, 'engine', path] as const,
};

/** Every secrets engine the token can see, including KV mounts. */
export function useSecretEngines() {
  const { engines } = useEnginesGateways();
  const vault = useVaultSession();
  const query = useQuery({
    queryKey: engineQueryKeys.all(),
    queryFn: ({ signal }) => engines.listEngines(vault.session!, signal),
    enabled: Boolean(vault.session),
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function useEngineTune(path: string, enabled: boolean) {
  const { engines } = useEnginesGateways();
  const vault = useVaultSession();
  return useQuery({
    queryKey: engineQueryKeys.tune(path),
    queryFn: ({ signal }) => engines.readTune(vault.session!, path, signal),
    enabled: enabled && Boolean(vault.session),
    retry: false,
  });
}

function useInvalidateEngines() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: engineQueryKeys.all() }),
    queryClient.invalidateQueries({ queryKey: vaultQueryKeys.mounts() }),
  ]);
}

export function useEnableEngine() {
  const { engines } = useEnginesGateways();
  const vault = useVaultSession();
  const invalidate = useInvalidateEngines();
  return useMutation({
    mutationFn: (input: EnableEngineInput) => engines.enableEngine(vault.session!, input),
    onSuccess: invalidate,
  });
}

export function useTuneEngine(path: string) {
  const { engines } = useEnginesGateways();
  const vault = useVaultSession();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEngines();
  return useMutation({
    mutationFn: (input: TuneEngineInput) => engines.tuneEngine(vault.session!, path, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: engineQueryKeys.tune(path) });
      await invalidate();
    },
  });
}

export function useDisableEngine(path: string) {
  const { engines } = useEnginesGateways();
  const vault = useVaultSession();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEngines();
  return useMutation({
    mutationFn: () => engines.disableEngine(vault.session!, path),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: engineQueryKeys.mount(path) });
      await invalidate();
    },
  });
}
