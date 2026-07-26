import {
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  useCallback,
  useMemo,
} from 'react';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import {
  classifyPolicyName,
  parseManagedPolicyHcl,
} from '@/domain/access-control/managed-resources';
import { assessIdentityOwnership } from '@/domain/access-control/resource-ownership';
import {
  buildUserAccessReport,
  type UserAccessGroupsState,
  type UserAccessIdentityState,
  type UserAccessPolicy,
  type UserAccessPolicyAttachment,
  type UserAccessReport,
} from '@/domain/access-control/user-access-report';
import type {
  VaultAccessControlGateway,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';
import {
  normalizeVaultError,
  type VaultError,
} from '@/domain/vault/errors';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';
import { useAccessControlGateway } from './AccessControlGatewayContext';
import type {
  AccessControlUserRecord,
} from './useAccessControlData';
import type { VaultQueryState } from './useKvExplorerData';

export interface UserAccessAccountRef {
  readonly username: string;
  readonly mount: string;
  readonly mountAccessor: string;
}

export interface UserAccessIdentitySource {
  readonly state: UserAccessIdentityState;
  readonly entity: VaultIdentityEntity | null;
}

export interface UserAccessGroupsSource {
  readonly state: UserAccessGroupsState;
  readonly groups: readonly VaultIdentityGroup[];
}

export interface UserAccessReportResource {
  readonly kind: 'report';
  readonly user: AccessControlUserRecord;
  readonly report: UserAccessReport;
  readonly mounts: readonly string[];
  readonly policies: readonly UserAccessPolicy[];
  readonly identity: UserAccessIdentitySource;
  readonly groups: UserAccessGroupsSource;
  readonly refreshing: {
    readonly account: boolean;
    readonly identity: boolean;
    readonly groups: boolean;
    readonly policies: readonly string[];
  };
}

export interface UserAccessReportNotFound {
  readonly kind: 'not-found';
  readonly account: UserAccessAccountRef;
}

export type UserAccessReportData =
  | UserAccessReportResource
  | UserAccessReportNotFound;

export interface UserAccessReportActions {
  readonly retryAccount: () => void;
  readonly retryIdentity: () => void;
  readonly retryGroups: () => void;
  readonly retryPolicy: (policyName: string) => void;
  readonly retryIncomplete: () => void;
}

export interface UseUserAccessReportResult {
  readonly state: VaultQueryState<UserAccessReportData>;
  readonly actions: UserAccessReportActions;
}

function nonFatalSourceStatus(error: VaultError): 'denied' | 'unavailable' {
  return error.code === 'authorization' ? 'denied' : 'unavailable';
}

function rethrowFatalSourceError(error: VaultError): void {
  if (error.code === 'session-expired' || error.code === 'aborted') throw error;
}

export async function loadUserAccessIdentity(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  account: UserAccessAccountRef,
  signal?: AbortSignal,
): Promise<UserAccessIdentitySource> {
  try {
    const entity = await gateway.lookupEntityByAlias(
      session,
      account.username,
      account.mountAccessor,
      signal,
    );
    if (!entity) {
      return { state: { status: 'absent' }, entity: null };
    }
    const alias = entity.aliases.find(
      (candidate) => candidate.mountAccessor === account.mountAccessor,
    );
    return {
      state: {
        status: 'available',
        entity: {
          id: entity.id,
          displayName: entity.name,
          disabled: entity.disabled,
          ...(alias ? { aliasId: alias.id } : {}),
        },
      },
      entity,
    };
  } catch (cause) {
    const error = normalizeVaultError(cause);
    rethrowFatalSourceError(error);
    return {
      state: { status: nonFatalSourceStatus(error) },
      entity: null,
    };
  }
}

export async function loadUserAccessGroups(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  signal?: AbortSignal,
): Promise<UserAccessGroupsSource> {
  try {
    return {
      state: { status: 'available' },
      groups: await gateway.listGroups(session, signal),
    };
  } catch (cause) {
    const error = normalizeVaultError(cause);
    rethrowFatalSourceError(error);
    return {
      state: { status: nonFatalSourceStatus(error) },
      groups: [],
    };
  }
}

export async function loadUserAccessPolicy(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  name: string,
  signal?: AbortSignal,
): Promise<UserAccessPolicy> {
  const kind = classifyPolicyName(name);
  try {
    const policy = await gateway.readPolicy(session, name, signal);
    if (kind === 'external') {
      return {
        name,
        kind,
        status: 'external',
        hcl: policy.policy,
      };
    }
    const rules = parseManagedPolicyHcl(policy.policy);
    if (!rules) {
      return {
        name,
        kind,
        status: 'unsupported',
        hcl: policy.policy,
      };
    }
    return {
      name,
      kind,
      status: 'resolved',
      hcl: policy.policy,
      rules,
    };
  } catch (cause) {
    const error = normalizeVaultError(cause);
    rethrowFatalSourceError(error);
    const status = error.code === 'authorization'
      ? 'denied'
      : error.code === 'not-found'
        ? 'missing'
        : 'unreadable';
    return { name, kind, status };
  }
}

function directAttachment(policyName: string): UserAccessPolicyAttachment {
  return { policyName, origin: { kind: 'direct' } };
}

function selectedGroups(
  entity: VaultIdentityEntity | null,
  source: UserAccessGroupsSource,
): readonly VaultIdentityGroup[] {
  if (!entity || source.state.status !== 'available') return [];
  const selectedIds = new Set(entity.groupIds);
  source.groups.forEach((group) => {
    if (group.memberEntityIds.includes(entity.id)) selectedIds.add(group.id);
  });

  let added = true;
  while (added) {
    added = false;
    source.groups.forEach((group) => {
      if (
        !selectedIds.has(group.id)
        && group.memberGroupIds.some((groupId) => selectedIds.has(groupId))
      ) {
        selectedIds.add(group.id);
        added = true;
      }
    });
  }
  return source.groups
    .filter((group) => selectedIds.has(group.id))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function policyAttachments(
  account: VaultUserpassAccount,
  identity: UserAccessIdentitySource,
  groups: readonly VaultIdentityGroup[],
): readonly UserAccessPolicyAttachment[] {
  return [
    ...account.tokenPolicies.map(directAttachment),
    ...(identity.entity?.policies ?? []).map(directAttachment),
    ...groups.flatMap((group) => group.policies.map((policyName) => ({
      policyName,
      origin: {
        kind: 'group' as const,
        groupId: group.id,
        groupName: group.name,
      },
    }))),
  ];
}

function uniquePolicyNames(
  attachments: readonly UserAccessPolicyAttachment[],
): readonly string[] {
  return [...new Set(attachments.map(({ policyName }) => policyName))]
    .sort((left, right) => left.localeCompare(right));
}

function profileUser(
  account: VaultUserpassAccount,
  accountRef: UserAccessAccountRef,
  identity: UserAccessIdentitySource,
  groups: readonly VaultIdentityGroup[],
): AccessControlUserRecord {
  const directPolicies = [
    ...new Set([
      ...account.tokenPolicies,
      ...(identity.entity?.policies ?? []),
    ]),
  ];
  return {
    id: `${account.mount}:${account.username}`,
    username: account.username,
    displayName: identity.entity?.name ?? account.username,
    mount: account.mount,
    mountAccessor: accountRef.mountAccessor,
    tokenPolicies: account.tokenPolicies,
    account,
    entity: identity.entity,
    identityOwnership: assessIdentityOwnership(identity.entity?.metadata),
    groups,
    directRolePolicyNames: directPolicies.filter(
      (name) => classifyPolicyName(name) === 'role',
    ),
    directPolicyNames: directPolicies.filter(
      (name) => classifyPolicyName(name) === 'user-direct',
    ),
    externalPolicyNames: directPolicies.filter(
      (name) => classifyPolicyName(name) === 'external' && name !== 'default',
    ),
  };
}

function queryError(queries: readonly {
  readonly error: Error | null;
  readonly isError: boolean;
}[]): VaultError | undefined {
  const failed = queries.find((query) => query.isError);
  return failed ? normalizeVaultError(failed.error) : undefined;
}

export function useUserAccessReport(
  session: VaultSession,
  accountRef: UserAccessAccountRef | undefined,
  mounts: readonly string[],
): UseUserAccessReportResult {
  const gateway = useAccessControlGateway();
  const queryClient = useQueryClient();
  const mount = accountRef?.mount ?? '';
  const username = accountRef?.username ?? '';
  const enabled = Boolean(accountRef);

  const accountQuery = useQuery({
    queryKey: vaultQueryKeys.userAccessAccount(mount, username),
    queryFn: ({ signal }) => gateway.readUserpassAccount(
      session,
      mount,
      username,
      signal,
    ),
    enabled,
  });
  const detailEnabled = enabled && accountQuery.data !== undefined && accountQuery.data !== null;
  const identityQuery = useQuery({
    queryKey: vaultQueryKeys.userAccessIdentity(mount, username),
    queryFn: ({ signal }) => loadUserAccessIdentity(
      gateway,
      session,
      accountRef!,
      signal,
    ),
    enabled: detailEnabled,
  });
  const groupsQuery = useQuery({
    queryKey: vaultQueryKeys.userAccessGroups(mount, username),
    queryFn: ({ signal }) => loadUserAccessGroups(gateway, session, signal),
    enabled: detailEnabled,
  });

  const membershipGroups = useMemo(
    () => selectedGroups(
      identityQuery.data?.entity ?? null,
      groupsQuery.data ?? { state: { status: 'unavailable' }, groups: [] },
    ),
    [groupsQuery.data, identityQuery.data?.entity],
  );
  const attachments = useMemo(
    () => accountQuery.data
      ? policyAttachments(
          accountQuery.data,
          identityQuery.data ?? {
            state: { status: 'unavailable' },
            entity: null,
          },
          membershipGroups,
        )
      : [],
    [accountQuery.data, identityQuery.data, membershipGroups],
  );
  const policyNames = useMemo(() => uniquePolicyNames(attachments), [attachments]);
  const policyQueries = useQueries({
    queries: policyNames.map((policyName) => ({
      queryKey: vaultQueryKeys.userAccessPolicy(mount, username, policyName),
      queryFn: ({ signal }: { signal: AbortSignal }) => loadUserAccessPolicy(
        gateway,
        session,
        policyName,
        signal,
      ),
      enabled: false,
    })),
  });
  const sourcesSettled = identityQuery.data !== undefined && groupsQuery.data !== undefined;
  const policyBatchQuery = useQuery({
    queryKey: vaultQueryKeys.userAccessPolicyBatch(mount, username, policyNames),
    queryFn: ({ signal }) => mapWithConcurrency(policyNames, 4, async (policyName) => {
      const policy = await loadUserAccessPolicy(gateway, session, policyName, signal);
      queryClient.setQueryData(
        vaultQueryKeys.userAccessPolicy(mount, username, policyName),
        policy,
      );
      return policy;
    }),
    enabled: detailEnabled && sourcesSettled && policyNames.length > 0,
  });

  const policies = policyQueries
    .map((query) => query.data)
    .filter((policy): policy is UserAccessPolicy => policy !== undefined);
  const policiesReady = policyNames.length === 0
    || (
      !policyBatchQuery.isPending
      && policies.length === policyNames.length
    );
  const identity = identityQuery.data;
  const groups = groupsQuery.data;
  const account = accountQuery.data;
  const ready = Boolean(account && identity && groups && policiesReady);

  const data = useMemo<UserAccessReportData | undefined>(() => {
    if (enabled && accountQuery.data === null) {
      return { kind: 'not-found', account: accountRef! };
    }
    if (!ready || !account || !identity || !groups || !accountRef) return undefined;
    const groupsState: UserAccessGroupsState = identity.state.status === 'absent'
      ? { status: 'not-applicable' }
      : groups.state;
    const report = buildUserAccessReport({
      account: {
        username: account.username,
        mount: account.mount,
        mountAccessor: accountRef.mountAccessor,
      },
      mounts,
      identity: identity.state,
      groups: groupsState,
      attachments,
      policies,
    });
    return {
      kind: 'report',
      user: profileUser(account, accountRef, identity, membershipGroups),
      report,
      mounts,
      policies,
      identity,
      groups: {
        ...groups,
        state: groupsState,
      },
      refreshing: {
        account: accountQuery.isFetching,
        identity: identityQuery.isFetching,
        groups: groupsQuery.isFetching,
        policies: policyNames.filter((_, index) => policyQueries[index]?.isFetching),
      },
    };
  }, [
    account,
    accountQuery.data,
    accountQuery.isFetching,
    accountRef,
    attachments,
    enabled,
    groups,
    groupsQuery.isFetching,
    identity,
    identityQuery.isFetching,
    membershipGroups,
    mounts,
    policies,
    policyNames,
    policyQueries,
    ready,
  ]);

  const fatalError = queryError([
    accountQuery,
    identityQuery,
    groupsQuery,
    policyBatchQuery,
    ...policyQueries,
  ]);
  let state: VaultQueryState<UserAccessReportData>;
  if (!enabled) {
    state = { status: 'idle' };
  } else if (fatalError) {
    state = {
      status: 'error',
      error: fatalError,
      ...(data ? { data } : {}),
    };
  } else if (!data) {
    state = { status: 'loading' };
  } else {
    state = { status: 'success', data };
  }

  const retryPolicy = useCallback((policyName: string) => {
    const queryKey = vaultQueryKeys.userAccessPolicy(mount, username, policyName);
    void queryClient.invalidateQueries({
      queryKey,
      exact: true,
      refetchType: 'none',
    }).then(() => queryClient.fetchQuery({
      queryKey,
      queryFn: ({ signal }) => loadUserAccessPolicy(
        gateway,
        session,
        policyName,
        signal,
      ),
    }));
  }, [gateway, mount, queryClient, session, username]);

  const retryIncomplete = useCallback(() => {
    const identityStatus = identityQuery.data?.state.status;
    if (identityStatus === 'denied' || identityStatus === 'unavailable') {
      void identityQuery.refetch();
    }
    const groupsStatus = groupsQuery.data?.state.status;
    if (groupsStatus === 'denied' || groupsStatus === 'unavailable') {
      void groupsQuery.refetch();
    }
    policies.forEach((policy) => {
      if (
        policy.status === 'denied'
        || policy.status === 'missing'
        || policy.status === 'unreadable'
      ) {
        retryPolicy(policy.name);
      }
    });
  }, [groupsQuery, identityQuery, policies, retryPolicy]);

  return {
    state,
    actions: {
      retryAccount: () => { void accountQuery.refetch(); },
      retryIdentity: () => { void identityQuery.refetch(); },
      retryGroups: () => { void groupsQuery.refetch(); },
      retryPolicy,
      retryIncomplete,
    },
  };
}
