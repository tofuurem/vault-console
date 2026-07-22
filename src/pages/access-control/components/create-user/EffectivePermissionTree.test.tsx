import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { resolveAccessSelection, resolveEffectiveKvTree } from '@/domain/access-control/effective-access';
import { createUserAccessCatalogFixture } from '@/test/fixtures/create-user-access-catalog';
import EffectivePermissionTree from './EffectivePermissionTree';

describe('EffectivePermissionTree', () => {
  it('shows the effective result separately from a direct Inherited or Deny choice', async () => {
    const user = userEvent.setup();
    const selection = resolveAccessSelection({
      ...createUserAccessCatalogFixture,
      selectedGroupIds: ['billing-team'],
      directRoleIds: [],
      directRules: [],
    });
    const tree = resolveEffectiveKvTree(createUserAccessCatalogFixture.tree, selection.rules);
    const onDirectRuleChange = vi.fn();
    render(
      <EffectivePermissionTree nodes={tree} directRules={[]} onDirectRuleChange={onDirectRuleChange} />,
    );

    expect(screen.getByTestId('effective-level-applications:billing')).toHaveTextContent('Edit');
    const selector = screen.getByLabelText('Direct access for applications/billing');
    expect(selector).toHaveValue('inherited');
    await user.selectOptions(selector, 'deny');
    expect(onDirectRuleChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'applications:billing' }),
      'deny',
    );
  });
});
