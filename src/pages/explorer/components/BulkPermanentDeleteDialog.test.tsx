import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BulkPermanentDeleteDialog from './BulkPermanentDeleteDialog';

describe('BulkPermanentDeleteDialog', () => {
  it('requires the exact eligible count phrase before permanent deletion', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <BulkPermanentDeleteDialog
        open
        mount="applications"
        requestedCount={3}
        preflight={{
          requestedPaths: ['denied', 'one', 'two'],
          eligible: [{ path: 'one' }, { path: 'two' }],
          excluded: [{ path: 'denied', status: 'denied' }],
        }}
        preparing={false}
        submitting={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole('button', {
      name: 'Delete 2 keys permanently',
    });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE 2 KEYS to confirm'), 'DELETE 2 KEYS');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('keeps partial per-key outcomes visible', () => {
    render(
      <BulkPermanentDeleteDialog
        open
        mount="applications"
        requestedCount={2}
        outcomes={[
          { path: 'one', status: 'succeeded' },
          { path: 'two', status: 'failed', message: 'Vault is unavailable.' },
        ]}
        preparing={false}
        submitting={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('one')).toBeVisible();
    expect(screen.getByText('succeeded')).toBeVisible();
    expect(screen.getByText('two')).toBeVisible();
    expect(screen.getByText('failed')).toBeVisible();
    expect(screen.getByText('Vault is unavailable.')).toBeVisible();
  });
});
