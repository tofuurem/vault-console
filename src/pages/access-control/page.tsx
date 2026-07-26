import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuthenticatedShell } from '@/app/authenticated-shell';
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
} from '@/application/vault/useAccessControlData';
import {
  useUserAccessReport,
  type UserAccessAccountRef,
} from '@/application/vault/useUserAccessReport';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { VaultQueryState } from '@/application/vault/useKvExplorerData';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import type { VaultError } from '@/domain/vault/errors';
import type { CreateUserAccessCatalog } from './components/create-user/access';
import AccessCenterShell from './components/AccessCenterShell';
import CreateUserWizard from './components/CreateUserWizard';
import GroupsList from './components/GroupsList';
import PolicyExplorer from './components/PolicyExplorer';
import RolesList from './components/RolesList';
import UsersList from './components/UsersList';

const UserProfile = lazy(() => import('./components/UserProfile'));
const UserAccessEditor = lazy(() => import('./components/user-editor/UserAccessEditor'));
const UserLifecycleActions = lazy(
  () => import('./components/user-actions/UserLifecycleActions'),
);
const TombstonesList = lazy(
  () => import('./components/user-actions/TombstonesList'),
);
const TombstoneDetail = lazy(
  () => import('./components/user-actions/TombstoneDetail'),
);

type ViewMode =
  | 'users-list'
  | 'users-create'
  | 'users-profile'
  | 'users-edit'
  | 'tombstones-list'
  | 'tombstone-detail'
  | 'roles'
  | 'groups'
  | 'policies';
const ACCESS_SECTIONS = new Set(['users', 'groups', 'roles', 'policies']);

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

function ResourceLoading({ label }: { readonly label: string }) {
  return <ContentSkeleton label={label} variant="workspace" />;
}

function ResourceError({
  error,
  retry,
}: {
  readonly error: VaultError;
  readonly retry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div role="alert" className="max-w-md rounded-md border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
        <p className="font-semibold">This access-control resource could not be loaded</p>
        <p className="mt-1 text-xs leading-5">{error.message}</p>
        <button type="button" onClick={retry} className="mt-2 text-xs font-medium underline">Retry</button>
      </div>
    </div>
  );
}

function renderQuery<T>(
  state: VaultQueryState<T>,
  loadingLabel: string,
  retry: () => void,
  render: (data: T) => ReactNode,
): ReactNode {
  if (state.status === 'error' && state.data === undefined) {
    return <ResourceError error={state.error} retry={retry} />;
  }
  if ((state.status === 'loading' || state.status === 'idle') && state.data === undefined) {
    return <ResourceLoading label={loadingLabel} />;
  }
  return state.data === undefined ? null : render(state.data);
}

