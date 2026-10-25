import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AccessControlUserRecord } from '@/application/vault/useAccessControlData';
import {
  groupPath,
  removedIdentityPath,
  rolePath,
  userProfileLocation,
} from '../page-route';
import { ResourceError, ResourceLoading } from './AccessCenterResource';
import GroupsList from './GroupsList';
import PolicyExplorer from './PolicyExplorer';
import {
  renderPolicyCatalog,
  renderQuery,
  type AccessCenterViewProps,
} from './render-access-resource';
import RolesList from './RolesList';
import UsersList from './UsersList';

const TombstonesList = lazy(
  () => import('./user-actions/TombstonesList'),
);

export function UsersListView({ ui, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  if (data.usersResourceError && data.usersState.data === undefined) {
    return <ResourceError error={data.usersResourceError} retry={data.refreshUserListResources} />;
  }
  return renderQuery(
    data.usersState,
    'Loading userpass accounts…',
    data.refreshUsers,
    (result) => (
      <UsersList
        users={result.users}
        warnings={result.warnings}
        search={ui.userSearch}
        onSearchChange={ui.setUserSearch}
        restoreFocusUserId={ui.restoreFocusUserId}
        onFocusRestored={ui.clearRestoredUserFocus}
        onCreateUser={() => ui.setCreatingUser(true)}
        onShowRemovedIdentities={() => navigate('/access-control/removed-identities')}
        onViewUser={(user: AccessControlUserRecord) => {
          ui.setProfileOriginUserId(user.id);
          navigate(userProfileLocation(user));
        }}
        onRefresh={data.refreshUsers}
      />
    ),
  );
}

export function GroupsListView({ ui, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  return renderQuery(
    data.groupsState,
    'Loading identity groups…',
    data.refreshGroups,
    (groups) => (
      <GroupsList
        groups={groups}
        onCreate={() => navigate('/access-control/groups/new')}
        onView={(groupId) => {
          navigate(groupPath(groupId));
        }}
        onRefresh={data.refreshGroups}
        restoreFocusGroupId={ui.restoreFocusGroupId}
        onFocusRestored={() => ui.setRestoreFocusGroupId(undefined)}
      />
    ),
  );
}

export function RolesListView({ ui, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  return renderPolicyCatalog(data, 'Loading role policies…', (policies) => (
    <RolesList
      roles={policies.filter(({ kind }) => kind === 'role')}
      onCreate={() => navigate('/access-control/roles/new')}
      onView={(policyName) => {
        navigate(rolePath(policyName));
      }}
      onRefresh={() => { void data.refreshPolicyResources(); }}
      restoreFocusRoleName={ui.restoreFocusRoleName}
      onFocusRestored={() => ui.setRestoreFocusRoleName(undefined)}
    />
  ));
}

export function PoliciesView({ ui, data }: AccessCenterViewProps) {
  return renderQuery(
    data.policyNamesState,
    'Loading policy names…',
    () => { void data.refreshPolicyResources(); },
    (names) => (
      <PolicyExplorer
        policyNames={names}
        selectedName={ui.selectedPolicyName}
        selectedPolicy={data.selectedPolicyState}
        onSelect={ui.setSelectedPolicyName}
        onRefresh={() => { void data.refreshPolicyResources(); }}
      />
    ),
  );
}

export function TombstonesListView({ data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<ResourceLoading label="Loading removed identities…" />}>
      {renderQuery(
        data.tombstonesState,
        'Loading removed identities…',
        data.refreshTombstones,
        (tombstones) => (
          <TombstonesList
            tombstones={tombstones}
            onBack={() => navigate('/access-control/users')}
            onRefresh={data.refreshTombstones}
            onView={(entityId) => navigate(removedIdentityPath(entityId))}
          />
        ),
      )}
    </Suspense>
  );
}
