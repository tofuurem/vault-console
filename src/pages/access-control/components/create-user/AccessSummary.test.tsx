import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resolveAccessSelection, resolveEffectiveKvTree } from '@/domain/access-control/effective-access';
import { createUserAccessCatalogFixture } from '@/test/fixtures/create-user-access-catalog';
import AccessSummary from './AccessSummary';

describe('AccessSummary', () => {
  it('summarizes selected groups, inherited roles, and effective paths', () => {
    const selection = resolveAccessSelection({
      ...createUserAccessCatalogFixture,
      selectedGroupIds: ['platform-team'],
      directRoleIds: [],
      directRules: [],
    });
    const tree = resolveEffectiveKvTree(createUserAccessCatalogFixture.tree, selection.rules);
    render(
      <AccessSummary
        groups={createUserAccessCatalogFixture.groups}
        roles={createUserAccessCatalogFixture.roles}
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
