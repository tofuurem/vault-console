import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BulkSoftDeleteDialog from './BulkSoftDeleteDialog';

describe('BulkSoftDeleteDialog', () => {
  it('shows exact versions, exclusions, and Undo availability before confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <BulkSoftDeleteDialog
        open
        mount="applications"
        requestedCount={3}
        preflight={{
          requestedPaths: ['one', 'two', 'denied'],
          eligible: [
            { path: 'one', version: 5, canUndo: true },
            { path: 'two', version: 7, canUndo: false },
          ],
          excluded: [{ path: 'denied', status: 'denied' }],
        }}
        preparing={false}
        submitting={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('one')).toBeVisible();
    expect(screen.getByText('v5')).toBeVisible();
    expect(screen.getByText('Undo available')).toBeVisible();
    expect(screen.getByText('No Undo permission')).toBeVisible();
    expect(screen.getAllByText('denied')[0]).toBeVisible();
    await user.click(screen.getByRole('button', {
      name: 'Soft-delete 2 current versions',
    }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('does not allow an operation while preflight failed', () => {
    render(
      <BulkSoftDeleteDialog
        open
        mount="applications"
        requestedCount={2}
        error="Vault is unavailable."
        preparing={false}
        submitting={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Vault is unavailable.');
    expect(screen.getByRole('button', {
      name: 'Soft-delete 0 current versions',
    })).toBeDisabled();
  });
});
