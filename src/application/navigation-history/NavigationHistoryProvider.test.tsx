import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { VaultSession } from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { useNavigationHistory } from './NavigationHistoryContext';
import { NavigationHistoryProvider } from './NavigationHistoryProvider';
import type { NavigationStorage } from './navigation-history';

class MemoryStorage implements NavigationStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const userpassSession: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.userpass'),
  authMethod: 'userpass',
  displayName: 'alice',
};

function HistoryHarness() {
  const history = useNavigationHistory();
  const target = { mount: 'applications', path: 'platform/api', kind: 'secret' as const };
  return (
    <>
      <output>{history.persistence}:{history.favorites.length}:{history.recents.length}</output>
      <button type="button" onClick={() => history.toggleFavorite(target)}>Toggle favorite</button>
      <button type="button" onClick={() => history.recordRecent(target)}>Record recent</button>
      <button type="button" onClick={history.clearLocalNavigationData}>Clear navigation</button>
    </>
  );
}

describe('NavigationHistoryProvider', () => {
  it('persists stable userpass favorites separately from tab recents', async () => {
    const user = userEvent.setup();
    const tabStorage = new MemoryStorage();
    const persistentStorage = new MemoryStorage();
    const first = render(
      <NavigationHistoryProvider
        session={userpassSession}
        sessionStorage={tabStorage}
        localStorage={persistentStorage}
      >
        <HistoryHarness />
      </NavigationHistoryProvider>,
    );

    expect(await screen.findByText('local:0:0')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Toggle favorite' }));
    await user.click(screen.getByRole('button', { name: 'Record recent' }));
    expect(screen.getByText('local:1:1')).toBeVisible();
    first.unmount();

    render(
      <NavigationHistoryProvider
        session={userpassSession}
        sessionStorage={tabStorage}
        localStorage={persistentStorage}
      >
        <HistoryHarness />
      </NavigationHistoryProvider>,
    );
    expect(await screen.findByText('local:1:1')).toBeVisible();
  });

  it('never writes token favorites to localStorage', async () => {
    const user = userEvent.setup();
    const tabStorage = new MemoryStorage();
    const persistentStorage = new MemoryStorage();
    render(
      <NavigationHistoryProvider
        session={{ ...userpassSession, authMethod: 'token' }}
        sessionStorage={tabStorage}
        localStorage={persistentStorage}
      >
        <HistoryHarness />
      </NavigationHistoryProvider>,
    );

    expect(await screen.findByText('session:0:0')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Toggle favorite' }));
    await waitFor(() => expect(tabStorage.values.size).toBeGreaterThan(0));
    expect(persistentStorage.values.size).toBe(0);
  });

  it('clears both recent and favorite path metadata on request', async () => {
    const user = userEvent.setup();
    render(
      <NavigationHistoryProvider session={userpassSession}>
        <HistoryHarness />
      </NavigationHistoryProvider>,
    );

    await screen.findByText(/local|memory/);
    await user.click(screen.getByRole('button', { name: 'Toggle favorite' }));
    await user.click(screen.getByRole('button', { name: 'Record recent' }));
    await user.click(screen.getByRole('button', { name: 'Clear navigation' }));
    expect(screen.getByText(/:0:0$/)).toBeVisible();
  });
});
