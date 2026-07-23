import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { mapWithConcurrency } from '@/application/query/bounded-concurrency';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type { AccessPolicyRule } from '@/domain/access-control/effective-access';
import {
  classifyPolicyName,
  managedRoleName,
  parseManagedPolicyHcl,
  type ManagedPolicyKind,
} from '@/domain/access-control/managed-resources';
import type {
  VaultAclPolicy,
  VaultAccessControlGateway,
  VaultAuthMount,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';
import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import { useAccessControlGateway } from './AccessControlGatewayContext';
import type { VaultQueryState } from './useKvExplorerData';

export interface AccessPolicyRecord {
  readonly name: string;
  readonly kind: ManagedPolicyKind;
  readonly hcl?: string;
  readonly rules: readonly AccessPolicyRule[] | null;
  readonly readable: boolean;
}

export interface AccessControlRoleRecord {
  readonly id: string;
  readonly name: string;
  readonly policyName: string;
  readonly rules: readonly AccessPolicyRule[] | null;
}

export interface AccessControlUserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly mount: string;
  readonly mountAccessor: string;
  readonly tokenPolicies: readonly string[];
  readonly entity: VaultIdentityEntity | null;
  readonly groups: readonly VaultIdentityGroup[];
  readonly directRolePolicyNames: readonly string[];
  readonly directPolicyNames: readonly string[];
  readonly externalPolicyNames: readonly string[];
  readonly detailWarning?: string;
}

export interface AccessControlSnapshot {
  readonly authMounts: readonly VaultAuthMount[];
  readonly userpassMounts: readonly VaultAuthMount[];
  readonly groups: readonly VaultIdentityGroup[];
  readonly policies: readonly AccessPolicyRecord[];
  readonly roles: readonly AccessControlRoleRecord[];
  readonly users: readonly AccessControlUserRecord[];
  readonly warnings: readonly string[];
}

export interface UserpassUsersResult {
  readonly users: readonly AccessControlUserRecord[];
  readonly warnings: readonly string[];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function toQueryState<T>(
  query: {
    readonly data: T | undefined;
    readonly error: Error | null;
    readonly isError: boolean;
    readonly isPending: boolean;
  },
  idle = false,
): VaultQueryState<T> {
  if (idle) return { status: 'idle' };
  if (query.isError) {
    return {
      status: 'error',
      error: normalizeVaultError(query.error),
      ...(query.data === undefined ? {} : { data: query.data }),
    };
  }
  if (query.isPending || query.data === undefined) return { status: 'loading' };
  return { status: 'success', data: query.data };
}

function userFromAccount(
  account: VaultUserpassAccount,
  mount: VaultAuthMount,
): AccessControlUserRecord {
  const attachedPolicies = unique(account.tokenPolicies);
  return {
    id: `${account.mount}:${account.username}`,
    username: account.username,
    displayName: account.username,
    mount: account.mount,
    mountAccessor: mount.accessor,
    tokenPolicies: account.tokenPolicies,
    entity: null,
    groups: [],
    directRolePolicyNames: attachedPolicies.filter((name) => classifyPolicyName(name) === 'role'),
    directPolicyNames: attachedPolicies.filter((name) => classifyPolicyName(name) === 'user-direct'),
    externalPolicyNames: attachedPolicies.filter((name) => (
      classifyPolicyName(name) === 'external' && name !== 'default'
    )),
  };
}

export async function loadUserpassUsers(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  mounts: readonly VaultAuthMount[],
  signal?: AbortSignal,
): Promise<UserpassUsersResult> {
  const warnings: string[] = [];
  const batches = await mapWithConcurrency(mounts, 4, async (mount) => {
    try {
      const accounts = await gateway.listUserpassAccounts(session, mount.path, signal);
      return accounts.map((account) => userFromAccount(account, mount));
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired' || error.code === 'aborted') throw error;
      warnings.push(`Accounts at auth/${mount.path} could not be listed with this token.`);
      return [];
    }
  });
  return {
    users: batches.flat().sort((left, right) => left.username.localeCompare(right.username)),
    warnings,
  };
}

export async function loadUserDetails(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  user: AccessControlUserRecord,
  groups: readonly VaultIdentityGroup[],
  signal?: AbortSignal,
): Promise<AccessControlUserRecord> {
  let entity: VaultIdentityEntity | null;
  try {
    entity = await gateway.lookupEntityByAlias(
      session,
      user.username,
      user.mountAccessor,
      signal,
    );
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired' || error.code === 'aborted') throw error;
    return {
      ...user,
      detailWarning: 'Identity details are not readable with this token.',
    };
  }
  if (!entity) return user;
  const attachedPolicies = unique([...user.tokenPolicies, ...entity.policies]);
  return {
    ...user,
    displayName: entity.name,
    entity,
    groups: groups.filter((group) => (
      group.memberEntityIds.includes(entity.id) || entity.groupIds.includes(group.id)
    )),
    directRolePolicyNames: attachedPolicies.filter((name) => classifyPolicyName(name) === 'role'),
    directPolicyNames: attachedPolicies.filter((name) => classifyPolicyName(name) === 'user-direct'),
    externalPolicyNames: attachedPolicies.filter((name) => (
      classifyPolicyName(name) === 'external' && name !== 'default'
    )),
  };
}

async function readPolicyRecord(
  read: () => Promise<VaultAclPolicy>,
  name: string,
): Promise<AccessPolicyRecord> {
  const kind = classifyPolicyName(name);
  try {
    const policy = await read();
    return {
      name,
      kind,
      hcl: policy.policy,
      rules: kind === 'external' ? null : parseManagedPolicyHcl(policy.policy),
      readable: true,
    };
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired' || error.code === 'aborted') throw error;
    return { name, kind, rules: null, readable: false };
  }
}

export function rolesFromPolicyNames(names: readonly string[]): readonly AccessControlRoleRecord[] {
  return names
    .filter((name) => classifyPolicyName(name) === 'role')
    .map((name) => ({
      id: name,
      name: managedRoleName(name),
      policyName: name,
      rules: null,
    }));
}

export function useAuthMounts(
  session: VaultSession,
  enabled = true,
): readonly [VaultQueryState<readonly VaultAuthMount[]>, () => void] {
  const gateway = useAccessControlGateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.authMounts(),
    queryFn: ({ signal }) => gateway.listAuthMounts(session, signal),
    enabled,
  });
  return [toQueryState(query, !enabled), () => { void query.refetch(); }];
}

