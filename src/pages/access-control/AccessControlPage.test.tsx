import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';
import type {
  KvV2Gateway,
  UserpassLogin,
  VaultAccessControlGateway,
  VaultAuthGateway,
  VaultCapabilityMap,
  VaultHealth,
  VaultIdentityEntity,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken, type VaultToken } from '@/domain/vault/sensitive-value';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
  displayName: 'operator',
};
const aliceEntity: VaultIdentityEntity = {
  id: 'entity-alice',
  name: 'Alice',
  disabled: false,
  policies: [],
  groupIds: ['platform-team'],
  aliases: [{
    id: 'alias-alice',
    name: 'alice',
    canonicalId: 'entity-alice',
    mountAccessor: 'auth_userpass_123',
  }],
};

function authGateway(): VaultAuthGateway {
  return {
    getHealth: vi.fn(async (): Promise<VaultHealth> => ({ initialized: true, sealed: false, standby: false, version: '1.21.0' })),
    validateToken: vi.fn(async (_serverUrl: string, _token: VaultToken) => session),
    loginUserpass: vi.fn(async (_input: UserpassLogin) => session),
    getCapabilities: vi.fn(async (_session, paths): Promise<VaultCapabilityMap> => Object.fromEntries(
      paths.map((path) => [path, ['create', 'read', 'update', 'delete', 'list']]),
    ) as VaultCapabilityMap),
  };
}

function kvGateway(): KvV2Gateway {
  return {
    listMounts: vi.fn(async () => [
      { path: 'applications', accessor: 'kv_apps', description: 'Applications', version: 2 as const },
      { path: 'infrastructure', accessor: 'kv_infra', description: 'Infrastructure', version: 2 as const },
    ]),
    listPaths: vi.fn(async () => []),
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

function accessGateway(): VaultAccessControlGateway {
  const group = {
    id: 'platform-team',
    name: 'platform-team',
    policies: ['vc-role-platform-readers'],
    memberEntityIds: ['entity-alice'],
    memberGroupIds: [],
    metadata: {},
  } as const;
  return {
    listAuthMounts: vi.fn(async () => [{ path: 'userpass', accessor: 'auth_userpass_123', type: 'userpass', description: 'People' }]),
    listPolicies: vi.fn(async () => ['default', 'vc-role-platform-readers', 'legacy-operator']),
    readPolicy: vi.fn(async (_session, name) => ({
      name,
      policy: name === 'vc-role-platform-readers'
        ? 'path "applications/metadata/*" { capabilities = ["read", "list"] }'
        : 'path "sys/health" { capabilities = ["read"] }',
    })),
    writePolicy: vi.fn(async () => undefined),
    deletePolicy: vi.fn(async () => undefined),
    listGroups: vi.fn(async () => [group]),
    updateGroupMembers: vi.fn(async () => undefined),
    listUserpassAccounts: vi.fn(async () => [{ username: 'alice', mount: 'userpass', tokenPolicies: ['default'] }]),
    createUserpassAccount: vi.fn(async () => undefined),
    deleteUserpassAccount: vi.fn(async () => undefined),
    readEntityByName: vi.fn(async () => { throw new VaultError('not-found'); }),
    lookupEntityByAlias: vi.fn(async (_session, name) => name === 'alice' ? aliceEntity : null),
    createEntity: vi.fn(async () => 'entity-bob'),
    deleteEntity: vi.fn(async () => undefined),
    createEntityAlias: vi.fn(async () => 'alias-bob'),
    deleteEntityAlias: vi.fn(async () => undefined),
  };
}

async function loginAndOpenUsers(
  user: ReturnType<typeof userEvent.setup>,
  access: VaultAccessControlGateway,
  kv: KvV2Gateway = kvGateway(),
) {
  window.history.replaceState({}, '', '/login');
  render(<App authGateway={authGateway()} kvV2Gateway={kv} accessControlGateway={access} />);
  await user.type(screen.getByLabelText('Vault token'), 'hvs.admin');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await user.click(await screen.findByRole('button', { name: 'Users' }));
  await screen.findByRole('heading', { name: 'Users' });
}

describe('AccessControlPage', () => {
  it('opens the selected KV mount when leaving access control', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    const kv = kvGateway();
    await loginAndOpenUsers(user, access, kv);

    await user.click(screen.getByRole('button', { name: 'Open infrastructure mount' }));

    expect(await screen.findByRole('heading', { name: 'Infrastructure' })).toBeVisible();
    await waitFor(() => expect(kv.listPaths).toHaveBeenCalledWith(
      session,
      'infrastructure',
      '',
      expect.any(AbortSignal),
    ));
  });

  it('renders live users, groups, managed roles, and external policies', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    await loginAndOpenUsers(user, access);

    expect(screen.getByText('alice')).toBeVisible();
    expect(screen.getByText('Alice')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Groups' }));
    expect(await screen.findByRole('heading', { name: 'Internal groups' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'platform-team' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Roles' }));
    expect(await screen.findByRole('heading', { name: 'Roles' })).toBeVisible();
    expect(screen.getByText('Platform Readers')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Policy Explorer' }));
    expect(await screen.findByRole('heading', { name: 'Policy explorer' })).toBeVisible();
    expect(screen.getByText('legacy-operator')).toBeVisible();
    expect(screen.getAllByText('External').length).toBeGreaterThan(0);
  });

  it('creates a userpass account, identity alias, and selected group membership from the UI', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    await loginAndOpenUsers(user, access);

    await user.click(screen.getByRole('button', { name: /Create user/ }));
    await user.type(screen.getByLabelText(/Username/), 'bob');
    await user.type(screen.getByLabelText(/Display name/), 'Bob');
    await user.click(screen.getByRole('button', { name: /Continue to access/ }));
    await user.click(screen.getByRole('checkbox', { name: /platform-team/i }));
    await user.click(screen.getByRole('button', { name: /Review & create/ }));
    await user.click(await screen.findByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('User created successfully')).toBeVisible();
    expect(access.createUserpassAccount).toHaveBeenCalledWith(
      session,
      'userpass',
      expect.objectContaining({ username: 'bob', tokenPolicies: ['default'] }),
      expect.any(AbortSignal),
    );
    expect(access.createEntity).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ name: 'Bob', policies: [] }),
      expect.any(AbortSignal),
    );
    expect(access.createEntityAlias).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ name: 'bob', canonicalId: 'entity-bob', mountAccessor: 'auth_userpass_123' }),
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(access.updateGroupMembers).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ id: 'platform-team' }),
      ['entity-alice', 'entity-bob'],
      expect.any(AbortSignal),
    ));
  });
});
