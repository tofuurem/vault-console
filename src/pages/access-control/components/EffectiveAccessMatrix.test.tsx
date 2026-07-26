import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  KvSearchContext,
  type KvSearchContextValue,
  type KvSearchMountState,
} from '@/application/vault/search/KvSearchContext';
import type { UserAccessReportResource } from '@/application/vault/useUserAccessReport';
import { buildUserAccessReport } from '@/domain/access-control/user-access-report';
import EffectiveAccessMatrix from './EffectiveAccessMatrix';

const managedPolicy = {
  name: 'vc-user-alice',
  kind: 'user-direct' as const,
  status: 'resolved' as const,
  rules: [
    { pattern: 'applications/data/shared', capabilities: ['read' as const] },
    { pattern: 'applications/metadata/shared', capabilities: ['read' as const] },
    { pattern: 'applications/metadata', capabilities: ['list' as const] },
  ],
};

function resource(): UserAccessReportResource {
  const report = buildUserAccessReport({
    account: {
      username: 'alice',
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
    },
    mounts: ['applications', 'infrastructure'],
    identity: { status: 'absent' },
    groups: { status: 'not-applicable' },
    attachments: [{
      policyName: managedPolicy.name,
      origin: { kind: 'direct' },
    }],
    policies: [managedPolicy],
  });
  return {
    kind: 'report',
    user: {
      id: 'userpass:alice',
      username: 'alice',
      displayName: 'alice',
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      tokenPolicies: [managedPolicy.name],
      account: {
        username: 'alice',
        mount: 'userpass',
        tokenPolicies: [managedPolicy.name],
      },
      entity: null,
      identityOwnership: 'external',
      groups: [],
      directRolePolicyNames: [],
      directPolicyNames: [managedPolicy.name],
      externalPolicyNames: [],
    },
    report,
    mounts: ['applications', 'infrastructure'],
    policies: [managedPolicy],
    identity: {
      state: { status: 'absent' },
      entity: null,
    },
    groups: {
      state: { status: 'not-applicable' },
      groups: [],
    },
    refreshing: {
      account: false,
      identity: false,
      groups: false,
      policies: [],
    },
  };
}

function emptyState(mount: string): KvSearchMountState {
  return {
    mount,
    status: 'idle',
    entries: [],
    pendingPrefixes: [],
    visitedPrefixes: [],
    inaccessiblePrefixes: [],
    failedPrefixes: [],
    totalListRequests: 0,
    totalScannedPrefixes: 0,
  };
}

function searchContext(
  states: Readonly<Record<string, KvSearchMountState>> = {},
): KvSearchContextValue {
  return {
    stateFor: (mount) => states[mount] ?? emptyState(mount),
    start: vi.fn(),
    continueScan: vi.fn(),
    restart: vi.fn(),
    cancel: vi.fn(),
    activateMount: vi.fn(),
    matches: vi.fn(() => []),
    clear: vi.fn(),
  };
}

function renderMatrix(context: KvSearchContextValue) {
  return render(
    <KvSearchContext.Provider value={context}>
      <EffectiveAccessMatrix resource={resource()} />
    </KvSearchContext.Provider>,
  );
}

describe('EffectiveAccessMatrix', () => {
  it('defaults to policy paths and starts metadata discovery only after explicit action', async () => {
    const user = userEvent.setup();
    const search = searchContext();
    renderMatrix(search);

    expect(screen.getByRole('button', { name: 'Policy paths' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('applications/shared')).toBeVisible();
    expect(search.start).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'All visible paths' }));
    expect(search.start).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Discover visible paths' }));
    expect(search.activateMount).toHaveBeenCalledWith('applications');
    expect(search.start).toHaveBeenCalledWith('applications');
  });

  it('adds discovered paths without dropping policy paths and explains a selected row', async () => {
    const user = userEvent.setup();
    const search = searchContext({
      applications: {
        ...emptyState('applications'),
        status: 'complete',
        entries: [{
          mount: 'applications',
          path: 'visible-only',
          name: 'visible-only',
          kind: 'secret',
        }],
        visitedPrefixes: [''],
        totalListRequests: 1,
        totalScannedPrefixes: 1,
      },
    });
    renderMatrix(search);

    await user.click(screen.getByRole('button', { name: 'All visible paths' }));
    expect(screen.getByText('applications/shared')).toBeVisible();
    expect(screen.getByText('applications/visible-only')).toBeVisible();
    const row = screen.getByRole('button', {
      name: 'Explain access to applications/visible-only',
    });
    await user.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('heading', {
      name: 'applications/visible-only',
    }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText('Search access paths'), 'shared');
    const table = screen.getByRole('table', {
      name: 'Effective KV access by logical path',
    });
    expect(within(table).getByText('applications/shared')).toBeVisible();
    expect(within(table).queryByText('applications/visible-only')).not.toBeInTheDocument();
  });

  it('keeps partial discovery unknown and supports arrow-key row selection', async () => {
    const user = userEvent.setup();
    const search = searchContext({
      applications: {
        ...emptyState('applications'),
        status: 'partial',
        entries: [{
          mount: 'applications',
          path: 'visible-only',
          name: 'visible-only',
          kind: 'secret',
        }],
        inaccessiblePrefixes: ['private/'],
        visitedPrefixes: [''],
        totalListRequests: 2,
        totalScannedPrefixes: 2,
      },
    });
    renderMatrix(search);

    await user.click(screen.getByRole('button', { name: 'All visible paths' }));
    expect(screen.getByText(/Discovery is partial/)).toBeVisible();
    const first = screen.getByRole('button', {
      name: 'Explain access to applications/shared',
    });
    first.focus();
    await user.keyboard('{ArrowDown}');
    const second = screen.getByRole('button', {
      name: 'Explain access to applications/visible-only',
    });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });
});
