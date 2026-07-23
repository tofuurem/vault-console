import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
  useUserDetails,
  useUserpassUsers,
  type AccessControlSnapshot,
  type AccessControlUserRecord,
} from '@/application/vault/useAccessControlData';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { VaultQueryState } from '@/application/vault/useKvExplorerData';
import { classifyPolicyName } from '@/domain/access-control/managed-resources';
import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import type { VaultError } from '@/domain/vault/errors';
import type { CreateUserAccessCatalog } from './components/create-user/access';
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
  return (
    <div role="status" className="flex h-full items-center justify-center">
      <div className="text-center">
        <i className="ri-loader-4-line animate-spin text-xl text-primary-500" aria-hidden="true" />
        <p className="mt-2 text-xs text-foreground-500">{label}</p>
      </div>
    </div>
  );
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
      <div role="alert" className="max-w-md rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
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
  const usersNeeded = activeSection === 'users' || creatingUser || profileRequested;
  const groupsNeeded = activeSection === 'groups' || creatingUser || profileRequested;
  const policiesNeeded = activeSection === 'roles'
    || activeSection === 'policies'
    || creatingUser
    || profileRequested;

  const [authMountsState, refreshAuthMounts] = useAuthMounts(session, usersNeeded);
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
    ? usersState.data?.users.find((user) => user.username === params.username)
    : undefined;
  const profileState = useUserDetails(
    session,
    groupsState.status === 'success' ? baseProfileUser : undefined,
    groupsState.data ?? [],
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
      profileState,
    ]);
    if (error?.code === 'session-expired') vault.expireSession();
  }, [
    authMountsState,
    groupsState,
    mountsState,
    policyCatalogState,
    policyNamesState,
    profileState,
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

  const refreshCreateUserResources = () => {
    refreshAuthMounts();
    refreshUsers();
    refreshGroups();
    refreshPolicyNames();
  };
  const usersResourceError = firstQueryError([authMountsState, usersState]);
  const profileResourceError = firstQueryError([
    authMountsState,
    usersState,
    groupsState,
    policyNamesState,
    policyCatalogState,
    profileState,
  ]);
  const refreshProfileResources = () => {
    refreshAuthMounts();
    refreshUsers();
    refreshGroups();
    refreshPolicyNames();
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
                  onViewUser={(user: AccessControlUserRecord) => navigate(`/access-control/users/${encodeURIComponent(user.username)}`)}
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
        ) : usersState.status === 'success' && !baseProfileUser ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <i className="ri-user-unfollow-line text-2xl text-foreground-300" aria-hidden="true" />
            <p className="mt-2 text-sm text-foreground-700">User not found</p>
            <button type="button" onClick={() => navigate('/access-control/users')} className="mt-2 text-xs font-medium text-primary-600">Back to users</button>
          </div>
        ) : (
          renderQuery(
            profileState,
            'Loading identity details…',
            refreshProfileResources,
            (profileUser) => policyCatalogState.status === 'success'
              ? <UserProfile user={profileUser} catalog={catalog} onBack={() => navigate('/access-control/users')} />
              : <ResourceLoading label="Loading effective access policies…" />,
          )
        )
      )}
    </main>
  );
}
