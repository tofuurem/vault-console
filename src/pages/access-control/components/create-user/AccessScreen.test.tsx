import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { mockCreateUserAccessCatalog } from '@/mocks/vault-access-catalog';
import AccessScreen from './AccessScreen';
import type { AccessDraft } from './access';

const emptyAccess: AccessDraft = { selectedGroupIds: [], directRoleIds: [], directRules: [] };

function Harness() {
  const [access, setAccess] = useState(emptyAccess);
  return <AccessScreen username="alice" catalog={mockCreateUserAccessCatalog} value={access} onChange={setAccess} />;
}

describe('AccessScreen', () => {
  it('recalculates the effective tree immediately when a group is selected', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const platformNode = screen.getByTestId('permission-node-platform:');
    expect(within(platformNode).getByTestId('effective-level-platform:')).toHaveTextContent('No access');

    await user.click(screen.getByRole('checkbox', { name: /platform-team/i }));
    expect(within(screen.getByTestId('permission-node-platform:')).getByTestId('effective-level-platform:')).toHaveTextContent('View');
    expect(screen.getAllByText('Platform readers').length).toBeGreaterThan(0);
  });

  it('keeps explicit Deny separate and clearing it returns to Inherited', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const selector = screen.getByLabelText('Direct access for applications/billing');

    await user.selectOptions(selector, 'deny');
    expect(screen.getByTestId('effective-level-applications:billing')).toHaveTextContent('Denied');
    expect(screen.getByText('Direct deny')).toBeInTheDocument();

    await user.selectOptions(selector, 'inherited');
    expect(screen.getByTestId('effective-level-applications:billing')).toHaveTextContent('No access');
    expect(screen.queryByText('Direct deny')).not.toBeInTheDocument();
  });
});
