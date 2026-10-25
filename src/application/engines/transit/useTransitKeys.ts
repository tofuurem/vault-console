import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { CreateTransitKeyInput, TransitKeyConfigInput } from '@/domain/engines/transit/transit';
import { engineQueryKeys } from '../useSecretEngines';
import { useTransitGateway } from './TransitGatewayContext';

/** Key metadata only. Cryptographic results never enter the query cache. */
export const transitQueryKeys = {
  root: (mount: string) => [...engineQueryKeys.mount(mount), 'transit'] as const,
  keys: (mount: string) => [...transitQueryKeys.root(mount), 'keys'] as const,
  key: (mount: string, name: string) => [...transitQueryKeys.root(mount), 'key', name] as const,
};

export function useTransitKeys(mount: string) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const query = useQuery({
    queryKey: transitQueryKeys.keys(mount),
    queryFn: ({ signal }) => gateway.listKeys(vault.session!, mount, signal),
    enabled: Boolean(vault.session),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function useTransitKey(mount: string, name: string | undefined) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const query = useQuery({
    queryKey: transitQueryKeys.key(mount, name ?? ''),
    queryFn: ({ signal }) => gateway.readKey(vault.session!, mount, name!, signal),
    enabled: Boolean(vault.session && name),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

function useKeyMutation<Input>(
  run: (input: Input) => Promise<void>,
  afterSuccess: (input: Input) => Promise<unknown>,
) {
  const vault = useVaultSession();
  const mutation = useMutation({ mutationFn: run, onSuccess: (_result, input) => afterSuccess(input) });
  useSessionExpiryFromErrors(vault.expireSession, mutation.error);
  return mutation;
}

export function useCreateTransitKey(mount: string) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const queryClient = useQueryClient();
  return useKeyMutation(
    (input: CreateTransitKeyInput) => gateway.createKey(vault.session!, mount, input),
    () => queryClient.invalidateQueries({ queryKey: transitQueryKeys.keys(mount) }),
  );
}

function useInvalidateKey(mount: string, name: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: transitQueryKeys.key(mount, name) });
}

export function useRotateTransitKey(mount: string, name: string) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const invalidate = useInvalidateKey(mount, name);
  return useKeyMutation<void>(() => gateway.rotateKey(vault.session!, mount, name), invalidate);
}

export function useUpdateTransitKeyConfig(mount: string, name: string) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const invalidate = useInvalidateKey(mount, name);
  return useKeyMutation(
    (input: TransitKeyConfigInput) => gateway.updateKeyConfig(vault.session!, mount, name, input),
    invalidate,
  );
}

export function useTrimTransitKey(mount: string, name: string) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const invalidate = useInvalidateKey(mount, name);
  return useKeyMutation(
    (minAvailableVersion: number) => gateway.trimKey(vault.session!, mount, name, minAvailableVersion),
    invalidate,
  );
}

export function useDeleteTransitKey(mount: string, name: string) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const queryClient = useQueryClient();
  return useKeyMutation<void>(
    () => gateway.deleteKey(vault.session!, mount, name),
    async () => {
      queryClient.removeQueries({ queryKey: transitQueryKeys.key(mount, name) });
      await queryClient.invalidateQueries({ queryKey: transitQueryKeys.keys(mount) });
    },
  );
}
