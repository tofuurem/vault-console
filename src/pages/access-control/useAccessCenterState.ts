import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  hasAccessCenterTarget,
  resolveAccessCenterRoute,
  type AccessCenterParams,
} from './page-route';

export function useAccessCenterState() {
  const navigate = useNavigate();
  const params = useParams<Record<keyof AccessCenterParams, string>>();
  const [searchParams] = useSearchParams();
  const [creatingUser, setCreatingUser] = useState(false);
  const [selectedPolicyName, setSelectedPolicyName] = useState<string>();
  const [userSearch, setUserSearch] = useState('');
  const [profileOriginUserId, setProfileOriginUserId] = useState<string>();
  const [restoreFocusUserId, setRestoreFocusUserId] = useState<string>();
  const [restoreFocusGroupId, setRestoreFocusGroupId] = useState<string>();
  const [restoreFocusRoleName, setRestoreFocusRoleName] = useState<string>();
  const previousProfileRequested = useRef(false);
  const route = resolveAccessCenterRoute(params, searchParams.get('mount'), creatingUser);
  const { activeSection, profileRequested } = route;

  useEffect(() => {
    if (!hasAccessCenterTarget({
      section: params.section,
      username: params.username,
      entityId: params.entityId,
      groupId: params.groupId,
      roleName: params.roleName,
    })) {
      navigate('/access-control/users', { replace: true });
    }
  }, [
    navigate,
    params.entityId,
    params.groupId,
    params.roleName,
    params.section,
    params.username,
  ]);

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

  const clearRestoredUserFocus = useCallback(() => {
    setRestoreFocusUserId(undefined);
  }, []);

  return {
    route,
    ui: {
      setCreatingUser,
      selectedPolicyName,
      setSelectedPolicyName,
      userSearch,
      setUserSearch,
      setProfileOriginUserId,
      restoreFocusUserId,
      clearRestoredUserFocus,
      restoreFocusGroupId,
      setRestoreFocusGroupId,
      restoreFocusRoleName,
      setRestoreFocusRoleName,
    },
  };
}

export type AccessCenterUiState = ReturnType<typeof useAccessCenterState>['ui'];
