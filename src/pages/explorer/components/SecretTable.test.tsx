import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SecretTable from './SecretTable';

describe('SecretTable', () => {
  it('uses semantic buttons for folders and secrets', async () => {
    const user = userEvent.setup();
    const onNavigateToFolder = vi.fn();
    const onSelectSecret = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
        ]}
        selectedPath={null}
        onNavigateToFolder={onNavigateToFolder}
        onSelectSecret={onSelectSecret}
      />,
    );

    const folder = screen.getByRole('button', { name: 'Open folder platform/' });
    folder.focus();
    await user.keyboard('{Enter}');
    expect(onNavigateToFolder).toHaveBeenCalledWith('platform/');

    const secret = screen.getByRole('button', { name: 'Inspect secret database' });
    secret.focus();
    await user.keyboard(' ');
    expect(onSelectSecret).toHaveBeenCalledWith('database');
  });

  it('pins folders and secrets without opening them', async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
        ]}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        isFavorite={(entry) => entry.path === 'database'}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Pin folder platform/' }));
    expect(onToggleFavorite).toHaveBeenLastCalledWith({
      kind: 'folder',
      name: 'platform',
      path: 'platform/',
    });

    await user.click(screen.getByRole('button', { name: 'Unpin secret database' }));
    expect(onToggleFavorite).toHaveBeenLastCalledWith({
      kind: 'secret',
      name: 'database',
      path: 'database',
    });
  });

  it('selects only secret rows and exposes a visible select-all control', () => {
    const onSelectionChange = vi.fn();
    const onToggleSelectAll = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
          { kind: 'secret', name: 'redis', path: 'redis' },
        ]}
        selectedPath={null}
        selectedPaths={['database']}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        onSelectionChange={onSelectionChange}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );

    expect(screen.queryByRole('checkbox', { name: /folder platform/i }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Deselect secret database' }))
      .toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Select all visible secrets' }))
      .toHaveAttribute('aria-checked', 'mixed');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select secret redis' }), {
      shiftKey: true,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(
      { kind: 'secret', name: 'redis', path: 'redis' },
      true,
      true,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible secrets' }));
    expect(onToggleSelectAll).toHaveBeenCalledOnce();
  });
});
