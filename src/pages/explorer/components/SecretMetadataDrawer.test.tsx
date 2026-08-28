import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { KvV2SecretHistory } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import SecretMetadataDrawer from './SecretMetadataDrawer';

const metadata: KvV2SecretHistory = {
  createdTime: '2026-08-20T12:00:00Z',
  updatedTime: '2026-08-21T12:00:00Z',
  currentVersion: 4,
  oldestVersion: 1,
  maxVersions: 10,
  casRequired: false,
  deleteVersionAfter: '24h',
  customMetadata: { owner: 'platform' },
  versions: [],
};

describe('SecretMetadataDrawer', () => {
  it('fresh-loads and saves the complete supported metadata document', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn(async () => metadata);
    const onSave = vi.fn(async () => undefined);
    render(
      <SecretMetadataDrawer
        open
        mount="applications"
        path="team/database"
        onClose={vi.fn()}
        onLoad={onLoad}
        onSave={onSave}
      />,
    );

    expect(await screen.findByText(/Loaded fresh from Vault/)).toBeVisible();
    expect(onLoad).toHaveBeenCalledWith(
      'applications',
      'team/database',
      expect.any(AbortSignal),
    );
    await user.clear(screen.getByLabelText('Maximum versions'));
    await user.type(screen.getByLabelText('Maximum versions'), '12');
    await user.clear(screen.getByLabelText('Delete version after'));
    await user.type(screen.getByLabelText('Delete version after'), '48h');
    await user.click(screen.getByRole('checkbox', { name: /Require check-and-set/ }));
    await user.clear(screen.getByLabelText('Custom metadata value for owner'));
    await user.type(screen.getByLabelText('Custom metadata value for owner'), 'security');
    await user.click(screen.getByRole('button', { name: 'Save key metadata' }));

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      'applications',
      'team/database',
      {
        maxVersions: 12,
        casRequired: true,
        deleteVersionAfter: '48h',
        customMetadata: { owner: 'security' },
      },
    ));
  });

  it('preserves the draft and blocks a stale save until the user loads latest metadata', async () => {
    const user = userEvent.setup();
    const latest = {
      ...metadata,
      maxVersions: 14,
      customMetadata: { owner: 'security' },
    };
    const onLoad = vi.fn()
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce(latest);
    const onSave = vi.fn(async () => undefined);
    render(
      <SecretMetadataDrawer
        open
        mount="applications"
        path="team/database"
        onClose={vi.fn()}
        onLoad={onLoad}
        onSave={onSave}
      />,
    );

    await screen.findByText(/Loaded fresh from Vault/);
    await user.clear(screen.getByLabelText('Maximum versions'));
    await user.type(screen.getByLabelText('Maximum versions'), '12');
    await user.click(screen.getByRole('button', { name: 'Save key metadata' }));

    expect(await screen.findByText(/metadata changed in Vault after this editor was opened/i))
      .toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Maximum versions')).toHaveValue('12');
    expect(screen.getByLabelText('Custom metadata value for owner')).toHaveValue('platform');

    await user.click(screen.getByRole('button', { name: 'Load latest metadata' }));
    expect(screen.getByLabelText('Maximum versions')).toHaveValue('14');
    expect(screen.getByLabelText('Custom metadata value for owner')).toHaveValue('security');
  });

  it('does not expose editable fields when the fresh read fails', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn(async () => {
      throw new VaultError('authorization');
    });
    render(
      <SecretMetadataDrawer
        open
        mount="applications"
        path="team/database"
        onClose={vi.fn()}
        onLoad={onLoad}
        onSave={vi.fn()}
      />,
    );

    expect(await screen.findByText('Current metadata could not be loaded')).toBeVisible();
    expect(screen.queryByLabelText('Maximum versions')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
  });

  it('keeps loaded fields while reporting validation and save errors', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {
      throw new VaultError('authorization');
    });
    render(
      <SecretMetadataDrawer
        open
        mount="applications"
        path="team/database"
        onClose={vi.fn()}
        onLoad={vi.fn(async () => metadata)}
        onSave={onSave}
      />,
    );

    await screen.findByText(/Loaded fresh from Vault/);
    await user.clear(screen.getByLabelText('Maximum versions'));
    await user.type(screen.getByLabelText('Maximum versions'), '-1');
    await user.click(screen.getByRole('button', { name: '+ Add field' }));
    const keys = screen.getAllByLabelText('Custom metadata key');
    await user.type(keys[1], 'owner');
    await user.click(screen.getByRole('button', { name: 'Save key metadata' }));
    expect(screen.getByText('Maximum versions must be a non-negative whole number.')).toBeVisible();
    expect(screen.getByText('Custom metadata keys must be unique.')).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Maximum versions'));
    await user.type(screen.getByLabelText('Maximum versions'), '8');
    await user.clear(keys[1]);
    await user.click(screen.getByRole('button', { name: 'Save key metadata' }));
    expect(await screen.findByText('Your Vault token does not allow this operation.')).toBeVisible();
    expect(screen.getByLabelText('Maximum versions')).toHaveValue('8');
  });
});
