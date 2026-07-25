import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BulkDestroyDialog from './BulkDestroyDialog';

describe('BulkDestroyDialog', () => {
  it('requires explicit versions and the exact mount before permanent destroy', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <BulkDestroyDialog
        open
        mount="applications"
        requestedCount={1}
        preflight={{
          requestedPaths: ['database'],
          eligible: [{
            path: 'database',
            versions: [
              {
                version: 3,
                createdTime: '2026-07-25T03:00:00Z',
                destroyed: false,
              },
              {
                version: 2,
                createdTime: '2026-07-25T02:00:00Z',
                destroyed: false,
                deletionTime: '2026-07-25T02:30:00Z',
              },
            ],
          }],
          excluded: [],
        }}
        preparing={false}
        submitting={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole('button', {
      name: 'Destroy 0 versions permanently',
    });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('checkbox', {
      name: 'Destroy database version 2',
    }));
    expect(screen.getByRole('button', {
      name: 'Destroy 1 versions permanently',
    })).toBeDisabled();
    await user.type(screen.getByLabelText('Type applications to confirm'), 'applications');
    await user.click(screen.getByRole('button', {
      name: 'Destroy 1 versions permanently',
    }));

    expect(onConfirm).toHaveBeenCalledWith([{
      path: 'database',
      versions: [2],
    }]);
  });
});
