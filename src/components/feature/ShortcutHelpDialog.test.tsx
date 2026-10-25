import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useShortcuts } from '@/application/shortcuts/ShortcutContext';
import { ShortcutProvider } from '@/application/shortcuts/ShortcutProvider';
import { keyboardShortcutGroups } from '@/application/shortcuts/keyboard-shortcuts';
import CommandPalette from './CommandPalette';
import ShortcutHelpDialog, { ShortcutHelp } from './ShortcutHelpDialog';

function visibleKeys(element: HTMLElement): readonly string[] {
  return [...element.querySelectorAll('kbd')].map((key) => (
    key.querySelector('[aria-hidden="true"]')?.textContent ?? key.textContent ?? ''
  ));
}

function RegisteredCommands() {
  const { commands } = useShortcuts();
  return <output>{commands.map((command) => command.label).join(',')}</output>;
}

describe('ShortcutHelpDialog', () => {
  it('lists every shortcut, including the command palette combination', () => {
    render(
      <ShortcutHelpDialog open onClose={vi.fn()} groups={keyboardShortcutGroups(true)} />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByRole('heading', { name: 'Anywhere' })).toBeVisible();
    expect(within(dialog).getByRole('heading', { name: 'Explorer' })).toBeVisible();
    const palette = within(dialog).getByText('Open the command palette').parentElement!;
    expect(visibleKeys(palette)).toEqual(['⌘', 'K']);
    expect(within(palette).getByText('+')).toBeVisible();
    expect(within(palette).getByText('Command')).toHaveClass('sr-only');
    for (const description of [
      'Show keyboard shortcuts',
      'Search secret paths',
      'Move between rows in the folder table',
      'Open the folder or inspect the secret',
      'Edit the inspected secret, if your policy allows it',
    ]) {
      expect(within(dialog).getByText(description)).toBeVisible();
    }
  });

  it('shows Ctrl+K on other platforms', () => {
    render(<ShortcutHelpDialog open onClose={vi.fn()} groups={keyboardShortcutGroups(false)} />);
    expect(visibleKeys(screen.getByText('Open the command palette').parentElement!))
      .toEqual(['Ctrl', 'K']);
    const rows = screen.getByText('Move between rows in the folder table').parentElement!;
    expect(visibleKeys(rows)).toEqual(['↑', '↓']);
    expect(within(rows).getByText('or')).toBeVisible();
  });
});

describe('ShortcutHelp', () => {
  it('opens with ? outside text fields and closes with Escape', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <input aria-label="Notes" />
        <ShortcutHelp />
      </ShortcutProvider>,
    );

    await user.click(screen.getByLabelText('Notes'));
    await user.keyboard('?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveValue('?');

    (document.activeElement as HTMLElement).blur();
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('is reachable from the command palette', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <ShortcutHelp />
        <CommandPalette />
        <RegisteredCommands />
      </ShortcutProvider>,
    );

    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox', { name: 'Search commands' }), 'keyboard');
    await user.click(screen.getByRole('option', { name: /Show keyboard shortcuts/ }));
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });
});
