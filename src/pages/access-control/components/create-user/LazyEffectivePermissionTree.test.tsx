import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createVaultQueryClient } from '@/application/query/query-client';
import { KvV2GatewayContext } from '@/application/vault/KvV2GatewayContext';
import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import type { KvV2Gateway, VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import LazyEffectivePermissionTree from './LazyEffectivePermissionTree';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};
const roots: readonly KvAccessTreeNode[] = [{
  id: 'applications:',
  label: 'applications',
  mount: 'applications',
  path: '',
  target: 'folder',
  children: [],
}];

function gateway(): KvV2Gateway {
  return {
    listMounts: vi.fn(),
    createKvV2Mount: vi.fn(),
    listPaths: vi.fn(async (_session, _mount, path) => (
      path === '' ? ['billing/', 'shared'] : ['database']
    )),
    readSecret: vi.fn(),
    writeSecret: vi.fn(),
    readSecretHistory: vi.fn(),
    deleteLatestVersion: vi.fn(),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(),
    destroyVersions: vi.fn(),
    deleteMetadata: vi.fn(),
  };
}

describe('LazyEffectivePermissionTree', () => {
  it('requests exactly one uncached prefix per expansion and reuses cached children', async () => {
    const user = userEvent.setup();
    const kv = gateway();
    render(
      <QueryClientProvider client={createVaultQueryClient()}>
        <KvV2GatewayContext.Provider value={kv}>
          <LazyEffectivePermissionTree
            nodes={roots}
            rules={[]}
            directRules={[]}
            session={session}
            onDirectRuleChange={vi.fn()}
          />
        </KvV2GatewayContext.Provider>
      </QueryClientProvider>,
    );

    expect(kv.listPaths).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Expand applications/' }));
    await screen.findByText('billing');
    expect(kv.listPaths).toHaveBeenCalledTimes(1);
    expect(kv.listPaths).toHaveBeenLastCalledWith(session, 'applications', '', expect.any(AbortSignal));

    await user.click(screen.getByRole('button', { name: 'Expand applications/billing' }));
    await screen.findByText('database');
    expect(kv.listPaths).toHaveBeenCalledTimes(2);
    expect(kv.listPaths).toHaveBeenLastCalledWith(session, 'applications', 'billing/', expect.any(AbortSignal));

    await user.click(screen.getByRole('button', { name: 'Collapse applications/billing' }));
    await user.click(screen.getByRole('button', { name: 'Expand applications/billing' }));
    await waitFor(() => expect(screen.getByText('database')).toBeVisible());
    expect(kv.listPaths).toHaveBeenCalledTimes(2);
  });

  it('shows a forbidden prefix as a scoped node state', async () => {
    const user = userEvent.setup();
    const kv = gateway();
    kv.listPaths = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    render(
      <QueryClientProvider client={createVaultQueryClient()}>
        <KvV2GatewayContext.Provider value={kv}>
          <LazyEffectivePermissionTree
            nodes={roots}
            rules={[]}
            directRules={[]}
            session={session}
            onDirectRuleChange={vi.fn()}
          />
        </KvV2GatewayContext.Provider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Expand applications/' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This token cannot list this prefix.');
    expect(screen.getByTestId('permission-node-applications:')).toBeVisible();
  });
});
