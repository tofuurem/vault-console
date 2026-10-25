import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createVaultQueryClient } from '@/application/query/query-client';
import { KvV2GatewayContext } from '@/application/vault/KvV2GatewayContext';
import { VaultSessionContext } from '@/application/vault/VaultSessionContext';
import type { KvV2Gateway } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultSessionContextValue } from '@/test/vault-session-context';
import ExplorerSecretTable from './ExplorerSecretTable';

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0];

class FakeIntersectionObserver {
  static latest: FakeIntersectionObserver | null = null;
  private readonly callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.latest = this;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  reveal(elements: readonly Element[]) {
    this.callback(
      elements.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeIntersectionObserver.latest = null;
});

const entries = [
  { kind: 'folder' as const, name: 'team', path: 'team/' },
  { kind: 'secret' as const, name: 'database', path: 'database' },
  { kind: 'secret' as const, name: 'denied', path: 'denied' },
  { kind: 'secret' as const, name: 'offscreen', path: 'offscreen' },
];

function row(name: string) {
  return screen.getByRole('button', { name: `Inspect secret ${name}` }).closest('tr')!;
}

describe('ExplorerSecretTable', () => {
  it('loads metadata only for rows that scrolled into view and hides denials', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const readSecretMetadata = vi.fn(async (_session, _mount, path: string) => {
      if (path === 'denied') throw new VaultError('authorization', { status: 403 });
      return {
        createdTime: '2026-01-01T00:00:00Z',
        updatedTime: new Date(Date.now() - 5 * 60_000).toISOString(),
        currentVersion: 9,
        oldestVersion: 1,
        maxVersions: 0,
        casRequired: false,
        deleteVersionAfter: '0s',
        customMetadata: { owner: 'billing' },
        versions: [],
      };
    });
    render(
      <QueryClientProvider client={createVaultQueryClient()}>
        <VaultSessionContext.Provider value={vaultSessionContextValue()}>
          <KvV2GatewayContext.Provider value={{ readSecretMetadata } as unknown as KvV2Gateway}>
            <ExplorerSecretTable
              mount="applications"
              entries={entries}
              selectedPath={null}
              onNavigateToFolder={vi.fn()}
              onSelectSecret={vi.fn()}
            />
          </KvV2GatewayContext.Provider>
        </VaultSessionContext.Provider>
      </QueryClientProvider>,
    );

    expect(readSecretMetadata).not.toHaveBeenCalled();
    act(() => FakeIntersectionObserver.latest!.reveal([row('database'), row('denied')]));

    expect(await within(row('database')).findByText('5m ago')).toBeInTheDocument();
    expect(within(row('database')).getByText('9')).toBeInTheDocument();
    expect(within(row('database')).getByText('billing')).toBeInTheDocument();
    await waitFor(() => expect(within(row('denied')).getAllByText('—')).toHaveLength(3));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readSecretMetadata).toHaveBeenCalledTimes(2);
    expect(readSecretMetadata).not.toHaveBeenCalledWith(
      expect.anything(),
      'applications',
      'offscreen',
      expect.anything(),
    );
  });

  it('renders the plain table when no Vault data providers are mounted', () => {
    render(
      <ExplorerSecretTable
        mount="applications"
        entries={entries}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
      />,
    );

    expect(within(row('database')).getAllByText('—')).toHaveLength(3);
  });
});
