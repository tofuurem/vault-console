import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthenticatedShell } from '@/app/authenticated-shell';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { useAccessControlGateway } from '@/application/vault/AccessControlGatewayContext';
import {
  firstQueryError,
  rolesFromPolicyNames,
  useAuthMounts,
  useGroups,
  useIdentityTombstones,
  usePolicyCatalog,
  usePolicyNames,
  usePolicyRecord,
  useUserpassUsers,
  type AccessControlSnapshot,
  type AccessControlUserRecord,
  type AccessPolicyRecord,
  type AccessControlRoleRecord,
  type UserpassUsersResult,
} from '@/application/vault/useAccessControlData';
import {
  useUserAccessReport,
  type UserAccessAccountRef,
} from '@/application/vault/useUserAccessReport';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { VaultQueryState } from '@/application/vault/useKvExplorerData';
import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import type { VaultAuthMount, VaultIdentityGroup } from '@/domain/vault/contracts';
import type { CreateUserAccessCatalog } from './components/create-user/access';
import type { AccessCenterRoute } from './page-route';

function mountRoots(mounts: readonly { readonly path: string }[]): readonly KvAccessTreeNode[] {
  return mounts.map((mount) => ({
    id: `${mount.path}:`,
    label: mount.path,
    mount: mount.path,
    path: '',
    target: 'folder',
    children: [],
  }));
}

function roleDisplayName(
  roles: readonly AccessControlRoleRecord[],
  policyName: string,
): string {
  return roles.find((role) => role.policyName === policyName)?.name ?? policyName;
}

function findProfileUser(
  route: AccessCenterRoute,
  usersState: VaultQueryState<UserpassUsersResult>,
): AccessControlUserRecord | undefined {
  const { username } = route.params;
  if (!username) return undefined;
  return usersState.data?.users.find((user) => (
    user.username === username
    && (!route.profileMount || user.mount === route.profileMount)
  ));
}

function resolveProfileAccount(
  username: string | undefined,
  profileMount: string | null,
  profileAuthMount: VaultAuthMount | undefined,
  baseProfileUser: AccessControlUserRecord | undefined,
): UserAccessAccountRef | undefined {
  if (!username) return undefined;
  if (profileMount && profileAuthMount) {
    return {
      username,
      mount: profileAuthMount.path,
      mountAccessor: profileAuthMount.accessor,
    };
  }
  if (!profileMount && baseProfileUser) {
    return {
      username: baseProfileUser.username,
      mount: baseProfileUser.mount,
      mountAccessor: baseProfileUser.mountAccessor,
    };
  }
  return undefined;
}

function buildCatalog(
  groups: readonly VaultIdentityGroup[],
  policies: readonly AccessPolicyRecord[],
  roles: readonly AccessControlRoleRecord[],
  mounts: readonly { readonly path: string }[],
): CreateUserAccessCatalog {
  const managedRolePolicies = policies.filter((policy) => (
    policy.kind === 'role'
    && policy.ownership === 'managed'
    && policy.editable
  ));
  const managedRoleNames = new Set(managedRolePolicies.map(({ name }) => name));
  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      roleIds: group.policies.filter((policy) => managedRoleNames.has(policy)),
      policyNames: group.policies.filter((policy) => !managedRoleNames.has(policy)),
    })),
    roles: managedRolePolicies.map((policy) => ({
      id: policy.name,
      name: roleDisplayName(roles, policy.name),
      policyNames: [policy.name],
    })),
    policies: policies.map((policy) => ({
      name: policy.name,
      managed: policy.ownership === 'managed',
      rules: policy.rules,
    })),
    tree: mountRoots(mounts),
  };
}

function useAccessCenterQueries(route: AccessCenterRoute, selectedPolicyName: string | undefined) {
  const { mountsState } = useAuthenticatedShell();
  const vault = useVaultSession();
  const session = vault.session!;
  const [authMountsState, refreshAuthMounts] = useAuthMounts(
    session,
    route.usersNeeded || route.profileRequested,
  );
  const userpassMounts = (authMountsState.data ?? []).filter((mount) => mount.type === 'userpass');
  const [usersState, refreshUsers] = useUserpassUsers(
    session,
    userpassMounts,
    route.usersNeeded && authMountsState.status === 'success',
  );
  const [groupsState, refreshGroups] = useGroups(session, route.groupsNeeded);
  const [tombstonesState, refreshTombstones] = useIdentityTombstones(
    session,
    route.removedIdentitiesRequested,
  );
  const [policyNamesState] = usePolicyNames(session, route.policiesNeeded);
  const policyCatalogState = usePolicyCatalog(
    session,
    policyNamesState.data ?? [],
    route.policyCatalogNeeded && policyNamesState.status === 'success',
  );
  const selectedPolicyState = usePolicyRecord(
    session,
    route.activeSection === 'policies'
      ? selectedPolicyName
      : undefined,
  );
  return {
    vault,
    session,
    mountsState,
    authMountsState,
    refreshAuthMounts,
    userpassMounts,
    usersState,
    refreshUsers,
    groupsState,
    refreshGroups,
    tombstonesState,
    refreshTombstones,
    policyNamesState,
    policyCatalogState,
    selectedPolicyState,
  };
}

type AccessCenterQueries = ReturnType<typeof useAccessCenterQueries>;

