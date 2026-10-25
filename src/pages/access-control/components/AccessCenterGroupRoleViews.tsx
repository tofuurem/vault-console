import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';

import { groupPath, rolePath } from '../page-route';
import { ResourceLoading } from './AccessCenterResource';
import {
  renderPolicyCatalog,
  type AccessCenterViewProps,
} from './render-access-resource';

const GroupDetail = lazy(
  () => import('./group-editor/GroupDetail'),
);
const GroupEditor = lazy(
  () => import('./group-editor/GroupEditor'),
);
const RoleDetail = lazy(
  () => import('./role-editor/RoleDetail'),
);
const RoleEditor = lazy(
  () => import('./role-editor/RoleEditor'),
);

export function GroupDetailView({ route, ui, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  const { groupId } = route.params;
  if (!groupId) return null;
  return renderPolicyCatalog(data, 'Loading the managed role catalog…', () => (
    <Suspense fallback={<ResourceLoading label="Loading group detail…" />}>
      <GroupDetail
        groupId={groupId}
        catalog={data.catalog}
        gateway={data.accessGateway}
        session={data.session}
        onSessionExpired={data.vault.expireSession}
        onBack={() => {
          ui.setRestoreFocusGroupId(groupId);
          navigate('/access-control/groups');
        }}
        onEdit={() => navigate(groupPath(groupId, 'edit'))}
        onDeleted={() => navigate('/access-control/groups')}
      />
    </Suspense>
  ));
}

export function GroupEditView({ route, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  const { groupId } = route.params;
  const { creatingGroup } = route;
  if (!groupId) return null;
  return renderPolicyCatalog(data, 'Loading the group access catalog…', () => (
    <Suspense fallback={<ResourceLoading label="Preparing the group workspace…" />}>
      <GroupEditor
        groupId={creatingGroup ? undefined : groupId}
        catalog={data.catalog}
        gateway={data.accessGateway}
        session={data.session}
        onSessionExpired={data.vault.expireSession}
        onClose={() => navigate(
          creatingGroup
            ? '/access-control/groups'
            : groupPath(groupId),
        )}
        onDone={(savedGroupId) => {
          navigate(groupPath(savedGroupId));
        }}
      />
    </Suspense>
  ));
}

export function RoleDetailView({ route, ui, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  const { roleName } = route.params;
  if (!roleName) return null;
  return renderPolicyCatalog(data, 'Loading the role catalog…', () => (
    <Suspense fallback={<ResourceLoading label="Loading role detail…" />}>
      <RoleDetail
        policyName={roleName}
        catalog={data.catalog}
        gateway={data.accessGateway}
        session={data.session}
        onSessionExpired={data.vault.expireSession}
        onBack={() => {
          ui.setRestoreFocusRoleName(roleName);
          navigate('/access-control/roles');
        }}
        onEdit={() => navigate(rolePath(roleName, 'edit'))}
        onAdopt={() => navigate(rolePath(roleName, 'adopt'))}
        onDeleted={() => navigate('/access-control/roles')}
      />
    </Suspense>
  ));
}

export function RoleEditView({ route, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  const { roleName } = route.params;
  const { creatingRole } = route;
  if (!roleName) return null;
  return renderPolicyCatalog(data, 'Loading the role access catalog…', () => (
    <Suspense fallback={<ResourceLoading label="Preparing the role workspace…" />}>
      <RoleEditor
        mode={creatingRole ? 'create' : route.roleMode}
        policyName={creatingRole ? undefined : roleName}
        catalog={data.catalog}
        gateway={data.accessGateway}
        session={data.session}
        onSessionExpired={data.vault.expireSession}
        onClose={() => navigate(
          creatingRole
            ? '/access-control/roles'
            : rolePath(roleName),
        )}
        onDone={(policyName) => {
          navigate(rolePath(policyName));
        }}
      />
    </Suspense>
  ));
}
