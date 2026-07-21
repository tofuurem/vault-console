import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CreateUserWorkflowModal, { type CreateUserReview } from './CreateUserWorkflowModal';
import { CLOSED_WORKFLOW, createUserWorkflowReducer, type ApplyUser } from './workflow';

const review: CreateUserReview = {
  username: 'alice',
  displayName: 'Alice',
  userpassMount: 'userpass',
  password: 'Abcdefghijk2345!',
  groupNames: ['platform-team'],
  inheritedRoleNames: ['Platform readers'],
  directRoleNames: [],
  directRules: [
    { nodeId: 'platform:', mount: 'platform', path: '', target: 'folder', level: 'owner' },
  ],
  generatedHcl: 'path "platform/data/*" { capabilities = ["read"] }',
  dangerous: true,
};
const plan = [
  { id: 'policy', label: 'Create per-user ACL policy' },
  { id: 'account', label: 'Create userpass account' },
];

describe('createUserWorkflowReducer', () => {
  it('tracks operation and failure state without losing completed work', () => {
    let state = createUserWorkflowReducer(CLOSED_WORKFLOW, { type: 'open', operations: plan });
    state = createUserWorkflowReducer(state, { type: 'start' });
    state = createUserWorkflowReducer(state, { type: 'operation', id: 'policy', state: 'completed' });
    state = createUserWorkflowReducer(state, { type: 'operation', id: 'account', state: 'failed' });
    state = createUserWorkflowReducer(state, { type: 'failure', error: 'Safe error' });

    expect(state.stage).toBe('failure');
    expect(state.operations.map((operation) => operation.state)).toEqual(['completed', 'failed']);
  });
});

describe('CreateUserWorkflowModal', () => {
  it('requires dangerous-access confirmation and ends with a one-time handoff', async () => {
    const user = userEvent.setup();
    const applyUser: ApplyUser = vi.fn(async ({ report }) => {
      report('policy', 'running');
      report('policy', 'completed');
      report('account', 'running');
      report('account', 'completed');
    });
    render(
      <CreateUserWorkflowModal
        open
        review={review}
        operationPlan={plan}
        applyUser={applyUser}
        onClose={() => undefined}
        onComplete={() => undefined}
      />,
    );

    const createButton = screen.getByRole('button', { name: /Create user/ });
    expect(createButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Confirm broad or Owner access/ }));
    await user.click(createButton);

    expect(await screen.findByText('User created successfully')).toBeInTheDocument();
    expect(screen.getByLabelText('Created user password')).toHaveValue(review.password);
    expect(applyUser).toHaveBeenCalledOnce();
  });

  it('shows completed and failed operations with retry actions after a partial failure', async () => {
    const user = userEvent.setup();
    const applyUser: ApplyUser = vi.fn(async ({ report }) => {
      report('policy', 'completed');
      report('account', 'failed');
      throw new Error('body containing secret should never render');
    });
    render(
      <CreateUserWorkflowModal
        open
        review={{ ...review, dangerous: false }}
        operationPlan={plan}
        applyUser={applyUser}
        onClose={() => undefined}
        onComplete={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Create user/ }));
    expect(await screen.findByText('The user was not fully created')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry from safe point/ })).toBeInTheDocument();
    expect(screen.queryByText(/body containing secret/)).not.toBeInTheDocument();
  });
});
