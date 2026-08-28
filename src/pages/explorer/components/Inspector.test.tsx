import { act, fireEvent, render, screen } from '@testing-library/react';
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
  createdTime: '2026-07-21T01:00:00Z',
  updatedTime: '2026-07-23T01:00:00Z',
  currentVersion: 3,
  oldestVersion: 1,
  maxVersions: 10,
  casRequired: false,
  deleteVersionAfter: '0s',
  customMetadata: { owner: 'billing' },
  versions: [
    { version: 3, createdTime: '2026-07-23T01:00:00Z', destroyed: false },
    { version: 2, createdTime: '2026-07-22T01:00:00Z', destroyed: false },
  ],
};

const permissions: KvActionPermissions = {
  scope: 'applications/data/billing/database',
  discovery: 'resolved',
  canReadData: true,
  canReadMetadata: false,
  canEdit: true,
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
    expect(screen.queryByRole('button', { name: 'Open secret full screen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit secret' })).toBeVisible();
    expect(screen.queryByText('Secret data is not allowed')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(screen.getByText('Version history is not allowed')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    expect(screen.getByText('Secret metadata is not allowed')).toBeVisible();
  });

  it('opens the read-only workspace independently from edit permission', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    renderInspector({ secret, history }, {
      onView,
      onEdit: vi.fn(),
      permissions: { ...permissions, canEdit: false },
    });

    const view = screen.getByRole('button', { name: 'View secret full screen' });
    expect(view).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit secret' })).not.toBeInTheDocument();

    await user.click(view);
    expect(onView).toHaveBeenCalledOnce();
  });

  it('reveals primitive and container values independently, then resets for another path', async () => {
    const user = userEvent.setup();
    const nestedSecret: KvV2Secret = {
      ...secret,
      data: {
        API_KEY: 'memory-only-value',
        CONFIG: {
          token: 'nested-memory-value',
          enabled: true,
        },
      },
    };
    const view = render(
      <Inspector
        state={{ status: 'success', data: { secret: nestedSecret, history } }}
        mount="applications"
        path="billing/database"
        onRetry={vi.fn()}
        permissions={permissions}
      />,
    );

    const revealApiKey = screen.getByRole('button', { name: 'Reveal API_KEY' });
    const revealConfig = screen.getByRole('button', { name: 'Reveal CONFIG' });
    expect(revealApiKey).toHaveAttribute('aria-pressed', 'false');
    expect(revealConfig).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('memory-only-value')).not.toBeInTheDocument();
    expect(screen.queryByText(/nested-memory-value/)).not.toBeInTheDocument();

    await user.click(revealApiKey);
    expect(screen.getByText('memory-only-value')).toBeVisible();
    expect(screen.queryByText(/nested-memory-value/)).not.toBeInTheDocument();
    expect(revealApiKey).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Copy CONFIG' }));
    expect(screen.queryByText(/nested-memory-value/)).not.toBeInTheDocument();

    await user.click(revealConfig);
    const preview = screen.getByText(/nested-memory-value/);
    expect(preview).toBeVisible();
    expect(preview.closest('pre')).toHaveClass('max-h-48', 'overflow-auto');

    view.rerender(
      <Inspector
        state={{ status: 'success', data: { secret: nestedSecret, history } }}
        mount="applications"
        path="billing/other"
        onRetry={vi.fn()}
        permissions={permissions}
      />,
    );
    expect(screen.queryByText('memory-only-value')).not.toBeInTheDocument();
    expect(screen.queryByText(/nested-memory-value/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal API_KEY' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('automatically masks an individually revealed Inspector value', () => {
    vi.useFakeTimers();
    try {
      renderInspector({ secret, history });
      fireEvent.click(screen.getByRole('button', { name: 'Reveal API_KEY' }));
      expect(screen.getByText('memory-only-value')).toBeVisible();

      act(() => vi.advanceTimersByTime(8_000));

      expect(screen.queryByText('memory-only-value')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reveal API_KEY' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    } finally {
      vi.useRealTimers();
    }
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

  it('offers a dedicated write-only workflow when exact data capabilities allow it', async () => {
    const user = userEvent.setup();
    const onWriteOnly = vi.fn();
    renderInspector({
      dataError: new VaultError('authorization', { status: 403 }),
      historyError: new VaultError('authorization', { status: 403 }),
    }, {
      permissions: {
        ...permissions,
        canReadData: false,
        canReadMetadata: false,
        canCreate: true,
        canUpdate: true,
      },
      onWriteOnly,
    });

    expect(screen.getByText('Write-only access is available')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Write new version…' }));
    expect(onWriteOnly).toHaveBeenCalledOnce();
  });

  it('labels comparison and destructive version actions explicitly', async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    const onDeleteLatest = vi.fn();
    const onDestroyVersion = vi.fn();
    renderInspector({ secret, history }, {
      permissions: {
        ...permissions,
        canReadMetadata: true,
        canDeleteLatest: true,
        canDeleteVersions: true,
        canDestroy: true,
      },
      onCompare,
      onDeleteLatest,
      onDestroyVersion,
    });

    await user.click(screen.getByRole('tab', { name: /Versions.*2/ }));
    await user.click(screen.getByRole('button', { name: 'Compare version 3' }));
    expect(onCompare).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Version actions for version 3' }));
    expect(screen.getByText('Soft-delete version')).toBeVisible();
    expect(screen.getByText('Permanently destroy version')).toBeVisible();
    expect(screen.getByText('Irreversible. The data cannot be recovered.')).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Delete current version 3' }));
    expect(onDeleteLatest).toHaveBeenCalledWith(3);
    expect(screen.getByRole('button', { name: 'Version actions for version 3' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Version actions for version 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Destroy version 2' }));
    expect(onDestroyVersion).toHaveBeenCalledWith(2);
  });

  it('allows a soft-deleted version to be permanently destroyed', async () => {
    const user = userEvent.setup();
    const onDestroyVersion = vi.fn();
    renderInspector({
      history: {
        ...history,
        versions: [{
          ...history.versions[0],
          deletionTime: '2026-07-23T02:00:00Z',
        }],
      },
      dataError: new VaultError('not-found'),
    }, {
      permissions: { ...permissions, canReadMetadata: true, canDestroy: true },
      onDestroyVersion,
    });

    await user.click(screen.getByRole('tab', { name: /Versions.*1/ }));
    await user.click(screen.getByRole('button', { name: 'Version actions for version 3' }));
    await user.click(screen.getByRole('menuitem', { name: 'Destroy version 3' }));
    expect(onDestroyVersion).toHaveBeenCalledWith(3);
  });

  it('keeps permanent key deletion available when metadata cannot be read', async () => {
    const user = userEvent.setup();
    const onDeleteMetadata = vi.fn();
    renderInspector({
      secret,
      historyError: new VaultError('authorization', { status: 403 }),
    }, {
      permissions: { ...permissions, canDeleteMetadata: true },
      onDeleteMetadata,
    });

    await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    await user.click(screen.getByRole('button', { name: 'Delete key permanently' }));
    expect(onDeleteMetadata).toHaveBeenCalledOnce();
  });

  it('shows complete key metadata and only edits with read plus update access', async () => {
    const user = userEvent.setup();
    const onEditMetadata = vi.fn();
    renderInspector({ secret, history }, {
      permissions: {
        ...permissions,
        canReadMetadata: true,
        canUpdateMetadata: true,
      },
      onEditMetadata,
    });

    await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    expect(screen.getByText('Maximum versions').nextSibling).toHaveTextContent('10');
    expect(screen.getByText('Check-and-set required').nextSibling).toHaveTextContent('No');
    expect(screen.getByText('Delete version after').nextSibling).toHaveTextContent('Disabled');
    expect(screen.getByText('owner').nextSibling).toHaveTextContent('billing');
    await user.click(screen.getByRole('button', { name: 'Edit key metadata' }));
    expect(onEditMetadata).toHaveBeenCalledOnce();
  });

  it('pins the selected secret from the data header', async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    const { rerender } = render(
      <Inspector
        state={{ status: 'success', data: { secret, history } }}
        mount="applications"
        path="billing/database"
        onRetry={vi.fn()}
        permissions={permissions}
        favorite={false}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    await user.click(screen.getByRole('button', {
      name: 'Pin secret applications/billing/database',
    }));
    expect(onToggleFavorite).toHaveBeenCalledOnce();

    rerender(
      <Inspector
        state={{ status: 'success', data: { secret, history } }}
        mount="applications"
        path="billing/database"
        onRetry={vi.fn()}
        permissions={permissions}
        favorite
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByRole('button', {
      name: 'Unpin secret applications/billing/database',
    })).toHaveAttribute('aria-pressed', 'true');
  });
});
