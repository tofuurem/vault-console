import {
  render,
  screen,
} from '@testing-library/react';
import {
  describe,
  expect,
  it,
} from 'vitest';

import PlanExecutionNotice from './PlanExecutionNotice';

describe('PlanExecutionNotice', () => {
  it('explains the exact capability that blocked preflight', () => {
    render(
      <PlanExecutionNotice
        result={{
          status: 'blocked',
          blockReason: 'capabilities',
          operations: [],
          recovery: [],
          missingRequirements: [{
            path: 'sys/policies/acl/vc-role-reader',
            anyOf: ['create', 'update'],
          }],
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Vault blocked this plan before any write',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'sys/policies/acl/vc-role-reader [create or update]',
    );
  });

  it('shows verified operation state and manual recovery after a partial apply', () => {
    render(
      <PlanExecutionNotice
        result={{
          status: 'partial',
          operations: [
            { operationId: 'write-policy', state: 'completed' },
            { operationId: 'attach-policy', state: 'failed' },
          ],
          failedOperationId: 'attach-policy',
          errorMessage: 'Vault denied the attachment.',
          recovery: [{
            operationId: 'write-policy',
            summary: 'Verify the policy before retrying.',
          }],
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('write-policy: completed');
    expect(screen.getByRole('alert')).toHaveTextContent('attach-policy: failed');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Verify the policy before retrying.',
    );
  });
});
