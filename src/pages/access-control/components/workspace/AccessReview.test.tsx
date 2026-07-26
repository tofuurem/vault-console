import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ChangePlan } from '@/domain/access-control/lifecycle/model';
import AccessReview from './AccessReview';

const plan: ChangePlan = {
  id: 'role-update',
  resourceKind: 'role',
  resourceId: 'vc-role-owner',
  baselineFingerprint: 'v1-current',
  visibility: { complete: true, reasons: [] },
  permissionDiff: {
    added: [{ pattern: 'secret/destroy/*', capability: 'update' }],
    removed: [{ pattern: 'secret/data/legacy/*', capability: 'read' }],
  },
  operations: [{
    id: 'write-policy',
    kind: 'write-policy',
    label: 'Update managed role policy',
    dependsOn: [],
    requirements: [{
      path: 'sys/policies/acl/vc-role-owner',
      anyOf: ['update'],
    }],
    effectTiming: 'next-request',
    risk: 'typed-confirmation',
    policy: { name: 'vc-role-owner', policy: 'body' },
    created: false,
  }],
  confirmation: {
    required: true,
    value: 'vc-role-owner',
    reasons: ['The plan grants permanent destroy access.'],
  },
};

describe('AccessReview', () => {
  it('shows permission, timing, capability, and typed-confirmation context', async () => {
    const user = userEvent.setup();
    const onConfirmationChange = vi.fn();
    render(
      <AccessReview
        plan={plan}
        confirmation=""
        onConfirmationChange={onConfirmationChange}
      />,
    );

    expect(screen.getByText('Live on the next request')).toBeVisible();
    expect(screen.getByText('secret/destroy/*')).toBeVisible();
    expect(screen.getByText('sys/policies/acl/vc-role-owner')).toBeVisible();
    expect(screen.getByText('The plan grants permanent destroy access.')).toBeVisible();
    await user.type(screen.getByLabelText(/Type vc-role-owner/), 'vc-role-owner');
    expect(onConfirmationChange).toHaveBeenCalled();
  });

  it('announces partial visibility as a blocking review state', () => {
    render(
      <AccessReview
        plan={{
          ...plan,
          visibility: {
            complete: false,
            reasons: ['Groups are unreadable.'],
          },
        }}
        confirmation=""
        onConfirmationChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Incomplete access picture');
    expect(screen.getByRole('alert')).toHaveTextContent('Groups are unreadable.');
  });
});
