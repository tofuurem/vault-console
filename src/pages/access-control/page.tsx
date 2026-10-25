import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';

import AccessCenterShell from './components/AccessCenterShell';
import {
  GroupDetailView,
  GroupEditView,
  RoleDetailView,
  RoleEditView,
} from './components/AccessCenterGroupRoleViews';
import {
  GroupsListView,
  PoliciesView,
  RolesListView,
  TombstonesListView,
  UsersListView,
} from './components/AccessCenterListViews';
import {
  CreateUserView,
  TombstoneDetailView,
  UserEditView,
  UserProfileView,
} from './components/AccessCenterUserViews';
import type { AccessCenterViewProps } from './components/render-access-resource';
import type { AccessCenterViewMode } from './page-route';
import { useAccessCenterData } from './useAccessCenterData';
import { useAccessCenterState } from './useAccessCenterState';

const VIEWS: Readonly<Record<AccessCenterViewMode, ComponentType<AccessCenterViewProps>>> = {
  'users-list': UsersListView,
  'users-create': CreateUserView,
  'users-profile': UserProfileView,
  'users-edit': UserEditView,
  'tombstones-list': TombstonesListView,
  'tombstone-detail': TombstoneDetailView,
  'groups-list': GroupsListView,
  'group-detail': GroupDetailView,
  'group-edit': GroupEditView,
  'roles-list': RolesListView,
  'role-detail': RoleDetailView,
  'role-edit': RoleEditView,
  policies: PoliciesView,
};

export default function AccessControlPage() {
  const navigate = useNavigate();
  const { route, ui } = useAccessCenterState();
  const data = useAccessCenterData(route, ui.selectedPolicyName);
  const View = VIEWS[route.viewMode];

  return (
    <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <AccessCenterShell
        activeSection={route.activeSection}
        onSectionSelect={(section) => navigate(`/access-control/${section}`)}
      >
        <View route={route} ui={ui} data={data} />
      </AccessCenterShell>
    </main>
  );
}
