import type { ReactNode } from 'react';

import type { VaultQueryState } from '@/application/vault/useKvExplorerData';
import type { AccessCenterRoute } from '../page-route';
import type { AccessCenterData } from '../useAccessCenterData';
import type { AccessCenterUiState } from '../useAccessCenterState';
import { ResourceError, ResourceLoading } from './AccessCenterResource';

export interface AccessCenterViewProps {
  readonly route: AccessCenterRoute;
  readonly ui: AccessCenterUiState;
  readonly data: AccessCenterData;
}

export function renderQuery<T>(
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

// Unlike renderQuery, the policy catalog gates on success: stale data never renders.
export function renderPolicyCatalog(
  data: AccessCenterData,
  loadingLabel: string,
  render: (policies: NonNullable<AccessCenterData['policyCatalogState']['data']>) => ReactNode,
): ReactNode {
  const state = data.policyCatalogState;
  if (state.status === 'error') {
    return (
      <ResourceError
        error={state.error}
        retry={() => { void data.refreshPolicyResources(); }}
      />
    );
  }
  if (state.status !== 'success') return <ResourceLoading label={loadingLabel} />;
  return render(state.data);
}
