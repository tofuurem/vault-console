import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { engineQueryKeys } from '@/application/engines/useSecretEngines';
import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type {
  DatabaseConnectionInput,
  DatabaseEngineGateway,
  DatabaseRoleInput,
  DatabaseStaticRoleInput,
} from '@/domain/engines/database/database';
import type { VaultSession } from '@/domain/vault/contracts';
import { useDatabaseGateway } from './DatabaseGatewayContext';

export type DatabaseCollection = 'connections' | 'roles' | 'static-roles';

/** Every key lives under the mount root, so disabling the engine drops all of it. */
export const databaseQueryKeys = {
  root: (mount: string) => [...engineQueryKeys.mount(mount), 'database'] as const,
  collection: (mount: string, collection: DatabaseCollection) =>
    [...databaseQueryKeys.root(mount), collection] as const,
  list: (mount: string, collection: DatabaseCollection) =>
    [...databaseQueryKeys.collection(mount, collection), 'list'] as const,
  detail: (mount: string, collection: DatabaseCollection, name: string) =>
    [...databaseQueryKeys.collection(mount, collection), 'detail', name] as const,
};

type Fetch<Result> = (gateway: DatabaseEngineGateway, session: VaultSession, signal: AbortSignal) => Promise<Result>;

function useDatabaseQuery<Result>(queryKey: QueryKey, fetch: Fetch<Result>, enabled = true) {
  const gateway = useDatabaseGateway();
  const vault = useVaultSession();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetch(gateway, vault.session!, signal),
    enabled: enabled && Boolean(vault.session),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

interface MutationOptions<Input> {
  /** Keys to refresh after success. */
  readonly invalidate?: (input: Input) => readonly QueryKey[];
  /** Keys to drop after success, e.g. a deleted role's detail. */
  readonly remove?: (input: Input) => readonly QueryKey[];
  /**
   * The result is secret (credentials). It is dropped from the mutation cache
   * as soon as the component unmounts and never enters the query cache.
   */
  readonly sensitive?: boolean;
}

function useDatabaseMutation<Input, Result>(
  run: (gateway: DatabaseEngineGateway, session: VaultSession, input: Input) => Promise<Result>,
  options: MutationOptions<Input> = {},
) {
  const gateway = useDatabaseGateway();
  const vault = useVaultSession();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Input) => run(gateway, vault.session!, input),
    ...(options.sensitive ? { gcTime: 0 } : {}),
    onSuccess: async (_result, input) => {
      for (const queryKey of options.remove?.(input) ?? []) queryClient.removeQueries({ queryKey, exact: true });
      await Promise.all((options.invalidate?.(input) ?? []).map((queryKey) => (
        queryClient.invalidateQueries({ queryKey })
      )));
    },
  });
  useSessionExpiryFromErrors(vault.expireSession, mutation.error);
  return mutation;
}

/* ------------------------------------------------------------------ queries */

export function useDatabaseConnections(mount: string) {
  return useDatabaseQuery(databaseQueryKeys.list(mount, 'connections'), (gateway, session, signal) => (
    gateway.listConnections(session, mount, signal)
  ));
}

export function useDatabaseConnection(mount: string, name: string | undefined) {
  return useDatabaseQuery(databaseQueryKeys.detail(mount, 'connections', name ?? ''), (gateway, session, signal) => (
    gateway.readConnection(session, mount, name!, signal)
  ), Boolean(name));
}

export function useDatabaseRoles(mount: string) {
  return useDatabaseQuery(databaseQueryKeys.list(mount, 'roles'), (gateway, session, signal) => (
    gateway.listRoles(session, mount, signal)
  ));
}

export function useDatabaseRole(mount: string, name: string | undefined) {
  return useDatabaseQuery(databaseQueryKeys.detail(mount, 'roles', name ?? ''), (gateway, session, signal) => (
    gateway.readRole(session, mount, name!, signal)
  ), Boolean(name));
}

