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
  account: {
    username: 'alice',
    mount: 'userpass',
    tokenPolicies: ['default'],
  },
  entity: null,
  identityOwnership: 'external',
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
        search=""
        onSearchChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Open user alice' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(onViewUser).toHaveBeenCalledWith(userRecord);
  });

  it('restores focus to the originating account without owning search state', async () => {
    const onFocusRestored = vi.fn();
    const { rerender } = render(
      <UsersList
        users={[userRecord]}
        warnings={[]}
        onCreateUser={vi.fn()}
        onViewUser={vi.fn()}
        onRefresh={vi.fn()}
        search="ali"
        onSearchChange={vi.fn()}
        restoreFocusUserId={userRecord.id}
        onFocusRestored={onFocusRestored}
      />,
    );

    expect(screen.getByLabelText('Search users')).toHaveValue('ali');
    expect(screen.getByRole('button', { name: 'Open user alice' })).toHaveFocus();
    expect(onFocusRestored).toHaveBeenCalledOnce();

    rerender(
      <UsersList
        users={[userRecord]}
        warnings={[]}
        onCreateUser={vi.fn()}
        onViewUser={vi.fn()}
        onRefresh={vi.fn()}
        search="alice"
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Search users')).toHaveValue('alice');
  });
});