export default function AccessControlPage() {
  const navigate = useNavigate();
  const params = useParams<{
    section?: string;
    username?: string;
    action?: string;
    entityId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const { mountsState } = useAuthenticatedShell();
  const vault = useVaultSession();
  const session = vault.session!;
  const accessGateway = useAccessControlGateway();
  const [creatingUser, setCreatingUser] = useState(false);
  const [selectedPolicyName, setSelectedPolicyName] = useState<string>();
  const [userSearch, setUserSearch] = useState('');
  const [profileOriginUserId, setProfileOriginUserId] = useState<string>();
  const [restoreFocusUserId, setRestoreFocusUserId] = useState<string>();
  const previousProfileRequested = useRef(false);
  const activeSection = params.section && ACCESS_SECTIONS.has(params.section)
    ? params.section
    : 'users';
  const profileRequested = Boolean(params.username);
  const editingUser = profileRequested && params.action === 'edit';
  const removedIdentitiesRequested = params.section === 'removed-identities'
    || Boolean(params.entityId);
  const tombstoneDetailRequested = removedIdentitiesRequested && Boolean(params.entityId);
  const profileMount = searchParams.get('mount');
  const usersNeeded = (
    (activeSection === 'users' && !profileRequested && !removedIdentitiesRequested)
    || creatingUser
    || (profileRequested && !profileMount)
  );
  const groupsNeeded = activeSection === 'groups' || creatingUser || editingUser;
  const policiesNeeded = activeSection === 'roles'
    || activeSection === 'policies'
    || creatingUser
    || editingUser;

  const [authMountsState, refreshAuthMounts] = useAuthMounts(
    session,
    usersNeeded || profileRequested,
  );
  const userpassMounts = (authMountsState.data ?? []).filter((mount) => mount.type === 'userpass');
  const [usersState, refreshUsers] = useUserpassUsers(
    session,
    userpassMounts,
    usersNeeded && authMountsState.status === 'success',
  );
  const [groupsState, refreshGroups] = useGroups(session, groupsNeeded);
  const [tombstonesState, refreshTombstones] = useIdentityTombstones(
    session,
    removedIdentitiesRequested,
  );
  const [policyNamesState, refreshPolicyNames] = usePolicyNames(session, policiesNeeded);
  const policyCatalogState = usePolicyCatalog(
    session,
    policyNamesState.data ?? [],
    (creatingUser || profileRequested) && policyNamesState.status === 'success',
  );
  const selectedPolicyState = usePolicyRecord(
    session,
    activeSection === 'roles' || activeSection === 'policies'
      ? selectedPolicyName
      : undefined,
  );
  const baseProfileUser = params.username
    ? usersState.data?.users.find((user) => (
      user.username === params.username
      && (!profileMount || user.mount === profileMount)
    ))
    : undefined;
  const profileAuthMount = profileMount
    ? userpassMounts.find((mount) => mount.path === profileMount)
    : undefined;
  const profileAccount = useMemo<UserAccessAccountRef | undefined>(() => {
    if (!params.username) return undefined;
    if (profileMount && profileAuthMount) {
      return {
        username: params.username,
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
  }, [baseProfileUser, params.username, profileAuthMount, profileMount]);
  const profileReport = useUserAccessReport(
    session,
    profileRequested && !editingUser ? profileAccount : undefined,
    (mountsState.data ?? []).map((mount) => mount.path),
  );

  const viewMode: ViewMode = creatingUser
    ? 'users-create'
    : tombstoneDetailRequested
      ? 'tombstone-detail'
      : removedIdentitiesRequested
        ? 'tombstones-list'
        : editingUser
          ? 'users-edit'
          : params.username
            ? 'users-profile'
            : activeSection === 'groups'
              ? 'groups'
              : activeSection === 'roles'
                ? 'roles'
                : activeSection === 'policies'
                  ? 'policies'
                  : 'users-list';

  useEffect(() => {
    if (!params.section && !params.username && !params.entityId) {
      navigate('/access-control/users', { replace: true });
    }
  }, [navigate, params.entityId, params.section, params.username]);

  useEffect(() => {
    setSelectedPolicyName(undefined);
  }, [activeSection]);

  useEffect(() => {
    if (
      previousProfileRequested.current
      && !profileRequested
      && activeSection === 'users'
      && profileOriginUserId
    ) {
      setRestoreFocusUserId(profileOriginUserId);
    }
    previousProfileRequested.current = profileRequested;
  }, [activeSection, profileOriginUserId, profileRequested]);

  useEffect(() => {
    const error = firstQueryError([
      mountsState,
      authMountsState,
      usersState,
      groupsState,
      policyNamesState,
      policyCatalogState,
      selectedPolicyState,
      profileReport.state,
      tombstonesState,
    ]);
    if (error?.code === 'session-expired') vault.expireSession();
  }, [
    authMountsState,
    groupsState,
    mountsState,
    policyCatalogState,
    policyNamesState,
    profileReport.state,
    selectedPolicyState,
    usersState,
    tombstonesState,
    vault,
  ]);

  const policies = useMemo(() => policyCatalogState.data ?? [], [policyCatalogState.data]);
  const roles = useMemo(() => rolesFromPolicyNames(policyNamesState.data ?? []), [policyNamesState.data]);
  const managedRolePolicies = useMemo(
    () => policies.filter((policy) => (
      policy.kind === 'role'
      && policy.ownership === 'managed'
      && policy.editable
    )),
    [policies],
  );
  const managedRoleNames = useMemo(
    () => new Set(managedRolePolicies.map(({ name }) => name)),
    [managedRolePolicies],
  );
  const catalog = useMemo<CreateUserAccessCatalog>(() => ({
    groups: (groupsState.data ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      roleIds: group.policies.filter((policy) => managedRoleNames.has(policy)),
      policyNames: group.policies.filter((policy) => !managedRoleNames.has(policy)),
    })),
    roles: managedRolePolicies.map((policy) => ({
      id: policy.name,
      name: roles.find((role) => role.policyName === policy.name)?.name ?? policy.name,
      policyNames: [policy.name],
    })),
    policies: policies.map((policy) => ({
      name: policy.name,
      managed: policy.ownership === 'managed',
      rules: policy.rules,
    })),
    tree: mountRoots(mountsState.data ?? []),
  }), [groupsState.data, managedRoleNames, managedRolePolicies, mountsState.data, policies, roles]);
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
          name: roles.find((role) => role.policyName === policy.name)?.name ?? policy.name,
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
  const refreshCreateUserResources = () => {
    refreshAuthMounts();
    refreshUsers();
    refreshGroups();
    refreshPolicyNames();
  };
  const clearRestoredUserFocus = useCallback(() => {
    setRestoreFocusUserId(undefined);
  }, []);
  const usersResourceError = firstQueryError([authMountsState, usersState]);
  const profileResourceError = firstQueryError([
    authMountsState,
    ...(profileMount ? [] : [usersState]),
    profileReport.state,
  ]);
  const refreshProfileResources = () => {
    refreshAuthMounts();
    if (!profileMount) refreshUsers();
    profileReport.actions.retryAccount();
    profileReport.actions.retryIncomplete();
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <AccessCenterShell
        activeSection={activeSection}
        onSectionSelect={(section) => navigate(`/access-control/${section}`)}
      >
      {viewMode === 'users-list' && (
        usersResourceError && usersState.data === undefined
          ? <ResourceError error={usersResourceError} retry={refreshProfileResources} />
          : renderQuery(
              usersState,
              'Loading userpass accounts…',
              refreshUsers,
              (result) => (
                <UsersList
                  users={result.users}
                  warnings={result.warnings}
                  search={userSearch}
                  onSearchChange={setUserSearch}
                  restoreFocusUserId={restoreFocusUserId}
                  onFocusRestored={clearRestoredUserFocus}
                  onCreateUser={() => setCreatingUser(true)}
                  onShowRemovedIdentities={() => navigate('/access-control/removed-identities')}
                  onViewUser={(user: AccessControlUserRecord) => {
                    setProfileOriginUserId(user.id);
                    navigate({
                      pathname: `/access-control/users/${encodeURIComponent(user.username)}`,
                      search: new URLSearchParams({ mount: user.mount }).toString(),
                    });
                  }}
                  onRefresh={refreshUsers}
                />
              ),
            )
      )}
      {viewMode === 'groups' && renderQuery(
        groupsState,
        'Loading identity groups…',
        refreshGroups,
        (groups) => <GroupsList groups={groups} />,
      )}
      {viewMode === 'roles' && renderQuery(
        policyNamesState,
        'Loading role names…',
        refreshPolicyNames,
        (names) => (
          <RolesList
            roles={rolesFromPolicyNames(names)}
            selectedName={selectedPolicyName}
            selectedPolicy={selectedPolicyState}
            onSelect={setSelectedPolicyName}
          />
        ),
      )}
      {viewMode === 'policies' && renderQuery(
        policyNamesState,
        'Loading policy names…',
        refreshPolicyNames,
        (names) => (
          <PolicyExplorer
            policyNames={names}
            selectedName={selectedPolicyName}
            selectedPolicy={selectedPolicyState}
            onSelect={setSelectedPolicyName}
          />
        ),
      )}
      {viewMode === 'users-create' && (
        snapshot ? (
          <CreateUserWizard
            catalog={catalog}
            snapshot={snapshot}
            gateway={accessGateway}
            session={session}
            lazyKvTree
            onSessionExpired={vault.expireSession}
            onDone={() => {
              refreshCreateUserResources();
              setCreatingUser(false);
              navigate('/access-control/users');
            }}
            onCancel={() => setCreatingUser(false)}
          />
        ) : firstQueryError([authMountsState, usersState, groupsState, policyNamesState, policyCatalogState]) ? (
          <ResourceError
            error={firstQueryError([authMountsState, usersState, groupsState, policyNamesState, policyCatalogState])!}
            retry={refreshCreateUserResources}
          />
        ) : (
          <ResourceLoading label="Loading the user access catalog…" />
        )
      )}
      {viewMode === 'users-profile' && (
        profileResourceError ? (
          <ResourceError error={profileResourceError} retry={refreshProfileResources} />
        ) : (
          (
            (profileMount && authMountsState.status === 'success' && !profileAuthMount)
            || (!profileMount && usersState.status === 'success' && !baseProfileUser)
            || profileReport.state.data?.kind === 'not-found'
          )
        ) ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <i className="ri-user-unfollow-line text-2xl text-foreground-300" aria-hidden="true" />
            <p className="mt-2 text-sm text-foreground-700">User not found</p>
            <button type="button" onClick={() => navigate('/access-control/users')} className="mt-2 text-xs font-medium text-primary-600">Back to users</button>
          </div>
        ) : profileReport.state.data?.kind === 'report' ? (
          <Suspense fallback={<ResourceLoading label="Preparing the access matrix…" />}>
            <UserProfile
              resource={profileReport.state.data}
              actions={profileReport.actions}
              onBack={() => navigate('/access-control/users')}
              onEdit={() => navigate({
                pathname: `/access-control/users/${encodeURIComponent(
                  profileAccount!.username,
                )}/edit`,
                search: new URLSearchParams({
                  mount: profileAccount!.mount,
                }).toString(),
              })}
              lifecycleActions={profileAccount && (
                <Suspense fallback={null}>
                  <UserLifecycleActions
                    reference={profileAccount}
                    gateway={accessGateway}
                    session={session}
                    onSessionExpired={vault.expireSession}
                    onChanged={refreshProfileResources}
                    onRemoved={(entityId) => navigate(
                      entityId
                        ? `/access-control/removed-identities/${encodeURIComponent(entityId)}`
                        : '/access-control/users',
                    )}
                  />
                </Suspense>
              )}
            />
          </Suspense>
        ) : <ResourceLoading label="Loading the user access report…" />
      )}
      {viewMode === 'users-edit' && (
        !profileAccount ? (
          <ResourceLoading label="Resolving the userpass account…" />
        ) : firstQueryError([
          authMountsState,
          groupsState,
          policyNamesState,
          policyCatalogState,
        ]) ? (
          <ResourceError
            error={firstQueryError([
              authMountsState,
              groupsState,
              policyNamesState,
              policyCatalogState,
            ])!}
            retry={refreshCreateUserResources}
          />
        ) : (
          <Suspense fallback={<ResourceLoading label="Preparing the user access editor…" />}>
            <UserAccessEditor
              reference={profileAccount}
              catalog={catalog}
              gateway={accessGateway}
              session={session}
              onSessionExpired={vault.expireSession}
              onClose={() => navigate({
                pathname: `/access-control/users/${encodeURIComponent(profileAccount.username)}`,
                search: new URLSearchParams({ mount: profileAccount.mount }).toString(),
              })}
              onDone={() => navigate({
                pathname: `/access-control/users/${encodeURIComponent(profileAccount.username)}`,
                search: new URLSearchParams({ mount: profileAccount.mount }).toString(),
              })}
            />
          </Suspense>
        )
      )}
      {viewMode === 'tombstones-list' && (
        <Suspense fallback={<ResourceLoading label="Loading removed identities…" />}>
          {renderQuery(
            tombstonesState,
            'Loading removed identities…',
            refreshTombstones,
            (tombstones) => (
              <TombstonesList
                tombstones={tombstones}
                onBack={() => navigate('/access-control/users')}
                onRefresh={refreshTombstones}
                onView={(entityId) => navigate(
                  `/access-control/removed-identities/${encodeURIComponent(entityId)}`,
                )}
              />
            ),
          )}
        </Suspense>
      )}
      {viewMode === 'tombstone-detail' && params.entityId && (
        <Suspense fallback={<ResourceLoading label="Loading removed Identity…" />}>
          <TombstoneDetail
            entityId={params.entityId}
            gateway={accessGateway}
            session={session}
            onSessionExpired={vault.expireSession}
            onBack={() => navigate('/access-control/removed-identities')}
            onPurged={() => navigate('/access-control/removed-identities')}
          />
        </Suspense>
      )}
      </AccessCenterShell>
    </main>
  );
}
