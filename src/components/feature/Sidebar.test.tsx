import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Sidebar from './Sidebar';

describe('Sidebar', () => {
  it('opens favorite and recent paths from their compact sections', async () => {
    const user = userEvent.setup();
    const onPathSelect = vi.fn();
    render(
      <Sidebar
        collapsed={false}
        onToggleCollapse={vi.fn()}
        mounts={[{
          path: 'applications',
          accessor: 'kv_apps',
          description: '',
          version: 2,
        }]}
        activeMount="applications"
        activePath=""
        onMountSelect={vi.fn()}
        favorites={[{
          mount: 'applications',
          path: 'platform/',
          kind: 'folder',
          pinnedAt: 1,
        }]}
        recents={[{
          mount: 'applications',
          path: 'platform/database',
          kind: 'secret',
          visitedAt: 2,
        }]}
        onPathSelect={onPathSelect}
      />,
    );

    expect(screen.getByText('applications/platform/')).toBeVisible();
    await user.click(screen.getByRole('button', {
      name: 'Open favorites path applications/platform/',
    }));
    expect(onPathSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'folder',
      path: 'platform/',
    }));

    await user.click(screen.getByRole('button', {
      name: 'Open recent path applications/platform/database',
    }));
    expect(onPathSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'secret',
      path: 'platform/database',
    }));
  });
});
