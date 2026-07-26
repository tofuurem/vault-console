import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AccessCenterShell from './AccessCenterShell';

describe('AccessCenterShell', () => {
  it('renders route navigation with one active section and forwards selection', async () => {
    const user = userEvent.setup();
    const onSectionSelect = vi.fn();
    render(
      <AccessCenterShell
        activeSection="users"
        onSectionSelect={onSectionSelect}
      >
        <div>User directory</div>
      </AccessCenterShell>,
    );

    expect(screen.getByRole('heading', { name: 'Access Center' })).toBeVisible();
    const navigation = screen.getByRole('navigation', {
      name: 'Access Center sections',
    });
    expect(within(navigation).getByRole('button', { name: 'Users' }))
      .toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('button', { name: 'Groups' }))
      .not.toHaveAttribute('aria-current');
    expect(screen.getByText('User directory')).toBeVisible();

    await user.click(within(navigation).getByRole('button', { name: 'Groups' }));
    expect(onSectionSelect).toHaveBeenCalledWith('groups');
  });

  it('keeps every local destination touch-sized and horizontally reachable', () => {
    render(
      <AccessCenterShell activeSection="roles" onSectionSelect={vi.fn()}>
        <div>Roles</div>
      </AccessCenterShell>,
    );

    for (const name of ['Users', 'Groups', 'Roles', 'Policies']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
    }
  });
});
