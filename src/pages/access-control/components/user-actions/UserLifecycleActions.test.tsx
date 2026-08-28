import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  VaultIdentityEntity,
  VaultSession,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import UserLifecycleActions from './UserLifecycleActions';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};
const reference = {
  username: 'alice',
  mount: 'userpass',
  mountAccessor: 'auth_userpass_123',
};

function statefulGateway() {
  let account: VaultUserpassAccount | null = {
    username: 'alice',
    mount: 'userpass',
    tokenPolicies: ['default'],
  };
  let entity: VaultIdentityEntity = {
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
  return vaultAccessControlGatewayMock({
    readUserpassAccount: vi.fn(async () => account),
    lookupEntityByAlias: vi.fn(async () => entity),
    listGroups: vi.fn(async () => []),
    listEntities: vi.fn(async () => [entity]),
    listAuthMounts: vi.fn(async () => [{
      path: 'userpass',
      accessor: 'auth_userpass_123',
      type: 'userpass',
      description: '',
    }]),
    listUserpassAccounts: vi.fn(async () => account ? [account] : []),
    getCapabilities: vi.fn(async (_session, paths: readonly string[]) => Object.fromEntries(
      paths.map((path) => [path, ['create', 'read', 'update', 'delete'] as const]),
    )),
    updateEntity: vi.fn(async (_session, _id, next) => {
      entity = { ...entity, ...next };
    }),
    readEntity: vi.fn(async () => entity),
    deleteUserpassAccount: vi.fn(async () => {
      account = null;
    }),
    deleteEntityAlias: vi.fn(async (_session, aliasId) => {
      entity = {
        ...entity,
        aliases: entity.aliases.filter(({ id }) => id !== aliasId),
      };
    }),
  });
}

function renderActions() {
  const gateway = statefulGateway();
  const onChanged = vi.fn();
  const onRemoved = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <UserLifecycleActions
        reference={reference}
        gateway={gateway}
        session={session}
        onChanged={onChanged}
        onRemoved={onRemoved}
      />
    </QueryClientProvider>,
  );
  return { gateway, onChanged, onRemoved };
}

async function openChoice(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole('button', { name: 'Open account lifecycle actions' }));
  const heading = await screen.findByText(title);
  const card = heading.closest('.rounded-lg');
  if (!(card instanceof HTMLElement)) throw new Error('Expected action card');
  const open = within(card).getByRole('button', { name: 'Open' });
  await waitFor(() => expect(open).toBeEnabled());
  await user.click(open);
}

describe('UserLifecycleActions', () => {
  it('resets a generated password, reveals it only after success, and clears it on exit', async () => {
    const user = userEvent.setup();
    const { gateway } = renderActions();
    await openChoice(user, 'Reset password');

    expect(screen.getByText(/held in memory/i)).toBeVisible();
    expect(screen.queryByLabelText('Reset user password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    const handoff = await screen.findByLabelText('Reset user password');
    const password = (
      gateway.resetUserpassPassword as ReturnType<typeof vi.fn>
    ).mock.calls[0][3].reveal();
    expect(handoff).toHaveValue(password);
    expect(window.location.href).not.toContain(password);
    expect(JSON.stringify(localStorage)).not.toContain(password);
    expect(JSON.stringify(sessionStorage)).not.toContain(password);

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Reset user password')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(password);
  });

  it('disables a managed Identity while explaining that tokens are blocked, not revoked', async () => {
    const user = userEvent.setup();
    const { gateway, onChanged } = renderActions();
    await openChoice(user, 'Disable Identity');

    expect(screen.getByText(/blocked, not revoked/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Disable Identity' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(gateway.updateEntity).toHaveBeenCalledWith(
      session,
      'entity-alice',
      expect.objectContaining({ disabled: true }),
      undefined,
    );
  });

  it('removes a managed login through a typed plan and returns its retained tombstone', async () => {
    const user = userEvent.setup();
    const { gateway, onRemoved } = renderActions();
    await openChoice(user, 'Disable and remove login');

    expect(screen.getByText(/retains a disabled Identity tombstone/i)).toBeVisible();
    await user.type(screen.getByLabelText(/Type alice to confirm/), 'alice');
    await user.click(screen.getByRole('button', { name: 'Disable and remove login' }));

    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith('entity-alice'));
    expect(gateway.deleteUserpassAccount).toHaveBeenCalled();
    expect(gateway.deleteEntityAlias).toHaveBeenCalled();
    expect(gateway.updateEntity).toHaveBeenLastCalledWith(
      session,
      'entity-alice',
      expect.objectContaining({
        disabled: true,
        policies: [],
        metadata: expect.objectContaining({ lifecycle_state: 'login-removed' }),
      }),
      undefined,
    );
  });
});
