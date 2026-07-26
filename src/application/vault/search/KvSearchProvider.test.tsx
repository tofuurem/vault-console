import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { KvV2Gateway, VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { useKvSearch } from './KvSearchContext';
import { KvSearchProvider } from './KvSearchProvider';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.search'),
  authMethod: 'token',
  displayName: 'searcher',
};

function gateway(listPaths: KvV2Gateway['listPaths']): KvV2Gateway {
  return {
    listMounts: vi.fn(),
    createKvV2Mount: vi.fn(),
    listPaths,
    readSecret: vi.fn(),
    writeSecret: vi.fn(),
    readSecretHistory: vi.fn(),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(),
    destroyVersions: vi.fn(),
    deleteMetadata: vi.fn(),
  };
}

function SearchHarness() {
  const search = useKvSearch();
  const state = search.stateFor('applications');
  return (
    <>
      <output>{state.status}:{state.entries.length}</output>
      <button type="button" onClick={() => search.start('applications')}>Start</button>
      <button type="button" onClick={() => search.continueScan('applications')}>Continue</button>
      <button type="button" onClick={() => search.activateMount('other')}>Other mount</button>
    </>
  );
}

describe('KvSearchProvider', () => {
  it('does no work until requested and reuses a fresh in-memory result', async () => {
    const user = userEvent.setup();
    const listPaths = vi.fn(async () => ['one']);

    render(
      <KvSearchProvider session={session} gateway={gateway(listPaths)}>
        <SearchHarness />
      </KvSearchProvider>,
    );

    expect(screen.getByText('idle:0')).toBeVisible();
    expect(listPaths).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('complete:1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(listPaths).toHaveBeenCalledTimes(1);
  });

  it('aborts active traversal when the active mount changes', async () => {
    const user = userEvent.setup();
    let observedSignal: AbortSignal | undefined;
    const listPaths = vi.fn(async (
      _session: VaultSession,
      _mount: string,
      _path: string,
      signal?: AbortSignal,
    ): Promise<readonly string[]> => {
      observedSignal = signal;
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(
          new DOMException('cancelled', 'AbortError'),
        ));
      });
    });

    render(
      <KvSearchProvider session={session} gateway={gateway(listPaths)}>
        <SearchHarness />
      </KvSearchProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('scanning:0')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Other mount' }));

    expect(observedSignal?.aborted).toBe(true);
    expect(await screen.findByText('paused:0')).toBeVisible();
  });

  it('expires the session on a global authentication failure', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    const listPaths = vi.fn(async () => {
      throw new VaultError('session-expired');
    });

    render(
      <KvSearchProvider
        session={session}
        gateway={gateway(listPaths)}
        onSessionExpired={onSessionExpired}
      >
        <SearchHarness />
      </KvSearchProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(screen.getByText('paused:0')).toBeVisible();
  });
});
