import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';

import { firstQueryError } from '@/application/vault/useAccessControlData';
import {
  removedIdentityPath,
  userEditLocation,
  userProfileLocation,
} from '../page-route';
import { ResourceError, ResourceLoading } from './AccessCenterResource';
import CreateUserWizard from './CreateUserWizard';
import type { AccessCenterViewProps } from './render-access-resource';

const UserProfile = lazy(() => import('./UserProfile'));
const UserAccessEditor = lazy(() => import('./user-editor/UserAccessEditor'));
const UserLifecycleActions = lazy(
  () => import('./user-actions/UserLifecycleActions'),
);
const TombstoneDetail = lazy(
  () => import('./user-actions/TombstoneDetail'),
);

export function CreateUserView({ ui, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  if (data.snapshot) {
    return (
      <CreateUserWizard
        catalog={data.catalog}
        snapshot={data.snapshot}
        gateway={data.accessGateway}
        session={data.session}
        lazyKvTree
        onSessionExpired={data.vault.expireSession}
        onDone={() => {
          data.refreshCreateUserResources();
          ui.setCreatingUser(false);
          navigate('/access-control/users');
        }}
        onCancel={() => ui.setCreatingUser(false)}
      />
    );
  }
  const error = firstQueryError([
    data.authMountsState,
    data.usersState,
    data.groupsState,
    data.policyNamesState,
    data.policyCatalogState,
  ]);
  return error
    ? <ResourceError error={error} retry={data.refreshCreateUserResources} />
    : <ResourceLoading label="Loading the user access catalog…" />;
}

function UserNotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <i className="ri-user-unfollow-line text-2xl text-foreground-300" aria-hidden="true" />
      <p className="mt-2 text-sm text-foreground-700">User not found</p>
      <button type="button" onClick={() => navigate('/access-control/users')} className="mt-2 text-xs font-medium text-primary-600">Back to users</button>
    </div>
  );
}

export function UserProfileView({ data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  const { profileAccount, profileReport } = data;
  const report = profileReport.state.data;
  if (data.profileResourceError) {
    return <ResourceError error={data.profileResourceError} retry={data.refreshProfileResources} />;
  }
  if (data.profileNotFound) return <UserNotFound />;
  if (report?.kind !== 'report') {
    return <ResourceLoading label="Loading the user access report…" />;
  }
  return (
    <Suspense fallback={<ResourceLoading label="Preparing the access matrix…" />}>
      <UserProfile
        resource={report}
        actions={profileReport.actions}
        onBack={() => navigate('/access-control/users')}
        onEdit={() => navigate(userEditLocation(profileAccount!))}
        lifecycleActions={profileAccount && (
          <Suspense fallback={null}>
            <UserLifecycleActions
              reference={profileAccount}
              gateway={data.accessGateway}
              session={data.session}
              onSessionExpired={data.vault.expireSession}
              onChanged={data.refreshProfileResources}
              onRemoved={(entityId) => navigate(
                entityId
                  ? removedIdentityPath(entityId)
                  : '/access-control/users',
              )}
            />
          </Suspense>
        )}
      />
    </Suspense>
  );
}

export function UserEditView({ data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  const { profileAccount } = data;
  if (!profileAccount) {
    return <ResourceLoading label="Resolving the userpass account…" />;
  }
  const error = firstQueryError([
    data.authMountsState,
    data.groupsState,
    data.policyNamesState,
    data.policyCatalogState,
  ]);
  if (error) {
    return <ResourceError error={error} retry={data.refreshCreateUserResources} />;
  }
  return (
    <Suspense fallback={<ResourceLoading label="Preparing the user access editor…" />}>
      <UserAccessEditor
        reference={profileAccount}
        catalog={data.catalog}
        gateway={data.accessGateway}
        session={data.session}
        onSessionExpired={data.vault.expireSession}
        onClose={() => navigate(userProfileLocation(profileAccount))}
        onDone={() => navigate(userProfileLocation(profileAccount))}
      />
    </Suspense>
  );
}

export function TombstoneDetailView({ route, data }: AccessCenterViewProps) {
  const navigate = useNavigate();
  const { entityId } = route.params;
  if (!entityId) return null;
  return (
    <Suspense fallback={<ResourceLoading label="Loading removed Identity…" />}>
      <TombstoneDetail
        entityId={entityId}
        gateway={data.accessGateway}
        session={data.session}
        onSessionExpired={data.vault.expireSession}
        onBack={() => navigate('/access-control/removed-identities')}
        onPurged={() => navigate('/access-control/removed-identities')}
      />
    </Suspense>
  );
}
