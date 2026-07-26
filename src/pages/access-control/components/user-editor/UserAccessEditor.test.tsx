import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryRouter,
  RouterProvider,
} from 'react-router-dom';

import type {
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import type { CreateUserAccessCatalog } from '../create-user/access';
import UserAccessEditor from './UserAccessEditor';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

const entity: VaultIdentityEntity = {
  id: 'entity-alice',
  name: 'Alice Operator',
  disabled: false,
  policies: [],
  groupIds: [],
  aliases: [{
    id: 'alias-alice',
    name: 'alice',
    canonicalId: 'entity-alice',
    mountAccessor: 'auth_userpass_123',
  }],
  metadata: { managed_by: 'vault-console' },
};

const group: VaultIdentityGroup = {
  id: 'group-platform',
  name: 'Platform',
  type: 'internal',
  policies: ['vc-role-reader'],
  memberEntityIds: [],
  memberGroupIds: [],
  metadata: { managed_by: 'vault-console' },
};

const catalog: CreateUserAccessCatalog = {
  groups: [{
    id: 'group-platform',
    name: 'Platform',
    roleIds: ['vc-role-reader'],
    policyNames: [],
  }],
  roles: [{
    id: 'vc-role-reader',
    name: 'Reader',
    policyNames: ['vc-role-reader'],
  }],
  policies: [{
    name: 'vc-role-reader',
    managed: true,
    rules: [{
      pattern: 'applications/data/*',
      capabilities: ['read'],
    }],
  }],
  tree: [{
    id: 'applications:',
    label: 'applications',
    mount: 'applications',
    path: '',
    target: 'folder',
    children: [],
  }],
};

function gateway() {
  let currentGroup = group;
  let currentEntity = entity;
  let policies = ['default'];
  const access = vaultAccessControlGatewayMock({
    readUserpassAccount: vi.fn(async () => ({
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: policies,
      tokenTtlSeconds: 3600,
    })),
    lookupEntityByAlias: vi.fn(async () => currentEntity),
    listGroups: vi.fn(async () => [currentGroup]),
    listEntities: vi.fn(async () => [currentEntity]),
    listAuthMounts: vi.fn(async () => [{
      path: 'userpass',
      accessor: 'auth_userpass_123',
      type: 'userpass',
      description: '',
    }]),
    listUserpassAccounts: vi.fn(async () => [{
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: policies,
    }]),
    getCapabilities: vi.fn(async (_session, paths) => Object.fromEntries(
      paths.map((path) => [path, ['update'] as const]),
    )),
    updateGroup: vi.fn(async (_session, _id, next) => {
      currentGroup = {
        ...currentGroup,
        ...next,
        id: currentGroup.id,
        type: 'internal',
      };
    }),
    readGroup: vi.fn(async () => currentGroup),
    updateUserpassPolicies: vi.fn(async (_session, _mount, _username, next) => {
      policies = [...next];
    }),
    updateEntity: vi.fn(async (_session, _id, next) => {
      currentEntity = { ...currentEntity, ...next };
    }),
    readEntity: vi.fn(async () => currentEntity),
  });
  return access;
}

function renderEditor(access = gateway(), onDone = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter([{
    path: '/',
    element: (
      <QueryClientProvider client={queryClient}>
        <UserAccessEditor
          reference={{
            username: 'alice',
            mount: 'userpass',
            mountAccessor: 'auth_userpass_123',
          }}
          catalog={catalog}
          gateway={access}
          session={session}
          onClose={vi.fn()}
          onDone={onDone}
        />
      </QueryClientProvider>
    ),
  }]);
  render(<RouterProvider router={router} />);
  return { access, onDone };
}

describe('UserAccessEditor', () => {
  it('moves through dedicated steps and exposes read-only token settings', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Alice Operator' })).toBeVisible();
    expect(screen.getByText('1h')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Groups & roles/ }));
    expect(screen.getByRole('heading', { name: 'Groups and direct roles' })).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /Platform/ }));
    await user.click(screen.getByRole('button', { name: /Review/ }));
    expect(screen.getByRole('heading', { name: 'Review before Vault changes' })).toBeVisible();
    expect(screen.getByText(/Add user to Platform/)).toBeVisible();
  });

  it('applies a reviewed user change and returns to the detail callback', async () => {
    const user = userEvent.setup();
    const { access, onDone } = renderEditor();

    await screen.findByRole('heading', { name: 'Alice Operator' });
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Alice Platform');
    await user.click(screen.getByRole('button', { name: /Review/ }));
    await user.click(screen.getByRole('button', { name: 'Apply 1 change' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(access.updateEntity).toHaveBeenCalled();
  });
});
