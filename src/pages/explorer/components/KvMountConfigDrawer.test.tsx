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

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('applications', {
      maxVersions: 25,
      casRequired: true,
      deleteVersionAfter: '72h',
    }));
    expect(screen.queryByText(/delete mount/i)).not.toBeInTheDocument();
  });

  it('blocks a stale save and loads the latest mount settings only on request', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn()
      .mockResolvedValueOnce({
        maxVersions: 10,
        casRequired: false,
        deleteVersionAfter: '0s',
      })
      .mockResolvedValueOnce({
        maxVersions: 20,
        casRequired: true,
        deleteVersionAfter: '2h',
      });
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

    await screen.findByText(/Only KV v2 data-retention defaults/);
    await user.clear(screen.getByLabelText('Default maximum versions'));
    await user.type(screen.getByLabelText('Default maximum versions'), '15');
    await user.click(screen.getByRole('button', { name: 'Save mount configuration' }));

    expect(await screen.findByText(/mount configuration changed in Vault after this editor was opened/i))
      .toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Default maximum versions')).toHaveValue('15');

    await user.click(screen.getByRole('button', { name: 'Load latest configuration' }));
    expect(screen.getByLabelText('Default maximum versions')).toHaveValue('20');
    expect(screen.getByLabelText('Default delete delay')).toHaveValue('2h');
    expect(screen.getByRole('checkbox', { name: /Require check-and-set for this mount/ }))
      .toBeChecked();
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
