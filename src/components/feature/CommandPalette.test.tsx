import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useShortcuts, useShortcutCommands } from '@/application/shortcuts/ShortcutContext';
import { ShortcutProvider } from '@/application/shortcuts/ShortcutProvider';
import CommandPalette from './CommandPalette';

function PaletteHarness({ onOpenMount }: { readonly onOpenMount: () => void }) {
  const commands = useMemo(() => [
    {
      id: 'mount-applications',
      label: 'Open applications',
      group: 'KV mounts',
      keywords: ['secrets', 'applications'],
      run: onOpenMount,
    },
    {
      id: 'access-users',
      label: 'Open users',
      group: 'Access control',
      run: vi.fn(),
    },
    {
      id: 'denied',
      label: 'Create restricted mount',
      group: 'Actions',
      disabledReason: 'Vault policy does not allow this action.',
      run: vi.fn(),
    },
  ], [onOpenMount]);
  useShortcutCommands(commands);
  const shortcuts = useShortcuts();

  return (
    <>
      <button type="button" onClick={shortcuts.openPalette}>Open commands</button>
      <CommandPalette />
    </>
  );
}

describe('CommandPalette', () => {
  it('filters commands and runs the active result from the keyboard', async () => {
    const user = userEvent.setup();
    const onOpenMount = vi.fn();
    render(
      <ShortcutProvider>
        <PaletteHarness onOpenMount={onOpenMount} />
      </ShortcutProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open commands' }));
    const input = await screen.findByRole('combobox', { name: 'Search commands' });
    expect(input).toHaveFocus();

    await user.type(input, 'app');
    expect(screen.getByRole('option', { name: /Open applications/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Open users/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(onOpenMount).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open commands' })).toHaveFocus();
  });

  it('supports pointer selection and explains disabled commands', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <PaletteHarness onOpenMount={vi.fn()} />
      </ShortcutProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open commands' }));
    const denied = await screen.findByRole('option', { name: /Create restricted mount/ });
    expect(denied).toHaveAttribute('aria-disabled', 'true');
    expect(denied).toHaveTextContent('Vault policy does not allow this action.');
    await user.click(screen.getByRole('option', { name: /Open users/ }));
    await waitFor(() => expect(
      screen.queryByRole('dialog', { name: 'Command palette' }),
    ).not.toBeInTheDocument());
  });
});
