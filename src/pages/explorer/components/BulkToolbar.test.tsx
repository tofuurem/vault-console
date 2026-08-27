import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BulkToolbar from './BulkToolbar';

describe('BulkToolbar', () => {
  it('shows selection scope and invokes local and guarded actions', async () => {
    const user = userEvent.setup();
    const actions = {
      onCopyPaths: vi.fn(),
      onPin: vi.fn(),
      onUnpin: vi.fn(),
      onClear: vi.fn(),
      onSoftDelete: vi.fn(),
      onDestroy: vi.fn(),
      onPermanentDelete: vi.fn(),
    };
    render(
      <BulkToolbar
        selectedCount={3}
        hiddenSelectedCount={1}
        {...actions}
      />,
    );

    expect(screen.getByText('3 selected')).toBeVisible();
    expect(screen.getByText('1 hidden by filter')).toBeVisible();
    for (const label of [
      'Copy paths',
      'Pin',
      'Unpin',
      'Soft-delete latest',
      'Destroy versions…',
      'Delete keys permanently…',
      'Clear selection',
    ]) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveClass('min-h-11');
      await user.click(button);
    }
    Object.values(actions).forEach((action) => expect(action).toHaveBeenCalledOnce());
  });

  it('stays absent with no selection', () => {
    render(
      <BulkToolbar
        selectedCount={0}
        hiddenSelectedCount={0}
        onCopyPaths={vi.fn()}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByRole('toolbar', { name: 'Bulk secret actions' })).not.toBeInTheDocument();
  });
});
