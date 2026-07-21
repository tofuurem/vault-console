import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { mockCreateUserAccessCatalog } from '@/mocks/vault-access-catalog';
import AccessSourcePicker from './AccessSourcePicker';

describe('AccessSourcePicker', () => {
  it('shows group roles and prevents assigning an inherited role twice', async () => {
    const user = userEvent.setup();
    const onToggleGroup = vi.fn();
    render(
      <AccessSourcePicker
        groups={mockCreateUserAccessCatalog.groups}
        roles={mockCreateUserAccessCatalog.roles}
        selectedGroupIds={['platform-team']}
        directRoleIds={[]}
        inheritedRoleIds={['platform-readers']}
        onToggleGroup={onToggleGroup}
        onToggleRole={() => undefined}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /platform-team/i })).toBeChecked();
    await user.click(screen.getByText(/Advanced · Direct roles/));
    const inheritedRole = within(screen.getByRole('group', { name: 'Direct roles' })).getByRole(
      'checkbox',
      { name: /Platform readers/i },
    );
    expect(inheritedRole).toBeChecked();
    expect(inheritedRole).toBeDisabled();
    expect(screen.getByText('Via group')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /billing-team/i }));
    expect(onToggleGroup).toHaveBeenCalledWith('billing-team');
  });
});
