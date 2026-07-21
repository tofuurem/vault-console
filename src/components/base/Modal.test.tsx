import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Modal from './Modal';

describe('Modal', () => {
  it('labels the dialog, traps keyboard focus, closes with Escape, and restores focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">Open dialog</button>
        <Modal open={false} onClose={onClose} title="Confirm action">
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </Modal>
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    rerender(
      <>
        <button type="button">Open dialog</button>
        <Modal open onClose={onClose} title="Confirm action">
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </Modal>
      </>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Confirm action' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <>
        <button type="button">Open dialog</button>
        <Modal open={false} onClose={onClose} title="Confirm action"><span>Closed</span></Modal>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus();
  });
});
