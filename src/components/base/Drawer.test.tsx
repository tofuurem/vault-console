import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Drawer from './Drawer';

describe('Drawer', () => {
  it('supports a left-side mobile navigation surface and closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open side="left" title="Vault navigation" onClose={onClose}>
        <button type="button">First destination</button>
      </Drawer>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Vault navigation' });
    expect(dialog).toHaveClass('left-0', 'h-[100dvh]', 'drawer-enter-left');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
