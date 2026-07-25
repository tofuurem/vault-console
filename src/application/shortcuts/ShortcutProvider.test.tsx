import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useShortcuts, useShortcutCommands } from './ShortcutContext';
import { ShortcutProvider } from './ShortcutProvider';

function RegistryOwner() {
  useShortcutCommands([{
    id: 'open-applications',
    label: 'Open applications',
    group: 'KV mounts',
    run: vi.fn(),
  }]);
  return null;
}

function RegistryHarness() {
  const shortcuts = useShortcuts();
  const [mounted, setMounted] = useState(true);
  return (
    <>
      {mounted && <RegistryOwner />}
      <output>{shortcuts.commands.map((command) => command.id).join(',')}</output>
      <button type="button" onClick={() => setMounted(false)}>Unmount owner</button>
    </>
  );
}

describe('ShortcutProvider', () => {
  it('opens from the platform shortcut even while an input has focus', async () => {
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <input aria-label="Filter" />
        <PaletteState />
      </ShortcutProvider>,
    );

    await user.click(screen.getByLabelText('Filter'));
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByText('open')).toBeVisible();
  });

  it('removes registered commands with their owner', async () => {
    const user = userEvent.setup();
    render(<ShortcutProvider><RegistryHarness /></ShortcutProvider>);

    expect(screen.getByText('open-applications')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Unmount owner' }));
    expect(screen.getByText('', { selector: 'output' })).toBeVisible();
  });
});

function PaletteState() {
  const shortcuts = useShortcuts();
  return <output>{shortcuts.paletteOpen ? 'open' : 'closed'}</output>;
}
