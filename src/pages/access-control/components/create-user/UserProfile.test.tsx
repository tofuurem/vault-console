import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { AccessControlUserRecord } from '@/application/vault/useAccessControlData';
import { createUserAccessCatalogFixture } from '@/test/fixtures/create-user-access-catalog';
import UserProfile from '../UserProfile';

const profileUser: AccessControlUserRecord = {
  id: 'userpass:alice',
  username: 'alice',
  displayName: 'Alice',
  mount: 'userpass',
  mountAccessor: 'auth_userpass_123',
  tokenPolicies: ['default'],
  entity: null,
  groups: [{
    id: 'platform-team',
    name: 'platform-team',
    policies: ['vc-role-platform-readers'],
    memberEntityIds: [],
    memberGroupIds: [],
    metadata: {},
  }],
  directRolePolicyNames: [],
  directPolicyNames: [],
  externalPolicyNames: [],
};

describe('UserProfile effective access', () => {
  it('reuses the Vault-aware effective permission tree', async () => {
    const user = userEvent.setup();
    render(<UserProfile user={profileUser} catalog={createUserAccessCatalogFixture} onBack={() => undefined} />);

    await user.click(screen.getByRole('tab', { name: /Effective access/i }));
    expect(screen.getByRole('heading', { name: 'Effective KV access' })).toBeInTheDocument();
    expect(screen.getByTestId('effective-level-platform:')).toHaveTextContent('View');
  });
});
