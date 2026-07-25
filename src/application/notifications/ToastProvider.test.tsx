import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToast } from './ToastContext';
import { ToastProvider } from './ToastProvider';

function ToastHarness({ onUndo = () => undefined }: { readonly onUndo?: () => void }) {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success('Saved')}>Success</button>
      <button type="button" onClick={() => toast.error('Vault is unavailable')}>Error</button>
      <button
        type="button"
        onClick={() => toast.action('Version deleted', { label: 'Undo', onAction: onUndo })}
      >
        Action
      </button>
      <button
        type="button"
        onClick={() => {
          for (let index = 1; index <= 5; index += 1) toast.info(`Notice ${index}`);
        }}
      >
        Queue five
      </button>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('shows at most four notifications and advances the queue in order', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'Queue five' }));

    expect(screen.getAllByRole('status')).toHaveLength(4);
    expect(screen.queryByText('Notice 5')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss Notice 1 notification' }));
    expect(screen.getByText('Notice 5')).toBeVisible();
  });

  it('keeps errors until dismissal and gives them an assertive live region', async () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastHarness /></ToastProvider>);

    act(() => screen.getByRole('button', { name: 'Error' }).click());
    expect(screen.getByRole('alert')).toHaveTextContent('Vault is unavailable');

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('alert')).toHaveTextContent('Vault is unavailable');
  });

  it('pauses auto-dismiss while the toast is hovered', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastHarness /></ToastProvider>);

    act(() => screen.getByRole('button', { name: 'Success' }).click());
    const notice = screen.getByRole('status');
    fireEvent.mouseEnter(notice);

    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByText('Saved')).toBeVisible();

    fireEvent.mouseLeave(notice);
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('runs an action at most once', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<ToastProvider><ToastHarness onUndo={onUndo} /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'Action' }));
    const undo = screen.getByRole('button', { name: 'Undo' });
    act(() => {
      undo.click();
      undo.click();
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Version deleted')).not.toBeInTheDocument();
  });
});
