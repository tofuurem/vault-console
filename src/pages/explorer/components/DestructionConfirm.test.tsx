import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DestructionConfirm, { type KvDestructiveAction } from './DestructionConfirm';

function renderConfirm(
  action: KvDestructiveAction,
  onConfirm = vi.fn(async () => undefined),
) {
  render(
    <DestructionConfirm
      open
      onClose={vi.fn()}
      mount="applications"
      path="billing/database"
      action={action}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('DestructionConfirm', () => {
  it('confirms a reversible soft delete without typed path friction', async () => {
    const user = userEvent.setup();
    const action = { kind: 'delete-latest' as const, version: 7 };
    const onConfirm = renderConfirm(action);

    expect(screen.queryByLabelText(/Type applications\/billing\/database/)).not.toBeInTheDocument();
    expect(screen.getByText(/reversible soft delete/i)).toBeVisible();
    expect(screen.queryByText(/· v7/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete current version' }));
    expect(onConfirm).toHaveBeenCalledWith(action);
  });

  it('keeps exact typed confirmation for permanent destruction', async () => {
    const user = userEvent.setup();
    const action = { kind: 'destroy-version' as const, version: 7 };
    const onConfirm = renderConfirm(action);
    const confirm = screen.getByRole('button', { name: 'Destroy version permanently' });

    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByLabelText('Type applications/billing/database to confirm'),
      'applications/billing/database',
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(action);
  });

  it('names permanent key deletion without inventing a version target', async () => {
    const user = userEvent.setup();
    const action = { kind: 'delete-key' as const };
    const onConfirm = renderConfirm(action);

    expect(screen.getByRole('dialog', { name: 'Delete key permanently' })).toBeVisible();
    expect(screen.getByText('applications/billing/database')).toBeVisible();
    expect(screen.queryByText(/· v/)).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Delete key permanently' });
    await user.type(
      screen.getByLabelText('Type applications/billing/database to confirm'),
      'applications/billing/database',
    );
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(action);
  });
});
