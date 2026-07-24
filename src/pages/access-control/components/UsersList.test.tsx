import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AccessControlUserRecord } from '@/application/vault/useAccessControlData';
import UsersList from './UsersList';

const userRecord: AccessControlUserRecord = {
  id: 'userpass:alice',
  username: 'alice',
  displayName: 'Alice',
  mount: 'userpass',
  mountAccessor: 'auth_userpass',
  tokenPolicies: ['default'],
  entity: null,
  groups: [],
  directRolePolicyNames: [],
  directPolicyNames: [],
  externalPolicyNames: [],
};

describe('UsersList', () => {
  it('opens a profile through a real keyboard-operable button', async () => {
    const user = userEvent.setup();
    const onViewUser = vi.fn();
    render(
      <UsersList
        users={[userRecord]}
        warnings={[]}
        onCreateUser={vi.fn()}
        onViewUser={onViewUser}
        onRefresh={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Open user alice' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(onViewUser).toHaveBeenCalledWith(userRecord);
  });
});
