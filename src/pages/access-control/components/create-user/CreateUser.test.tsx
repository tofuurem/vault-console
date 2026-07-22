import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AccessControlSnapshot } from '@/application/vault/useAccessControlData';
import type { VaultAccessControlGateway, VaultSession } from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import CreateUserWizard from '../CreateUserWizard';
import { createUserAccessCatalogFixture } from '@/test/fixtures/create-user-access-catalog';

const snapshot = {
  authMounts: [],
  userpassMounts: [{ path: 'userpass', accessor: 'auth_userpass_123', type: 'userpass', description: '' }],
  groups: createUserAccessCatalogFixture.groups.map((group) => ({
    id: group.id,
    name: group.name,
    policies: group.roleIds,
    memberEntityIds: [],
    memberGroupIds: [],
    metadata: {},
  })),
  policies: [],
  roles: [],
  users: [],
  warnings: [],
} satisfies AccessControlSnapshot;
const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.test'),
  authMethod: 'token',
};
const gateway = {} as VaultAccessControlGateway;

describe('CreateUserWizard', () => {
  it('has exactly two decision screens and opens review as a modal state', async () => {
    const user = userEvent.setup();
    render(
      <CreateUserWizard
        catalog={createUserAccessCatalogFixture}
        snapshot={snapshot}
        gateway={gateway}
        session={session}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const steps = within(screen.getByRole('list', { name: 'Create user steps' })).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent('Account');
    expect(steps[1]).toHaveTextContent('Access');

    await user.click(screen.getByRole('button', { name: /Continue to access/ }));
    expect(screen.getByText('Enter a username.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Username/), 'alice');
    await user.click(screen.getByRole('button', { name: /Continue to access/ }));

    expect(screen.getByRole('heading', { name: 'Choose access in one place' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /platform-team/i }));
    expect(screen.getByTestId('effective-level-platform:')).toHaveTextContent('View');

    await user.click(screen.getByRole('button', { name: /Review & create/ }));
    expect(await screen.findByText('Confirm new user')).toBeInTheDocument();
    expect(screen.getByText('alice', { selector: 'p' })).toBeInTheDocument();
  });
});
