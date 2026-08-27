import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import KvMountConfigDrawer from './KvMountConfigDrawer';

describe('KvMountConfigDrawer', () => {
  it('fresh-loads and updates only supported KV v2 mount settings', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn(async () => ({
      maxVersions: 10,
      casRequired: false,
      deleteVersionAfter: '0s',
    }));
    const onSave = vi.fn(async () => undefined);
    render(
      <KvMountConfigDrawer
        open
        mount="applications"
        onClose={vi.fn()}
        onLoad={onLoad}
        onSave={onSave}
      />,
    );

    expect(await screen.findByText(/Only KV v2 data-retention defaults/)).toBeVisible();
    expect(onLoad).toHaveBeenCalledWith('applications', expect.any(AbortSignal));
    await user.clear(screen.getByLabelText('Default maximum versions'));
    await user.type(screen.getByLabelText('Default maximum versions'), '25');
    await user.clear(screen.getByLabelText('Default delete delay'));
    await user.type(screen.getByLabelText('Default delete delay'), '72h');
    await user.click(screen.getByRole('checkbox', { name: /Require check-and-set for this mount/ }));
    await user.click(screen.getByRole('button', { name: 'Save mount configuration' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('applications', {
      maxVersions: 25,
      casRequired: true,
      deleteVersionAfter: '72h',
    }));
    expect(screen.queryByText(/delete mount/i)).not.toBeInTheDocument();
  });

  it('blocks invalid retention defaults', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <KvMountConfigDrawer
        open
        mount="applications"
        onClose={vi.fn()}
        onLoad={vi.fn(async () => ({
          maxVersions: 10,
          casRequired: false,
          deleteVersionAfter: '0s',
        }))}
        onSave={onSave}
      />,
    );

    await screen.findByText(/Only KV v2 data-retention defaults/);
    await user.clear(screen.getByLabelText('Default delete delay'));
    await user.type(screen.getByLabelText('Default delete delay'), 'later');
    await user.click(screen.getByRole('button', { name: 'Save mount configuration' }));

    expect(screen.getByText(/Default delete delay must be a Vault duration/)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });
});