function useAccessCenterProfile(route: AccessCenterRoute, queries: AccessCenterQueries) {
  const { profileMount } = route;
  const { username } = route.params;
  const baseProfileUser = findProfileUser(route, queries.usersState);
  const profileAuthMount = profileMount
    ? queries.userpassMounts.find((mount) => mount.path === profileMount)
    : undefined;
  const profileAccount = useMemo(
    () => resolveProfileAccount(username, profileMount, profileAuthMount, baseProfileUser),
    [baseProfileUser, username, profileAuthMount, profileMount],
  );
  const profileReport = useUserAccessReport(
    queries.session,
    route.profileRequested && !route.editingUser ? profileAccount : undefined,
    (queries.mountsState.data ?? []).map((mount) => mount.path),
  );
  const profileNotFound = (
    (Boolean(profileMount) && queries.authMountsState.status === 'success' && !profileAuthMount)
    || (!profileMount && queries.usersState.status === 'success' && !baseProfileUser)
    || profileReport.state.data?.kind === 'not-found'
  );
  return { profileAccount, profileReport, profileNotFound };
}

function useSessionExpiry(
  queries: AccessCenterQueries,
  profileReportState: VaultQueryState<unknown>,
) {
  const {
    vault,
    mountsState,
    authMountsState,
    usersState,
    groupsState,
    policyNamesState,
    policyCatalogState,
    selectedPolicyState,
    tombstonesState,
  } = queries;
  useEffect(() => {
    const error = firstQueryError([
      mountsState,
      authMountsState,
      usersState,
      groupsState,
      policyNamesState,
      policyCatalogState,
      selectedPolicyState,
      profileReportState,
      tombstonesState,
    ]);
    if (error?.code === 'session-expired') vault.expireSession();
  }, [
    authMountsState,
    groupsState,
    mountsState,
    policyCatalogState,
    policyNamesState,
    profileReportState,
    selectedPolicyState,
    usersState,
    tombstonesState,
    vault,
  ]);
}

function useAccessCenterCatalog(queries: AccessCenterQueries) {
  const {
    authMountsState,
    usersState,
    groupsState,
    policyNamesState,
    policyCatalogState,
    mountsState,
    userpassMounts,
  } = queries;
  const policies = useMemo(() => policyCatalogState.data ?? [], [policyCatalogState.data]);
  const roles = useMemo(() => rolesFromPolicyNames(policyNamesState.data ?? []), [policyNamesState.data]);
  const catalog = useMemo<CreateUserAccessCatalog>(
    () => buildCatalog(groupsState.data ?? [], policies, roles, mountsState.data ?? []),
    [groupsState.data, mountsState.data, policies, roles],
  );
  const snapshot = useMemo<AccessControlSnapshot | undefined>(() => {
    if (
      authMountsState.status !== 'success'
      || usersState.status !== 'success'
      || groupsState.status !== 'success'
      || policyCatalogState.status !== 'success'
    ) return undefined;
    return {
      authMounts: authMountsState.data,
      userpassMounts,
      groups: groupsState.data,
      policies: policyCatalogState.data,
      roles: policyCatalogState.data
        .filter((policy) => policy.kind === 'role')
        .map((policy) => ({
          id: policy.name,
          name: roleDisplayName(roles, policy.name),
          policyName: policy.name,
          rules: policy.rules,
          ownership: policy.ownership,
          editable: policy.editable,
        })),
      users: usersState.data.users,
      warnings: usersState.data.warnings,
    };
  }, [
    authMountsState,
    groupsState,
    policyCatalogState,
    roles,
    userpassMounts,
    usersState,
  ]);
  return { catalog, snapshot };
}

export function useAccessCenterData(route: AccessCenterRoute, selectedPolicyName: string | undefined) {
  const accessGateway = useAccessControlGateway();
  const queryClient = useQueryClient();
  const queries = useAccessCenterQueries(route, selectedPolicyName);
  const { profileAccount, profileReport, profileNotFound } = useAccessCenterProfile(route, queries);
  useSessionExpiry(queries, profileReport.state);
  const { catalog, snapshot } = useAccessCenterCatalog(queries);
  const { authMountsState, usersState, refreshAuthMounts, refreshUsers, refreshGroups } = queries;
  const refreshPolicyResources = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.policyRecords(),
      }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.policies(),
      }),
    ]);
    await queryClient.invalidateQueries({
      queryKey: vaultQueryKeys.policyCatalogs(),
    });
  }, [queryClient]);
  const refreshCreateUserResources = () => {
    refreshAuthMounts();
    refreshUsers();
    refreshGroups();
    void refreshPolicyResources();
  };
  const refreshUserListResources = () => {
    refreshAuthMounts();
    refreshUsers();
  };
  const refreshProfileResources = () => {
    refreshAuthMounts();
    if (!route.profileMount) refreshUsers();
    profileReport.actions.retryAccount();
    profileReport.actions.retryIncomplete();
  };
  return {
    ...queries,
    accessGateway,
    catalog,
    snapshot,
    profileAccount,
    profileReport,
    profileNotFound,
    usersResourceError: firstQueryError([authMountsState, usersState]),
    profileResourceError: firstQueryError([
      authMountsState,
      ...(route.profileMount ? [] : [usersState]),
      profileReport.state,
    ]),
    refreshPolicyResources,
    refreshCreateUserResources,
    refreshUserListResources,
    refreshProfileResources,
  };
}

export type AccessCenterData = ReturnType<typeof useAccessCenterData>;
