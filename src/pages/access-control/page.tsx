import {
  useEffect,
  useMemo,
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
import { classifyPolicyName } from '@/domain/access-control/managed-resources';
import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import type { VaultError } from '@/domain/vault/errors';
import type { CreateUserAccessCatalog } from './components/create-user/access';
import AccessCenterShell from './components/AccessCenterShell';
import CreateUserWizard from './components/CreateUserWizard';
import GroupsList from './components/GroupsList';
import PolicyExplorer from './components/PolicyExplorer';
import RolesList from './components/RolesList';
import UserProfile from './components/UserProfile';
import UsersList from './components/UsersList';

type ViewMode = 'users-list' | 'users-create' | 'users-profile' | 'roles' | 'groups' | 'policies';
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
  const params = useParams<{ section?: string; username?: string }>();
  const [searchParams] = useSearchParams();
  const { mountsState } = useAuthenticatedShell();
  const vault = useVaultSession();
  const session = vault.session!;
  const accessGateway = useAccessControlGateway();
  const [creatingUser, setCreatingUser] = useState(false);
  const [selectedPolicyName, setSelectedPolicyName] = useState<string>();
  const activeSection = params.section && ACCESS_SECTIONS.has(params.section)
    ? params.section
    : 'users';
  const profileRequested = Boolean(params.username);
  const profileMount = searchParams.get('mount');
  const usersNeeded = (
    (activeSection === 'users' && !profileRequested)
    || creatingUser
    || (profileRequested && !profileMount)
  );
  const groupsNeeded = activeSection === 'groups' || creatingUser;
  const policiesNeeded = activeSection === 'roles'
    || activeSection === 'policies'
    || creatingUser;

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
    profileRequested ? profileAccount : undefined,
    (mountsState.data ?? []).map((mount) => mount.path),
  );

  const viewMode: ViewMode = creatingUser
    ? 'users-create'
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
    if (!params.section && !params.username) {
      navigate('/access-control/users', { replace: true });
    }
  }, [navigate, params.section, params.username]);

  useEffect(() => {
    setSelectedPolicyName(undefined);
  }, [activeSection]);

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
    vault,
  ]);

  const policies = useMemo(() => policyCatalogState.data ?? [], [policyCatalogState.data]);
  const roles = useMemo(() => rolesFromPolicyNames(policyNamesState.data ?? []), [policyNamesState.data]);
  const catalog = useMemo<CreateUserAccessCatalog>(() => ({
    groups: (groupsState.data ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      roleIds: group.policies.filter((policy) => classifyPolicyName(policy) === 'role'),
      policyNames: group.policies.filter((policy) => classifyPolicyName(policy) !== 'role'),
    })),
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      policyNames: [role.policyName],
    })),
    policies: policies.map((policy) => ({
      name: policy.name,
      managed: policy.kind !== 'external',
      rules: policy.rules,
    })),
    tree: mountRoots(mountsState.data ?? []),
  }), [groupsState.data, mountsState.data, policies, roles]);
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
  const profileCatalog = useMemo<CreateUserAccessCatalog | undefined>(() => {
    const resource = profileReport.state.data;
    if (resource?.kind !== 'report') return undefined;
    const reportPolicies = resource.policies.map((policy) => ({
      name: policy.name,
      managed: policy.kind !== 'external',
      rules: policy.rules ?? null,
    }));
    return {
      groups: resource.user.groups.map((group) => ({
        id: group.id,
        name: group.name,
        roleIds: group.policies.filter((policy) => classifyPolicyName(policy) === 'role'),
        policyNames: group.policies.filter((policy) => classifyPolicyName(policy) !== 'role'),
      })),
      roles: resource.policies
        .filter((policy) => policy.kind === 'role')
        .map((policy) => ({
          id: policy.name,
          name: rolesFromPolicyNames([policy.name])[0]?.name ?? policy.name,
          policyNames: [policy.name],
        })),
      policies: reportPolicies,
      tree: mountRoots(mountsState.data ?? []),
    };
  }, [mountsState.data, profileReport.state.data]);

  const refreshCreateUserResources = () => {
    refreshAuthMounts();
    refreshUsers();
    refreshGroups();
    refreshPolicyNames();
  };
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
                  onCreateUser={() => setCreatingUser(true)}
                  onViewUser={(user: AccessControlUserRecord) => navigate({
                    pathname: `/access-control/users/${encodeURIComponent(user.username)}`,
                    search: new URLSearchParams({ mount: user.mount }).toString(),
                  })}
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
        ) : profileReport.state.data?.kind === 'report' && profileCatalog ? (
          <UserProfile
            user={profileReport.state.data.user}
            catalog={profileCatalog}
            onBack={() => navigate('/access-control/users')}
          />
        ) : <ResourceLoading label="Loading the user access report…" />
      )}
      </AccessCenterShell>
    </main>
  );
}
