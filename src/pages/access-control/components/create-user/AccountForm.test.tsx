import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AccountForm from './AccountForm';
import { type AccountDraft, validateAccount } from './account';

const validAccount: AccountDraft = {
  username: 'alice',
  displayName: 'Alice',
  userpassMount: 'userpass',
  password: 'Abcdefghijk2345!',
};

describe('validateAccount', () => {
  it('returns field-local errors for invalid account input', () => {
    expect(
      validateAccount({ username: '.Alice', displayName: '', userpassMount: '../', password: 'short' }),
    ).toEqual({
      username: 'Use lowercase letters, numbers, dots, underscores, or hyphens.',
      userpassMount: 'Enter a valid Vault mount path.',
      password: 'Use at least 16 characters.',
    });
  });
});

describe('AccountForm', () => {
  it('normalizes the username and exposes errors beside their fields', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AccountForm
        value={{ ...validAccount, username: '' }}
        onChange={onChange}
        onRegeneratePassword={() => undefined}
        showErrors
      />,
    );

    expect(screen.getByText('Enter a username.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Username/), 'Alice');
    expect(onChange).toHaveBeenLastCalledWith({ ...validAccount, username: 'e' });
  });

  it('supports password visibility and regeneration without copying it', async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    render(
      <AccountForm value={validAccount} onChange={() => undefined} onRegeneratePassword={onRegenerate} />,
    );

    expect(screen.getByLabelText(/Initial password/)).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText(/Initial password/)).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });
});
