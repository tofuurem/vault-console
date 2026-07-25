import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
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

  it('moves to the first and last enabled results with Home and End', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <PaletteHarness onOpenMount={vi.fn()} />
      </ShortcutProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open commands' }));
    const input = await screen.findByRole('combobox', { name: 'Search commands' });
    await user.type(input, '{End}');
    expect(screen.getByRole('option', { name: /Open users/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.type(input, '{Home}');
    expect(screen.getByRole('option', { name: /Open applications/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('limits large cached result sets until the query is refined', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <LargePaletteHarness />
      </ShortcutProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open large command set' }));
    expect(await screen.findAllByRole('option')).toHaveLength(100);
    expect(screen.getByText('Showing the first 100 of 105 matches. Refine your search.')).toBeVisible();
  });

  it('preserves the query when live index commands update', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <UpdatingPaletteHarness />
      </ShortcutProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open updating commands' }));
    const input = await screen.findByRole('combobox', { name: 'Search commands' });
    await user.type(input, 'applications');
    await user.click(screen.getByRole('button', { name: 'Add indexed path' }));

    expect(input).toHaveValue('applications');
    expect(screen.getByRole('option', { name: /applications\/platform\/api/ })).toBeVisible();
  });
});

function LargePaletteHarness() {
  const commands = useMemo(() => Array.from({ length: 105 }, (_, index) => ({
    id: `cached-${index}`,
    label: `applications/service-${index}`,
    group: 'Indexed secret',
    run: vi.fn(),
  })), []);
  useShortcutCommands(commands);
  const shortcuts = useShortcuts();
  return (
    <>
      <button type="button" onClick={shortcuts.openPalette}>Open large command set</button>
      <CommandPalette />
    </>
  );
}

function UpdatingPaletteHarness() {
  const [indexed, setIndexed] = useState(false);
  const commands = useMemo(() => [
    {
      id: 'mount-applications',
      label: 'Open applications',
      group: 'KV mounts',
      run: vi.fn(),
    },
    ...(indexed ? [{
      id: 'path-applications-platform-api',
      label: 'applications/platform/api',
      group: 'Indexed secret',
      run: vi.fn(),
    }] : []),
  ], [indexed]);
  useShortcutCommands(commands);
  const shortcuts = useShortcuts();
  return (
    <>
      <button type="button" onClick={shortcuts.openPalette}>Open updating commands</button>
      <button type="button" onClick={() => setIndexed(true)}>Add indexed path</button>
      <CommandPalette />
    </>
  );
}