export function useDatabaseStaticRoles(mount: string) {
  return useDatabaseQuery(databaseQueryKeys.list(mount, 'static-roles'), (gateway, session, signal) => (
    gateway.listStaticRoles(session, mount, signal)
  ));
}

export function useDatabaseStaticRole(mount: string, name: string | undefined) {
  return useDatabaseQuery(databaseQueryKeys.detail(mount, 'static-roles', name ?? ''), (gateway, session, signal) => (
    gateway.readStaticRole(session, mount, name!, signal)
  ), Boolean(name));
}

/* ------------------------------------------------------------------ connections */

export function useSaveConnection(mount: string) {
  return useDatabaseMutation(
    (gateway, session, input: DatabaseConnectionInput) => gateway.writeConnection(session, mount, input),
    { invalidate: () => [databaseQueryKeys.collection(mount, 'connections')] },
  );
}

export function useDeleteConnection(mount: string) {
  return useDatabaseMutation(
    (gateway, session, name: string) => gateway.deleteConnection(session, mount, name),
    {
      remove: (name) => [databaseQueryKeys.detail(mount, 'connections', name)],
      invalidate: () => [databaseQueryKeys.list(mount, 'connections')],
    },
  );
}

export function useResetConnection(mount: string) {
  return useDatabaseMutation((gateway, session, name: string) => gateway.resetConnection(session, mount, name));
}

export function useRotateRootCredentials(mount: string) {
  return useDatabaseMutation((gateway, session, name: string) => gateway.rotateRootCredentials(session, mount, name));
}

/* ------------------------------------------------------------------ dynamic roles */

export function useSaveRole(mount: string) {
  return useDatabaseMutation(
    (gateway, session, input: DatabaseRoleInput) => gateway.writeRole(session, mount, input),
    { invalidate: () => [databaseQueryKeys.collection(mount, 'roles')] },
  );
}

export function useDeleteRole(mount: string) {
  return useDatabaseMutation(
    (gateway, session, name: string) => gateway.deleteRole(session, mount, name),
    {
      remove: (name) => [databaseQueryKeys.detail(mount, 'roles', name)],
      invalidate: () => [databaseQueryKeys.list(mount, 'roles')],
    },
  );
}

/** Each call creates a new database user; the response stays in the caller's state only. */
export function useGenerateCredentials(mount: string) {
  return useDatabaseMutation(
    (gateway, session, role: string) => gateway.generateCredentials(session, mount, role),
    { sensitive: true },
  );
}

export function useRenewLease() {
  return useDatabaseMutation(
    (gateway, session, input: { readonly leaseId: string; readonly increment?: string }) => (
      gateway.renewLease(session, input.leaseId, input.increment)
    ),
  );
}

export function useRevokeLease() {
  return useDatabaseMutation((gateway, session, leaseId: string) => gateway.revokeLease(session, leaseId));
}

/* ------------------------------------------------------------------ static roles */

export function useSaveStaticRole(mount: string) {
  return useDatabaseMutation(
    (gateway, session, input: DatabaseStaticRoleInput) => gateway.writeStaticRole(session, mount, input),
    { invalidate: () => [databaseQueryKeys.collection(mount, 'static-roles')] },
  );
}

export function useDeleteStaticRole(mount: string) {
  return useDatabaseMutation(
    (gateway, session, name: string) => gateway.deleteStaticRole(session, mount, name),
    {
      remove: (name) => [databaseQueryKeys.detail(mount, 'static-roles', name)],
      invalidate: () => [databaseQueryKeys.list(mount, 'static-roles')],
    },
  );
}

/** Reads the current password of a static role; nothing is cached. */
export function useStaticCredentials(mount: string) {
  return useDatabaseMutation(
    (gateway, session, name: string) => gateway.readStaticCredentials(session, mount, name),
    { sensitive: true },
  );
}

export function useRotateStaticRole(mount: string) {
  return useDatabaseMutation(
    (gateway, session, name: string) => gateway.rotateStaticRole(session, mount, name),
    { invalidate: (name) => [databaseQueryKeys.detail(mount, 'static-roles', name)] },
  );
}
