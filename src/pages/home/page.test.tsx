import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedShellContextValue } from '@/app/authenticated-shell';
import {
  NavigationHistoryContext,
  type NavigationHistoryContextValue,
} from '@/application/navigation-history/NavigationHistoryContext';
import { VaultSessionContext, type VaultSessionContextValue } from '@/application/vault/VaultSessionContext';
import { VaultError } from '@/domain/vault/errors';
import { testVaultSession, vaultSessionContextValue } from '@/test/vault-session-context';
import HomePage from './page';

function history(overrides: Partial<NavigationHistoryContextValue> = {}): NavigationHistoryContextValue {
  return {
    recents: [],
    favorites: [],
    persistence: 'local',
    recordRecent: vi.fn(),
    toggleFavorite: vi.fn(),
    isFavorite: vi.fn(() => false),
    removeSecretPaths: vi.fn(),
    clearLocalNavigationData: vi.fn(),
    ...overrides,
  };
}

const MOUNTS_LOADED: AuthenticatedShellContextValue = {
  mountsState: {
    status: 'success',
    data: [
      { path: 'applications', accessor: 'kv_apps', description: 'Application secrets', version: 2 },
      { path: 'team space', accessor: 'kv_team', description: '', version: 2 },
    ],
  },
  refreshMounts: vi.fn(),
};

function CurrentLocation() {
  const location = useLocation();
  return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output>;
}

function renderHome({
  vault = vaultSessionContextValue(),
  navigation = history(),
  shell = MOUNTS_LOADED,
}: {
  readonly vault?: VaultSessionContextValue;
  readonly navigation?: NavigationHistoryContextValue;
  readonly shell?: AuthenticatedShellContextValue;
} = {}) {
  return render(
    <VaultSessionContext.Provider value={vault}>
      <NavigationHistoryContext.Provider value={navigation}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route element={<Outlet context={shell} />}>
              <Route path="/home" element={<HomePage />} />
              <Route path="*" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </NavigationHistoryContext.Provider>
    </VaultSessionContext.Provider>,
  );
}

function card(name: string) {
  return screen.getByRole('region', { name });
}

describe('HomePage', () => {
  it('summarizes Vault status and the current session', () => {
    renderHome({
      vault: vaultSessionContextValue({
        session: {
          ...testVaultSession,
          authMethod: 'userpass',
          expiresAt: Date.now() + 2 * 3_600_000 + 5 * 60_000,
          renewable: true,
        },
      }),
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    const status = card('Vault status');
    expect(within(status).getByText('Unsealed')).toBeVisible();
    expect(within(status).getByText('Active')).toBeVisible();
    expect(within(status).getByText('1.21.3')).toBeVisible();
    expect(within(status).getByText('Enabled')).toBeVisible();
    expect(within(status).getByText('https://vault.example.test')).toBeVisible();

    const session = card('Current session');
    expect(within(session).getByText('reader')).toBeVisible();
    expect(within(session).getByText('Username and password')).toBeVisible();
    expect(within(session).getByText(/^2h \d+m remaining$/)).toHaveClass('tabular-nums');
    expect(within(session).getByText('Yes')).toBeVisible();
  });

  it('links a sealed Vault to the unseal page and flags a standby node without TLS', async () => {
    const user = userEvent.setup();
    renderHome({
      vault: vaultSessionContextValue({
        session: { ...testVaultSession, serverUrl: 'http://vault.internal:8200' },
        health: { initialized: true, sealed: true, standby: true },
      }),
    });

    const status = card('Vault status');
    expect(within(status).getByText('Sealed')).toBeVisible();
    expect(within(status).getByText('Standby')).toBeVisible();
    expect(within(status).getByText('Not reported')).toBeVisible();
    expect(within(status).getByText('Not enabled')).toBeVisible();
    await user.click(within(status).getByRole('link', { name: 'Unseal Vault' }));
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/unseal');
  });

  it('shows calm empty states for favorites and recent secrets', () => {
    renderHome();

    expect(within(card('Favorites')).getByText('No favorites yet')).toBeVisible();
    expect(within(card('Recent secrets')).getByText('Nothing opened yet')).toBeVisible();
    expect(within(card('Favorites')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('links favorites and recents to the right Explorer locations', async () => {
    const user = userEvent.setup();
    renderHome({
      navigation: history({
        favorites: [
          { mount: 'applications', path: 'billing/', kind: 'folder', pinnedAt: 1 },
          { mount: 'applications', path: 'billing/database', kind: 'secret', pinnedAt: 2 },
        ],
        recents: [
          { mount: 'applications', path: 'shared', kind: 'secret', visitedAt: Date.now() - 3 * 3_600_000 },
        ],
      }),
    });

    const favorites = card('Favorites');
    expect(within(favorites).getByRole('link', { name: /applications\/billing\/$/ }))
      .toHaveAttribute('href', '/explorer/applications/billing/');
    expect(within(favorites).getByRole('link', { name: /applications\/billing\/database/ }))
      .toHaveAttribute('href', '/explorer/applications/billing/?secret=billing%2Fdatabase');

    const recents = card('Recent secrets');
    expect(within(recents).getByText('3h ago').tagName).toBe('TIME');
    await user.click(within(recents).getByRole('link', { name: /applications\/shared/ }));
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/explorer/applications?secret=shared');
  });

  it('lists KV mounts with links and offers the Access Center when permitted', () => {
    renderHome();

    const mounts = card('KV mounts');
    expect(within(mounts).getByRole('link', { name: /applications\/\s*Application secrets/ }))
      .toHaveAttribute('href', '/explorer/applications');
    expect(within(mounts).getByRole('link', { name: 'team space/' }))
      .toHaveAttribute('href', '/explorer/team%20space');
    expect(within(card('Access Center')).getByRole('link', { name: 'Open Access Center' }))
      .toHaveAttribute('href', '/access-control/users');
  });

  it('hides the Access Center when the policy denies it', () => {
    renderHome({
      vault: vaultSessionContextValue({
        accessControlPermission: { state: 'denied', reason: 'Denied.' },
      }),
    });

    expect(screen.queryByRole('region', { name: 'Access Center' })).not.toBeInTheDocument();
  });

  it('handles loading, failed and empty mount lists', async () => {
    const user = userEvent.setup();
    const refreshMounts = vi.fn();
    const view = renderHome({ shell: { mountsState: { status: 'loading' }, refreshMounts } });
    expect(within(card('KV mounts')).getByLabelText('Loading KV mounts')).toHaveAttribute('aria-busy', 'true');
    view.unmount();

    const failed = renderHome({
      shell: { mountsState: { status: 'error', error: new VaultError('unavailable') }, refreshMounts },
    });
    expect(within(card('KV mounts')).getByRole('alert')).toHaveTextContent('Vault is currently unavailable.');
    await user.click(within(card('KV mounts')).getByRole('button', { name: 'Try again' }));
    expect(refreshMounts).toHaveBeenCalledOnce();
    failed.unmount();

    renderHome({ shell: { mountsState: { status: 'success', data: [] }, refreshMounts } });
    expect(within(card('KV mounts')).getByText('No KV v2 mounts are visible')).toBeVisible();
  });
});
