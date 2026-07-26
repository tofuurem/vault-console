import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import PathBreadcrumbs from './PathBreadcrumbs';

describe('PathBreadcrumbs', () => {
  it('collapses the middle of deep paths and expands it on demand', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <PathBreadcrumbs
        mount="applications"
        currentPath="platform/production/eu/payments/database/"
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByRole('button', { name: 'platform/' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'production/' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'payments/' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'database/' })).toBeVisible();

    await user.click(screen.getByRole('button', {
      name: 'Show 2 hidden path segments',
    }));
    expect(screen.getByRole('button', { name: 'production/' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'eu/' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'eu/' }));
    expect(onNavigate).toHaveBeenCalledWith('platform/production/eu/');
  });

  it('keeps short paths fully visible without an ellipsis control', () => {
    render(
      <PathBreadcrumbs
        mount="applications"
        currentPath="platform/database/"
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'platform/' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'database/' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /hidden path segments/ }))
      .not.toBeInTheDocument();
  });
});
