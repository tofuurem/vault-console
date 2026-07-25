import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ExplorerSearch from './ExplorerSearch';

describe('ExplorerSearch', () => {
  it('keeps search available and switches between folder and mount scope', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    const onScopeChange = vi.fn();
    render(
      <ExplorerSearch
        query=""
        scope="folder"
        onQueryChange={onQueryChange}
        onScopeChange={onScopeChange}
      />,
    );

    const input = screen.getByRole('searchbox', { name: 'Search secret paths' });
    expect(input).toBeVisible();
    expect(input).not.toHaveClass('hidden');
    await user.type(input, 'api');
    expect(onQueryChange).toHaveBeenLastCalledWith('i');
    await user.click(screen.getByRole('radio', { name: 'Entire mount' }));
    expect(onScopeChange).toHaveBeenCalledWith('mount');
  });
});
