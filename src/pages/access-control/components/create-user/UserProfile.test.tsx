import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { vaultUsers } from '@/mocks/vault-acl';
import UserProfile from '../UserProfile';

describe('UserProfile effective access', () => {
  it('reuses the Vault-aware effective permission tree', async () => {
    const user = userEvent.setup();
    render(<UserProfile user={vaultUsers[0]} onBack={() => undefined} />);

    await user.click(screen.getByRole('button', { name: /Effective Access/ }));
    expect(screen.getByRole('heading', { name: 'Effective KV access' })).toBeInTheDocument();
    expect(screen.getByTestId('effective-level-platform:')).toHaveTextContent('View');
  });
});
