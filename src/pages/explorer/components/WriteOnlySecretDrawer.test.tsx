import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import WriteOnlySecretDrawer from './WriteOnlySecretDrawer';

describe('WriteOnlySecretDrawer', () => {
  it('uses the readable metadata version as a fixed CAS guard', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    render(
      <WriteOnlySecretDrawer
        open
        mount="applications"
        path="team/database"
        currentVersion={7}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.type(screen.getAllByLabelText('Secret key')[0], 'USERNAME');
    await user.type(screen.getByLabelText('Value for USERNAME'), 'billing');
    expect(screen.getByText(/Check-and-set is fixed to current version 7/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review write' }));
    expect(screen.getByText('Check-and-set version 7')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Write complete secret' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      { USERNAME: 'billing' },
      { type: 'check-and-set', version: 7 },
    ));
  });

  it('defaults to CAS 0 when metadata is unreadable', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    render(
      <WriteOnlySecretDrawer
        open
        mount="applications"
        path="team/database"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.type(screen.getAllByLabelText('Secret key')[0], 'TOKEN');
    await user.type(screen.getByLabelText('Value for TOKEN'), 'new-value');
    expect(screen.getByRole('radio', { name: /Create only/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Review write' }));
    await user.click(screen.getByRole('button', { name: 'Write complete secret' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      { TOKEN: 'new-value' },
      { type: 'create-only' },
    ));
  });

  it('double-confirms no-CAS replacement and preserves input after an error', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {
      throw new VaultError('invalid-request');
    });
    render(
      <WriteOnlySecretDrawer
        open
        mount="applications"
        path="team/database"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.type(screen.getAllByLabelText('Secret key')[0], 'TOKEN');
    await user.type(screen.getByLabelText('Value for TOKEN'), 'kept-after-error');
    await user.click(screen.getByRole('radio', { name: /Write without CAS/ }));
    await user.click(screen.getByRole('button', { name: 'Review write' }));

    const write = screen.getByRole('button', { name: 'Write complete secret' });
    expect(write).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I understand/ }));
    await user.click(write);

    expect(await screen.findByText(/This key may require CAS/)).toBeVisible();
    expect(onSave).toHaveBeenCalledWith(
      { TOKEN: 'kept-after-error' },
      { type: 'unconditional' },
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Value for TOKEN')).toHaveValue('kept-after-error');
  });
});
