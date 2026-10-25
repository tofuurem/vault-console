import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import {
  classifyPolicyName,
  parseManagedPolicyHcl,
} from '@/domain/access-control/managed-resources';
import {
  resolveSecretAccess,
  type SecretAccessGap,
  type SecretAccessGroup,
  type SecretAccessPolicy,
  type SecretAccessReport,
  type SecretAccessSourceReason,
  type SecretAccessUser,
} from '@/domain/access-control/secret-access';
import type {
  VaultAccessControlGateway,
  VaultAuthMount,
  VaultIdentityEntity,
  VaultSession,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';
import { useAccessControlGateway } from './AccessControlGatewayContext';
import type { VaultQueryState } from './useKvExplorerData';

export interface SecretAccessSnapshot {
  readonly users: readonly SecretAccessUser[];
  readonly groups: readonly SecretAccessGroup[];
  readonly rolePolicyNames: readonly string[];
  readonly policies: readonly SecretAccessPolicy[];
  readonly gaps: readonly SecretAccessGap[];
}

type Captured<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: SecretAccessSourceReason };

/** Session expiry and cancellation stop the load; anything else is a visible gap. */
async function capture<T>(operation: () => Promise<T>): Promise<Captured<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired' || error.code === 'aborted') throw error;
    return { ok: false, reason: error.code === 'authorization' ? 'denied' : 'unavailable' };
  }
}

export async function loadSecretAccessPolicy(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  name: string,
  signal?: AbortSignal,
): Promise<SecretAccessPolicy> {
  try {
    const policy = await gateway.readPolicy(session, name, signal);
    const rules = parseManagedPolicyHcl(policy.policy);
    return rules ? { name, status: 'resolved', rules } : { name, status: 'unsupported' };
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired' || error.code === 'aborted') throw error;
    if (error.code === 'authorization') return { name, status: 'denied' };
    if (error.code === 'not-found') return { name, status: 'missing' };
    return { name, status: 'unreadable' };
  }
}

function entityForAccount(
  entities: readonly VaultIdentityEntity[],
  account: VaultUserpassAccount,
  mount: VaultAuthMount,
): VaultIdentityEntity | undefined {
  return entities.find((entity) => entity.aliases.some((alias) => (
    alias.mountAccessor === mount.accessor && alias.name === account.username
  )));
}

function accessUser(
  account: VaultUserpassAccount,
  mount: VaultAuthMount,
  entities: Captured<readonly VaultIdentityEntity[]>,
): SecretAccessUser {
  const entity = entities.ok ? entityForAccount(entities.value, account, mount) : undefined;
  return {
    username: account.username,
    mount: account.mount,
    tokenPolicies: account.tokenPolicies,
    noDefaultPolicy: account.tokenNoDefaultPolicy === true,
    identity: !entities.ok
      ? { status: 'unknown' }
      : entity
        ? {
            status: 'available',
            entity: {
              id: entity.id,
              name: entity.name,
              disabled: entity.disabled,
              policies: entity.policies,
              groupIds: entity.groupIds,
            },
          }
        : { status: 'absent' },
  };
}

async function loadUsers(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  mounts: readonly VaultAuthMount[],
  entities: Captured<readonly VaultIdentityEntity[]>,
  gaps: SecretAccessGap[],
  signal?: AbortSignal,
): Promise<readonly SecretAccessUser[]> {
  const batches = await mapWithConcurrency(mounts, 4, async (mount) => {
    const accounts = await capture(() => gateway.listUserpassAccounts(session, mount.path, signal));
    if (!accounts.ok) {
      gaps.push({ source: 'userpass-mount', id: mount.path, reason: accounts.reason });
      return [];
    }
    return accounts.value.map((account) => accessUser(account, mount, entities));
  });
  return batches.flat();
}

function attachedPolicyNames(
  users: readonly SecretAccessUser[],
  groups: readonly SecretAccessGroup[],
  rolePolicyNames: readonly string[],
): readonly string[] {
  const names = new Set<string>(rolePolicyNames);
  users.forEach((user) => {
    user.tokenPolicies.forEach((name) => names.add(name));
    if (!user.noDefaultPolicy) names.add('default');
    if (user.identity.status === 'available') user.identity.entity.policies.forEach((name) => names.add(name));
  });
  groups.forEach((group) => group.policies.forEach((name) => names.add(name)));
  return [...names].sort((left, right) => left.localeCompare(right));
}

/**
 * Reads the path-independent part of the access model once: userpass
 * accounts, identities, groups, and every policy they reference. Unreadable
 * sources become explicit gaps instead of silently shrinking the result.
 */
export async function loadSecretAccessSnapshot(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  signal?: AbortSignal,
): Promise<SecretAccessSnapshot> {
  const gaps: SecretAccessGap[] = [];
  const [authMounts, groupsResult, entities, policyNames] = await Promise.all([
    capture(() => gateway.listAuthMounts(session, signal)),
    capture(() => gateway.listGroups(session, signal)),
    capture(() => gateway.listEntities(session, signal)),
    capture(() => gateway.listPolicies(session, signal)),
  ]);
  if (!authMounts.ok) gaps.push({ source: 'auth-mounts', reason: authMounts.reason });
  if (!groupsResult.ok) gaps.push({ source: 'groups', reason: groupsResult.reason });
  if (!entities.ok) gaps.push({ source: 'entities', reason: entities.reason });
  if (!policyNames.ok) gaps.push({ source: 'policy-list', reason: policyNames.reason });

  const userpassMounts = authMounts.ok
    ? authMounts.value.filter((mount) => mount.type === 'userpass')
    : [];
  const users = await loadUsers(gateway, session, userpassMounts, entities, gaps, signal);
  const groups: readonly SecretAccessGroup[] = groupsResult.ok
    ? groupsResult.value.map((group) => ({
        id: group.id,
        name: group.name,
        policies: group.policies,
        memberEntityIds: group.memberEntityIds,
        memberGroupIds: group.memberGroupIds,
      }))
    : [];
  const rolePolicyNames = policyNames.ok
    ? policyNames.value.filter((name) => classifyPolicyName(name) === 'role')
    : [];
  const policies = await mapWithConcurrency(
    attachedPolicyNames(users, groups, rolePolicyNames),
    4,
    (name) => loadSecretAccessPolicy(gateway, session, name, signal),
  );
  return { users, groups, rolePolicyNames, policies, gaps };
}

export interface UseSecretAccessResult {
  readonly state: VaultQueryState<SecretAccessReport>;
  readonly refreshing: boolean;
  readonly refresh: () => void;
}

/** Loads lazily: nothing is requested until `enabled` turns true. */
export function useSecretAccess(
  session: VaultSession,
  mount: string,
  path: string,
  enabled: boolean,
): UseSecretAccessResult {
  const gateway = useAccessControlGateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.secretAccessSnapshot(),
    queryFn: ({ signal }) => loadSecretAccessSnapshot(gateway, session, signal),
    enabled,
  });
  const report = useMemo(
    () => query.data
      ? resolveSecretAccess({ mount, path, ...query.data })
      : undefined,
    [mount, path, query.data],
  );
  const state: VaultQueryState<SecretAccessReport> = !enabled
    ? { status: 'idle' }
    : query.isError
      ? {
          status: 'error',
          error: normalizeVaultError(query.error),
          ...(report ? { data: report } : {}),
        }
      : report
        ? { status: 'success', data: report }
        : { status: 'loading' };
  return {
    state,
    refreshing: query.isFetching,
    refresh: () => { void query.refetch(); },
  };
}
