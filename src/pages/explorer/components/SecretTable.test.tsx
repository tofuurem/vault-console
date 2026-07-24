import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SecretTable from './SecretTable';

describe('SecretTable', () => {
  it('uses semantic buttons for folders and secrets', async () => {
    const user = userEvent.setup();
    const onNavigateToFolder = vi.fn();
    const onSelectSecret = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
        ]}
        selectedPath={null}
        onNavigateToFolder={onNavigateToFolder}
        onSelectSecret={onSelectSecret}
      />,
    );

    const folder = screen.getByRole('button', { name: 'Open folder platform/' });
    folder.focus();
    await user.keyboard('{Enter}');
    expect(onNavigateToFolder).toHaveBeenCalledWith('platform/');

    const secret = screen.getByRole('button', { name: 'Inspect secret database' });
    secret.focus();
    await user.keyboard(' ');
    expect(onSelectSecret).toHaveBeenCalledWith('database');
  });
});
