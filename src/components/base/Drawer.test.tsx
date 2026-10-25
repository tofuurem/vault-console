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

  it('lets only the topmost of nested dialogs react to Escape', async () => {
    const user = userEvent.setup();
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    const { rerender } = render(
      <Drawer open title="Outer" onClose={closeOuter}>
        <button type="button">Outer action</button>
      </Drawer>,
    );
    rerender(
      <>
        <Drawer open title="Outer" onClose={closeOuter}>
          <button type="button">Outer action</button>
        </Drawer>
        <Drawer open title="Inner" onClose={closeInner}>
          <button type="button">Inner action</button>
        </Drawer>
      </>,
    );

    await user.keyboard('{Escape}');

    expect(closeInner).toHaveBeenCalledOnce();
    expect(closeOuter).not.toHaveBeenCalled();
  });
});
