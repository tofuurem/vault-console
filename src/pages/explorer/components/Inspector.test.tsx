import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { KvSecretDetails } from '@/application/vault/useKvExplorerData';
import type { KvActionPermissions } from '@/application/vault/useKvActionPermissions';
import type { KvV2Secret, KvV2SecretHistory } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import Inspector from './Inspector';

const secret: KvV2Secret = {
  mount: 'applications',
  path: 'billing/database',
  data: { API_KEY: 'memory-only-value' },
  metadata: {
    createdTime: '2026-07-23T01:00:00Z',
    version: 3,
    customMetadata: { owner: 'billing' },
    destroyed: false,
  },
};

const history: KvV2SecretHistory = {
  currentVersion: 3,
  oldestVersion: 1,
  customMetadata: { owner: 'billing' },
  versions: [
    { version: 3, createdTime: '2026-07-23T01:00:00Z', destroyed: false },
    { version: 2, createdTime: '2026-07-22T01:00:00Z', destroyed: false },
  ],
};

const permissions: KvActionPermissions = {
  scope: 'applications/data/billing/database',
  canReadData: true,
  canReadMetadata: false,
  canEdit: true,
  canDeleteLatest: false,
  canDeleteVersions: false,
  canUndelete: false,
  canDestroy: false,
  canDeleteMetadata: false,
};

function renderInspector(details: KvSecretDetails, overrides: Partial<ComponentProps<typeof Inspector>> = {}) {
  const props: ComponentProps<typeof Inspector> = {
    state: { status: 'success', data: details },
    mount: 'applications',
    path: 'billing/database',
    onRetry: vi.fn(),
    onOpenFullScreen: vi.fn(),
    onEdit: vi.fn(),
    permissions,
    ...overrides,
  };
  render(<Inspector {...props} />);
  return props;
}

describe('Inspector partial KV access', () => {
  it('shows readable data and scopes a metadata denial to history tabs', async () => {
    const user = userEvent.setup();
    renderInspector({
      secret,
      historyError: new VaultError('authorization', { status: 403 }),
    });

    expect(screen.getByText('API_KEY')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open secret full screen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit secret' })).toBeVisible();
    expect(screen.queryByText('Secret data is not allowed')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(screen.getByText('Version history is not allowed')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    expect(screen.getByText('Secret metadata is not allowed')).toBeVisible();
  });

  it('shows version history while scoping a data denial to the Data tab', async () => {
    const user = userEvent.setup();
    renderInspector({
      history,
      dataError: new VaultError('authorization', { status: 403 }),
    }, {
      permissions: { ...permissions, canReadData: false, canReadMetadata: true, canEdit: false },
    });

    expect(screen.getByText('Secret data is not allowed')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /Versions.*2/ }));
    expect(screen.getByText('v3')).toBeVisible();
    expect(screen.getByText('v2')).toBeVisible();
  });
});