export function useUserpassUsers(
  session: VaultSession,
  mounts: readonly VaultAuthMount[],
  enabled = true,
): readonly [VaultQueryState<UserpassUsersResult>, () => void] {
  const gateway = useAccessControlGateway();
  const mountPaths = mounts.map((mount) => mount.path);
  const query = useQuery({
    queryKey: vaultQueryKeys.userpassUsers(mountPaths),
    queryFn: ({ signal }) => loadUserpassUsers(gateway, session, mounts, signal),
    enabled: enabled && mounts.length > 0,
  });
  const idle = !enabled;
  if (enabled && mounts.length === 0) {
    return [{ status: 'success', data: { users: [], warnings: [] } }, () => {}];
  }
  return [toQueryState(query, idle), () => { void query.refetch(); }];
}

export function useGroups(
  session: VaultSession,
  enabled = true,
): readonly [VaultQueryState<readonly VaultIdentityGroup[]>, () => void] {
  const gateway = useAccessControlGateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.groups(),
    queryFn: ({ signal }) => gateway.listGroups(session, signal),
    enabled,
  });
  return [toQueryState(query, !enabled), () => { void query.refetch(); }];
}

export function usePolicyNames(
  session: VaultSession,
  enabled = true,
): readonly [VaultQueryState<readonly string[]>, () => void] {
  const gateway = useAccessControlGateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.policies(),
    queryFn: ({ signal }) => gateway.listPolicies(session, signal),
    enabled,
  });
  return [toQueryState(query, !enabled), () => { void query.refetch(); }];
}

export function usePolicyRecord(
  session: VaultSession,
  name: string | undefined,
): VaultQueryState<AccessPolicyRecord> {
  const gateway = useAccessControlGateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.policy(name ?? ''),
    queryFn: ({ signal }) => readPolicyRecord(
      () => gateway.readPolicy(session, name!, signal),
      name!,
    ),
    enabled: Boolean(name),
  });
  return toQueryState(query, !name);
}

export function usePolicyCatalog(
  session: VaultSession,
  names: readonly string[],
  enabled = true,
): VaultQueryState<readonly AccessPolicyRecord[]> {
  const gateway = useAccessControlGateway();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: vaultQueryKeys.policyCatalog(names),
    enabled: enabled && names.length > 0,
    queryFn: () => mapWithConcurrency(names, 4, (name) => queryClient.fetchQuery({
      queryKey: vaultQueryKeys.policy(name),
      queryFn: ({ signal }) => readPolicyRecord(
        () => gateway.readPolicy(session, name, signal),
        name,
      ),
    })),
  });
  if (enabled && names.length === 0) return { status: 'success', data: [] };
  return toQueryState(query, !enabled);
}

export function useUserDetails(
  session: VaultSession,
  user: AccessControlUserRecord | undefined,
  groups: readonly VaultIdentityGroup[],
): VaultQueryState<AccessControlUserRecord> {
  const gateway = useAccessControlGateway();
  const query = useQuery({
    queryKey: vaultQueryKeys.userpassUser(user?.mount ?? '', user?.username ?? ''),
    queryFn: ({ signal }) => loadUserDetails(gateway, session, user!, groups, signal),
    enabled: Boolean(user),
  });
  return toQueryState(query, !user);
}

export function firstQueryError(
  states: readonly VaultQueryState<unknown>[],
): VaultError | undefined {
  return states.find((state) => state.status === 'error')?.error;
}
