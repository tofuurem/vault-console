import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resolveAccessSelection, resolveEffectiveKvTree } from '@/domain/access-control/effective-access';
import { mockCreateUserAccessCatalog } from '@/mocks/vault-access-catalog';
import AccessSummary from './AccessSummary';

describe('AccessSummary', () => {
  it('summarizes selected groups, inherited roles, and effective paths', () => {
    const selection = resolveAccessSelection({
      ...mockCreateUserAccessCatalog,
      selectedGroupIds: ['platform-team'],
      directRoleIds: [],
      directRules: [],
    });
    const tree = resolveEffectiveKvTree(mockCreateUserAccessCatalog.tree, selection.rules);
    render(
      <AccessSummary
        groups={mockCreateUserAccessCatalog.groups}
        roles={mockCreateUserAccessCatalog.roles}
        selection={selection}
        effectiveTree={tree}
        directRules={[]}
      />,
    );

    expect(screen.getByText('platform-team')).toBeInTheDocument();
    expect(screen.getByText('Platform readers')).toBeInTheDocument();
    expect(screen.getByText('via group')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: 'strong' })).toBeInTheDocument();
  });
});
