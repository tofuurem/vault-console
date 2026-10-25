import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  VaultSessionContext,
  type VaultSessionContextValue,
} from '@/application/vault/VaultSessionContext';
import type { AuditGateway, AuditPage } from '@/domain/audit/audit-events';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import ActivityPage from './page';

function page(paths: readonly string[], exhausted = false): AuditPage {
  return {
    events: paths.map((path, index) => ({
      time: `2026-10-25T10:0${index}:00Z`,
      requestId: `r-${path}`,
      operation: 'update',
      path,
      actor: 'alice',
      outcome: path.includes('denied') ? 'error' : 'ok',
      error: path.includes('denied') ? 'permission denied' : undefined,
    })),
    scannedBytes: 4096,
    exhausted,
    nextBefore: exhausted ? undefined : '2026-10-25T10:00:00Z',
  };
}

function renderPage(gateway: AuditGateway) {
  const session = {
    session: { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' },
    expireSession: vi.fn(),
  } as unknown as VaultSessionContextValue;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VaultSessionContext.Provider value={session}>
        <ActivityPage gateway={gateway} />
      </VaultSessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('ActivityPage', () => {
  it('lists newest events, filters them, and loads older pages', async () => {
    const user = userEvent.setup();
    const gateway: AuditGateway = {
      status: vi.fn(async () => ({ available: true, sizeBytes: 3 * 1024 * 1024 })),
      events: vi.fn(async (_session, filter, before) => (
        before ? page(['applications/data/older'], true) : page(filter.text ? ['applications/data/denied'] : ['applications/data/a'])
      )),
    };
    renderPage(gateway);

    expect(await screen.findByText('applications/data/a')).toBeVisible();
    expect(screen.getByText(/Log size 3.0 MB/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Load older activity' }));
    expect(await screen.findByText('applications/data/older')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Load older activity' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search'), 'denied');
    expect(await screen.findByText('permission denied')).toBeVisible();
    await waitFor(() => expect(gateway.events).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ text: 'denied' }),
      undefined,
      expect.any(AbortSignal),
    ));
  });

  it('explains missing setup and missing permission', async () => {
    renderPage({
      status: vi.fn(async () => { throw new VaultError('not-found', { status: 404 }); }),
      events: vi.fn(async () => page([])),
    });
    expect(await screen.findByRole('heading', { name: 'The activity log is not set up' })).toBeVisible();
  });

  it('explains when the policy does not allow reading audit data', async () => {
    renderPage({
      status: vi.fn(async () => { throw new VaultError('authorization', { status: 403 }); }),
      events: vi.fn(async () => page([])),
    });
    expect(await screen.findByRole('heading', { name: 'You cannot view the activity log' })).toBeVisible();
  });
});
