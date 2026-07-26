import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  UserAccessReportActions,
  UserAccessReportResource,
} from '@/application/vault/useUserAccessReport';
import { buildUserAccessReport } from '@/domain/access-control/user-access-report';
import UserProfile from './UserProfile';

const group = {
  id: 'platform-team',
  name: 'platform-team',
  policies: ['vc-role-platform-readers'],
  memberEntityIds: ['entity-alice'],
  memberGroupIds: [],
  metadata: {},
};

function resource(): UserAccessReportResource {
  const policies = [
    {
      name: 'vc-role-platform-readers',
      kind: 'role' as const,
      status: 'resolved' as const,
      hcl: 'path "applications/data/platform/*" { capabilities = ["read"] }',
      rules: [{
        pattern: 'applications/data/platform/*',
        capabilities: ['read' as const],
      }],
    },
    {
      name: 'legacy-root',
      kind: 'external' as const,
      status: 'external' as const,
      hcl: 'path "<script>alert(1)</script>" { capabilities = ["read"] }',
    },
    {
      name: 'vc-user-missing',
      kind: 'user-direct' as const,
      status: 'denied' as const,
    },
  ];
  const report = buildUserAccessReport({
    account: {
      username: 'alice',
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
    },
    mounts: ['applications'],
    identity: {
      status: 'available',
      entity: {
        id: 'entity-alice',
        displayName: 'Alice Operator',
        disabled: false,
        aliasId: 'alias-alice',
      },
    },
    groups: { status: 'available' },
    attachments: [
      {
        policyName: 'vc-role-platform-readers',
        origin: {
          kind: 'group',
          groupId: group.id,
          groupName: group.name,
        },
      },
      { policyName: 'legacy-root', origin: { kind: 'direct' } },
      { policyName: 'vc-user-missing', origin: { kind: 'direct' } },
    ],
    policies,
  });
  return {
    kind: 'report',
    user: {
      id: 'userpass:alice',
      username: 'alice',
      displayName: 'Alice Operator',
      mount: 'userpass',
      mountAccessor: 'auth_userpass_123',
      tokenPolicies: ['legacy-root'],
      entity: {
        id: 'entity-alice',
        name: 'Alice Operator',
        disabled: false,
        policies: ['legacy-root'],
        groupIds: [group.id],
        aliases: [{
          id: 'alias-alice',
          name: 'alice',
          canonicalId: 'entity-alice',
          mountAccessor: 'auth_userpass_123',
        }],
      },
      groups: [group],
      directRolePolicyNames: [],
      directPolicyNames: ['vc-user-missing'],
      externalPolicyNames: ['legacy-root'],
    },
    report,
    policies,
    identity: {
      state: {
        status: 'available',
        entity: {
          id: 'entity-alice',
          displayName: 'Alice Operator',
          disabled: false,
          aliasId: 'alias-alice',
        },
      },
      entity: {
        id: 'entity-alice',
        name: 'Alice Operator',
        disabled: false,
        policies: ['legacy-root'],
        groupIds: [group.id],
        aliases: [{
          id: 'alias-alice',
          name: 'alice',
          canonicalId: 'entity-alice',
          mountAccessor: 'auth_userpass_123',
        }],
      },
    },
    groups: {
      state: { status: 'available' },
      groups: [group],
    },
    refreshing: {
      account: false,
      identity: false,
      groups: false,
      policies: [],
    },
  };
}

function actions(): UserAccessReportActions {
  return {
    retryAccount: vi.fn(),
    retryIdentity: vi.fn(),
    retryGroups: vi.fn(),
    retryPolicy: vi.fn(),
    retryIncomplete: vi.fn(),
  };
}

describe('UserProfile', () => {
  it('focuses the identity heading and explains report completeness without color alone', () => {
    render(<UserProfile resource={resource()} actions={actions()} onBack={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Alice Operator' })).toHaveFocus();
    expect(screen.getByText('Limited by policy')).toBeVisible();
    expect(screen.getByText(/current operator token blocks/i)).toBeVisible();
    expect(screen.getByText('Identity linked')).toBeVisible();
    expect(screen.getAllByText('platform-team')[0]).toBeVisible();
  });

  it('shows provenance, retries one failed policy, and keeps external HCL inert', async () => {
    const user = userEvent.setup();
    const reportActions = actions();
    const view = render(
      <UserProfile resource={resource()} actions={reportActions} onBack={vi.fn()} />,
    );

    expect(screen.getByText(
      'platform-team → Platform Readers → vc-role-platform-readers',
    )).toBeVisible();
    await user.click(screen.getByRole('button', {
      name: 'Retry policy vc-user-missing',
    }));
    expect(reportActions.retryPolicy).toHaveBeenCalledWith('vc-user-missing');

    await user.click(screen.getByText('View raw HCL'));
    expect(screen.getByText(
      'path "<script>alert(1)</script>" { capabilities = ["read"] }',
    )).toBeVisible();
    expect(view.container.querySelector('script')).toBeNull();
  });

  it('keeps back navigation and technical identity details keyboard reachable', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<UserProfile resource={resource()} actions={actions()} onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Back to users' }));
    expect(onBack).toHaveBeenCalledOnce();
    await user.click(screen.getByText('Technical identity'));
    expect(screen.getByText('entity-alice')).toBeVisible();
    expect(screen.getByText('alias-alice')).toBeVisible();
  });
});
