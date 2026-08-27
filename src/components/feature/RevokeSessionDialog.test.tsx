import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import RevokeSessionDialog from './RevokeSessionDialog';

describe('RevokeSessionDialog', () => {
  it('explains server-side impact before revoking the token', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);
    render(
      <RevokeSessionDialog
        open
        revocation={{ status: 'idle' }}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Child tokens and leases or dynamic secrets/)).toBeVisible();
    expect(screen.getByText(/only want to clear this browser tab/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Revoke token' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('keeps a sanitized failure visible and states that the session remains active', () => {
    render(
      <RevokeSessionDialog
        open
        revocation={{ status: 'failed', error: new VaultError('unavailable') }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Vault is currently unavailable.');
    expect(screen.getByRole('alert')).toHaveTextContent('session remains active');
  });
});
