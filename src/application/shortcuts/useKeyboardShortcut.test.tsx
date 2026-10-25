import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { isPageShortcutEvent } from './shortcut';
import { useKeyboardShortcut } from './useKeyboardShortcut';

function Listener({
  handler,
  enabled = true,
}: {
  readonly handler: (event: KeyboardEvent) => boolean | void;
  readonly enabled?: boolean;
}) {
  useKeyboardShortcut(['/', '?'], handler, enabled);
  return null;
}

function keyEvent(overrides: Partial<Parameters<typeof isPageShortcutEvent>[0]> = {}) {
  return {
    key: '/',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: document.body,
    defaultPrevented: false,
    ...overrides,
  };
}

describe('isPageShortcutEvent', () => {
  it('rejects typing, modifier combinations, composition and handled events', () => {
    expect(isPageShortcutEvent(keyEvent())).toBe(true);
    expect(isPageShortcutEvent(keyEvent({ target: document.createElement('textarea') }))).toBe(false);
    expect(isPageShortcutEvent(keyEvent({ ctrlKey: true }))).toBe(false);
    expect(isPageShortcutEvent(keyEvent({ metaKey: true }))).toBe(false);
    expect(isPageShortcutEvent(keyEvent({ altKey: true }))).toBe(false);
    expect(isPageShortcutEvent(keyEvent({ isComposing: true }))).toBe(false);
    expect(isPageShortcutEvent(keyEvent({ defaultPrevented: true }))).toBe(false);
  });

  it('pauses while a modal dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    try {
      expect(isPageShortcutEvent(keyEvent())).toBe(false);
    } finally {
      dialog.remove();
    }
  });
});

describe('useKeyboardShortcut', () => {
  it('runs for matching keys outside editable fields', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<><input aria-label="Name" /><Listener handler={handler} /></>);

    await user.keyboard('/');
    await user.keyboard('?');
    expect(handler).toHaveBeenCalledTimes(2);
    await user.keyboard('x');
    await user.click(screen.getByLabelText('Name'));
    await user.keyboard('/');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Name')).toHaveValue('/');
  });

  it('leaves the key to the browser when the handler declines it or is disabled', () => {
    const declined = render(<Listener handler={() => false} />);
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    declined.unmount();

    const handler = vi.fn();
    render(<Listener handler={handler} enabled={false} />);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });
});
