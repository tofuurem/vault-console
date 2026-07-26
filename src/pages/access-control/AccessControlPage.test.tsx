import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { compileKvV2Policy } from '@/domain/access-control/kv-v2-policy-compiler';
import { renderManagedPolicy } from '@/domain/access-control/policy-ownership';
import type {
  KvV2Gateway,
  UserpassLogin,
  VaultAccessControlGateway,
  VaultAuthGateway,
  VaultCapabilityMap,
  VaultHealth,
  VaultIdentityEntity,
  VaultIdentityGroup,
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
  metadata: { managed_by: 'vault-console' },
};

function rolePolicyBody(
  path: string,
  description: string,
  managed = true,
): string {
  const hcl = compileKvV2Policy([{
    mount: 'applications',
    path,
    target: 'folder',
    level: 'view',
    source: {
      kind: 'role',
      id: `vc-role-${path}`,
      label: description,
    },
  }]).hcl;
  return managed
    ? renderManagedPolicy({ kind: 'role', description }, hcl)
    : hcl;
}

function authGateway(): VaultAuthGateway {
  return {
    getHealth: vi.fn(async (): Promise<VaultHealth> => ({ initialized: true, sealed: false, standby: false, version: '1.21.0' })),
    validateToken: vi.fn(async (_serverUrl: string, _token: VaultToken) => session),
    loginUserpass: vi.fn(async (_input: UserpassLogin) => session),
    renewSelf: vi.fn(async () => ({ renewable: false })),
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
    createKvV2Mount: vi.fn(),
    listPaths: vi.fn(async () => []),
    readSecret: vi.fn(),
    writeSecret: vi.fn(),
    readSecretHistory: vi.fn(),
    deleteVersions: vi.fn(),
    undeleteVersions: vi.fn(),
    destroyVersions: vi.fn(),
    deleteMetadata: vi.fn(),
  };
}

function accessGateway(): VaultAccessControlGateway {
  let memberEntityIds = ['entity-alice'];
  let currentGroupName = 'platform-team';
  let createdGroup: VaultIdentityGroup | undefined;
  const rolePolicies = new Map<string, string>([
    [
      'vc-role-platform-readers',
      rolePolicyBody('platform', 'Platform readers'),
    ],
    [
      'vc-role-legacy-readers',
      rolePolicyBody('legacy', 'Legacy readers', false),
    ],
  ]);
  const currentGroup = () => ({
    id: 'platform-team',
    name: currentGroupName,
    type: 'internal' as const,
    policies: ['vc-role-platform-readers'],
    memberEntityIds: [...memberEntityIds],
    memberGroupIds: [],
    metadata: {
      managed_by: 'vault-console',
      schema: '1',
      description: 'Platform team',
    },
  });
  return {
    listAuthMounts: vi.fn(async () => [{ path: 'userpass', accessor: 'auth_userpass_123', type: 'userpass', description: 'People' }]),
    listPolicies: vi.fn(async () => [
      'default',
      ...rolePolicies.keys(),
      'legacy-operator',
    ]),
    readPolicy: vi.fn(async (_session, name) => {
      const rolePolicy = rolePolicies.get(name);
      if (rolePolicy !== undefined) return { name, policy: rolePolicy };
      if (name.startsWith('vc-user-') || name.startsWith('vc-role-')) {
        throw new VaultError('not-found', { status: 404 });
      }
      return {
        name,
        policy: 'path "sys/health" { capabilities = ["read"] }',
      };
    }),
    writePolicy: vi.fn(async (_session, policy) => {
      rolePolicies.set(policy.name, policy.policy);
    }),
    deletePolicy: vi.fn(async (_session, name) => {
      rolePolicies.delete(name);
    }),
    listGroups: vi.fn(async () => [
      currentGroup(),
      ...(createdGroup ? [createdGroup] : []),
    ]),
    readGroup: vi.fn(async (_session, groupId) => (
      groupId === 'created-group' && createdGroup ? createdGroup : currentGroup()
    )),
    createGroup: vi.fn(async (_session, group) => {
      createdGroup = {
        id: 'created-group',
        type: 'internal',
        ...group,
      };
      return 'created-group';
    }),
    updateGroup: vi.fn(async (_session, groupId, group) => {
      if (groupId === 'platform-team') {
        currentGroupName = group.name;
        memberEntityIds = [...group.memberEntityIds];
      }
      if (groupId === 'created-group' && createdGroup) {
        createdGroup = { ...createdGroup, ...group };
      }
    }),
    deleteGroup: vi.fn(async () => undefined),
    updateGroupMembers: vi.fn(async (_session, _group, nextMembers) => {
      memberEntityIds = [...nextMembers];
    }),
    listUserpassAccounts: vi.fn(async () => [{ username: 'alice', mount: 'userpass', tokenPolicies: ['default'] }]),
    readUserpassAccount: vi.fn(async (_session, mount, username) => (
      username === 'alice'
        ? {
            username,
            mount,
            tokenPolicies: ['default'],
          }
        : null
    )),
    createUserpassAccount: vi.fn(async () => undefined),
    updateUserpassPolicies: vi.fn(),
    resetUserpassPassword: vi.fn(),
    deleteUserpassAccount: vi.fn(async () => undefined),
    listEntities: vi.fn(async () => [aliceEntity]),
    readEntityByName: vi.fn(async () => { throw new VaultError('not-found'); }),
    readEntity: vi.fn(async () => aliceEntity),
    lookupEntityByAlias: vi.fn(async (_session, name) => name === 'alice' ? aliceEntity : null),
    createEntity: vi.fn(async () => 'entity-bob'),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(async () => undefined),
    createEntityAlias: vi.fn(async () => 'alias-bob'),
    deleteEntityAlias: vi.fn(async () => undefined),
    getCapabilities: vi.fn(async (_session, paths) => Object.fromEntries(
      paths.map((path) => [path, ['create', 'read', 'update', 'delete'] as const]),
    )),
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
  await screen.findByRole('heading', { name: 'Applications' });
  await waitFor(() => expect(kv.listPaths).toHaveBeenCalled());
  await user.click(await screen.findByRole('button', { name: 'Access Center' }));
  await screen.findByRole('heading', { name: 'Users' });
}

describe('AccessControlPage', () => {
  it('keeps the Users request budget independent from policies, identities, and KV folders', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    const kv = kvGateway();
    access.listPolicies = vi.fn(async () => Array.from({ length: 50 }, (_, index) => `policy-${index}`));

    await loginAndOpenUsers(user, access, kv);
    expect(await screen.findByText('alice')).toBeVisible();

    expect(access.listAuthMounts).toHaveBeenCalledOnce();
    expect(access.listUserpassAccounts).toHaveBeenCalledOnce();
    expect(access.listPolicies).not.toHaveBeenCalled();
    expect(access.readPolicy).not.toHaveBeenCalled();
    expect(access.listGroups).not.toHaveBeenCalled();
    expect(access.lookupEntityByAlias).not.toHaveBeenCalled();
    expect(kv.listPaths).toHaveBeenCalledTimes(1);
    expect(kv.listPaths).toHaveBeenCalledWith(
      session,
      'applications',
      '',
      expect.any(AbortSignal),
    );
  });

  it('opens the selected KV mount when leaving access control', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    const kv = kvGateway();
    await loginAndOpenUsers(user, access, kv);
    const shell = screen.getByTestId('authenticated-app-shell');
    expect(window.location.pathname).toBe('/access-control/users');

    await user.click(screen.getByRole('button', { name: 'Open infrastructure mount' }));

    expect(await screen.findByRole('heading', { name: 'Infrastructure' })).toBeVisible();
    expect(screen.getByTestId('authenticated-app-shell')).toBe(shell);
    expect(window.location.pathname).toBe('/explorer/infrastructure');
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
    expect(screen.getByText('Open profile to load')).toBeVisible();
    expect(access.lookupEntityByAlias).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Groups' }));
    expect(await screen.findByRole('heading', { name: 'Internal groups' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open group platform-team' }));
    expect(await screen.findByRole('heading', { name: 'platform-team' })).toBeVisible();
    expect(screen.getByText(/Delete blocked: Remove every direct member first/)).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/groups/platform-team');
    await user.click(screen.getByRole('button', { name: 'Back to groups' }));
    expect(await screen.findByRole('heading', { name: 'Internal groups' })).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/groups');
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Open group platform-team' }),
    ).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Roles' }));
    expect(await screen.findByRole('heading', { name: 'Roles' })).toBeVisible();
    expect(screen.getByText('Platform Readers')).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/roles');
    await user.click(screen.getByRole('button', {
      name: 'Open role vc-role-platform-readers',
    }));
    expect(await screen.findByRole('heading', { name: 'Platform Readers' })).toBeVisible();
    expect(screen.getByText(/Delete blocked: Detach this role/)).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/roles/vc-role-platform-readers');
    await user.click(screen.getByRole('button', { name: 'Back to roles' }));
    expect(await screen.findByRole('heading', { name: 'Roles' })).toBeVisible();
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Open role vc-role-platform-readers' }),
    ).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Policies' }));
    expect(await screen.findByRole('heading', { name: 'Policy explorer' })).toBeVisible();
    expect(screen.getByText('legacy-operator')).toBeVisible();
    expect(screen.getAllByText('External').length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/access-control/policies');

    await user.click(screen.getByRole('button', { name: 'Users' }));
    const search = screen.getByLabelText('Search users');
    await user.type(search, 'ali');
    await user.click(screen.getByRole('button', { name: 'Open user alice' }));
    await waitFor(() => expect(access.readUserpassAccount).toHaveBeenCalled());
    await waitFor(() => expect(access.lookupEntityByAlias).toHaveBeenCalled());
    await waitFor(() => expect(access.listGroups).toHaveBeenCalled());
    await waitFor(() => expect(access.readPolicy).toHaveBeenCalledWith(
      session,
      'default',
      expect.any(AbortSignal),
    ));
    expect((await screen.findAllByRole('heading', { name: 'Alice' }))[0]).toBeVisible();
    expect(access.lookupEntityByAlias).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/access-control/users/alice');
    expect(window.location.search).toBe('?mount=userpass');

    await user.click(screen.getByRole('button', { name: 'Edit access' }));
    expect(await screen.findByRole('heading', { name: 'Login and Identity' })).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/users/alice/edit');
    expect(window.location.search).toBe('?mount=userpass');

    await user.click(screen.getByRole('button', { name: 'Close access editor' }));
    expect((await screen.findAllByRole('heading', { name: 'Alice' }))[0]).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/users/alice');

    await user.click(screen.getByRole('button', { name: 'Back to users' }));
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeVisible();
    expect(screen.getByLabelText('Search users')).toHaveValue('ali');
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Open user alice' }),
    ).toHaveFocus());
  });

  it('routes duplicate usernames with a reload-stable userpass mount identity', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    access.listAuthMounts = vi.fn(async () => [
      {
        path: 'userpass',
        accessor: 'auth_userpass_123',
        type: 'userpass',
        description: 'People',
      },
      {
        path: 'team/userpass',
        accessor: 'auth_team_userpass_456',
        type: 'userpass',
        description: 'Team people',
      },
    ]);
    access.listUserpassAccounts = vi.fn(async (_session, mount) => [{
      username: 'alice',
      mount,
      tokenPolicies: ['default'],
    }]);
    access.lookupEntityByAlias = vi.fn(async (_session, _name, mountAccessor) => ({
      ...aliceEntity,
      id: mountAccessor,
      name: mountAccessor === 'auth_team_userpass_456' ? 'Team Alice' : 'Default Alice',
      aliases: [{
        ...aliceEntity.aliases[0],
        id: `alias-${mountAccessor}`,
        canonicalId: mountAccessor,
        mountAccessor,
      }],
    }));

    await loginAndOpenUsers(user, access);
    const teamMountCell = await screen.findByText('team/userpass/');
    const teamRow = teamMountCell.closest('tr');
    expect(teamRow).not.toBeNull();
    await user.click(within(teamRow!).getByRole('button', { name: 'Open user alice' }));

    expect((await screen.findAllByRole('heading', { name: 'Team Alice' }))[0]).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/users/alice');
    expect(window.location.search).toBe('?mount=team%2Fuserpass');
    expect(access.lookupEntityByAlias).toHaveBeenCalledWith(
      session,
      'alice',
      'auth_team_userpass_456',
      expect.any(AbortSignal),
    );
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

  it('creates a managed internal group through a reviewed full-screen workspace', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Groups' }));
    await user.click(await screen.findByRole('button', { name: 'Create group' }));

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible();
    await user.type(screen.getByLabelText('Group name'), 'Billing operators');
    await user.type(screen.getByLabelText('Description'), 'Billing production access');
    await user.click(screen.getByRole('button', { name: /Review/ }));
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => expect(access.createGroup).toHaveBeenCalled());
    await waitFor(() => expect(window.location.pathname).toBe(
      '/access-control/groups/created-group',
    ));
    expect(await screen.findByRole('heading', { name: 'Billing operators' })).toHaveFocus();
    expect(access.createGroup).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        name: 'Billing operators',
        metadata: expect.objectContaining({
          managed_by: 'vault-console',
          description: 'Billing production access',
        }),
      }),
      undefined,
    );
  });

  it('edits a managed group without replacing its preserved relationships', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Groups' }));
    await user.click(await screen.findByRole('button', { name: 'Open group platform-team' }));
    await user.click(await screen.findByRole('button', { name: 'Edit group' }));

    const name = await screen.findByLabelText('Group name');
    await user.clear(name);
    await user.type(name, 'Platform operators');
    await user.click(screen.getByRole('button', { name: /Review/ }));
    await user.click(screen.getByRole('button', { name: 'Apply group change' }));

    await waitFor(() => expect(
      screen.getByRole('heading', { name: 'Platform operators' }),
    ).toBeVisible());
    expect(window.location.pathname).toBe('/access-control/groups/platform-team');
    expect(access.updateGroup).toHaveBeenCalledWith(
      session,
      'platform-team',
      expect.objectContaining({
        name: 'Platform operators',
        policies: ['vc-role-platform-readers'],
        memberEntityIds: ['entity-alice'],
        memberGroupIds: [],
      }),
      undefined,
    );
  });

  it('creates a canonical managed role through the reviewed visual workspace', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Roles' }));
    await user.click(await screen.findByRole('button', { name: 'Create role' }));

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible();
    await user.type(screen.getByLabelText('Role identifier'), 'billing-reader');
    await user.type(screen.getByLabelText('Description'), 'Billing read access');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.type(screen.getByLabelText('Logical path'), 'billing');
    await user.click(screen.getByRole('button', { name: 'Add target' }));
    await user.click(screen.getByRole('button', { name: /Review/ }));
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(access.writePolicy).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        name: 'vc-role-billing-reader',
        policy: expect.stringContaining(
          '# vault-console: {"schema":1,"kind":"role","description":"Billing read access"}',
        ),
      }),
      undefined,
    ));
    await waitFor(() => expect(window.location.pathname).toBe(
      '/access-control/roles/vc-role-billing-reader',
    ));
    expect(await screen.findByRole('heading', { name: 'Billing Reader' })).toHaveFocus();
  });

  it('refreshes cached role bodies as well as the policy-name list', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Roles' }));

    expect(await screen.findByText('Platform readers')).toBeVisible();
    await access.writePolicy(
      session,
      {
        name: 'vc-role-platform-readers',
        policy: rolePolicyBody('platform', 'Updated outside Vault Console'),
      },
      undefined,
    );
    await user.click(screen.getByRole('button', { name: 'Refresh roles' }));

    await waitFor(() => expect(
      screen.getByText('Updated outside Vault Console'),
    ).toBeVisible());
  });

  it('guards every route change from a dirty access workspace', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Roles' }));
    await user.click(await screen.findByRole('button', { name: 'Create role' }));
    await user.type(await screen.findByLabelText('Role identifier'), 'draft-role');

    await user.click(screen.getByRole('button', { name: 'Groups' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(
      'Discard unsaved access changes?',
    ));
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/access-control/roles/new');
    expect(screen.getByLabelText('Role identifier')).toHaveValue('draft-role');

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Groups' }));
    expect(await screen.findByRole('heading', { name: 'Internal groups' })).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe('/access-control/groups');
  });

  it('edits a managed role and preserves its canonical policy identity', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Roles' }));
    await user.click(await screen.findByRole('button', {
      name: 'Open role vc-role-platform-readers',
    }));
    await user.click(await screen.findByRole('button', { name: 'Edit role' }));

    const description = await screen.findByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'Platform production readers');
    await user.click(screen.getByRole('button', { name: /Review/ }));
    await user.click(screen.getByRole('button', { name: 'Apply role change' }));

    await waitFor(() => expect(access.writePolicy).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        name: 'vc-role-platform-readers',
        policy: expect.stringContaining(
          '"description":"Platform production readers"',
        ),
      }),
      undefined,
    ));
    expect(await screen.findByRole('heading', { name: 'Platform Readers' })).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/roles/vc-role-platform-readers');
  });

  it('adopts a canonical unverified role without changing its capabilities', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    const original = rolePolicyBody('legacy', 'Legacy readers', false);
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Roles' }));
    await user.click(await screen.findByRole('button', {
      name: 'Open role vc-role-legacy-readers',
    }));
    await user.click(await screen.findByRole('button', { name: 'Adopt role' }));

    await user.type(await screen.findByLabelText('Description'), 'Adopted legacy readers');
    await user.click(screen.getByRole('button', { name: /Review/ }));
    await user.click(screen.getByRole('button', { name: 'Adopt role' }));

    await waitFor(() => expect(access.writePolicy).toHaveBeenCalledWith(
      session,
      {
        name: 'vc-role-legacy-readers',
        policy: [
          '# vault-console: {"schema":1,"kind":"role","description":"Adopted legacy readers"}',
          '',
          original,
        ].join('\n'),
      },
      undefined,
    ));
    expect(await screen.findByRole('heading', { name: 'Legacy Readers' })).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/roles/vc-role-legacy-readers');
  });

  it('deletes an unreferenced managed role only after exact typed confirmation', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    access.listGroups = vi.fn(async () => []);
    access.listEntities = vi.fn(async () => []);
    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Roles' }));
    await user.click(await screen.findByRole('button', {
      name: 'Open role vc-role-platform-readers',
    }));

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    await user.click(deleteButton);
    await user.type(
      screen.getByLabelText(/Type vc-role-platform-readers to confirm/),
      'vc-role-platform-readers',
    );
    await user.click(screen.getByRole('button', { name: 'Delete role permanently' }));

    await waitFor(() => expect(access.deletePolicy).toHaveBeenCalledWith(
      session,
      'vc-role-platform-readers',
      undefined,
    ));
    expect(await screen.findByRole('heading', { name: 'Roles' })).toBeVisible();
    expect(screen.queryByText('Platform Readers')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/access-control/roles');
  });

  it('keeps removed Identity tombstones separate and requires a guarded purge', async () => {
    const user = userEvent.setup();
    const access = accessGateway();
    let deleted = false;
    const tombstone: VaultIdentityEntity = {
      ...aliceEntity,
      disabled: true,
      policies: [],
      groupIds: [],
      aliases: [],
      metadata: {
        managed_by: 'vault-console',
        lifecycle_state: 'login-removed',
        username: 'alice',
        auth_mount: 'userpass',
      },
    };
    access.listEntities = vi.fn(async () => deleted ? [] : [tombstone]);
    access.listGroups = vi.fn(async () => []);
    access.readEntity = vi.fn(async () => {
      if (deleted) throw new VaultError('not-found', { status: 404 });
      return tombstone;
    });
    access.readUserpassAccount = vi.fn(async () => null);
    access.deleteEntity = vi.fn(async () => {
      deleted = true;
    });

    await loginAndOpenUsers(user, access);
    await user.click(screen.getByRole('button', { name: 'Removed identities' }));

    expect(await screen.findByRole('heading', { name: 'Removed identities' })).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/removed-identities');
    await user.click(screen.getByRole('button', { name: 'Open removed identity alice' }));

    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeVisible();
    expect(screen.getByText('Blocked by Identity, not revoked')).toBeVisible();
    await user.type(screen.getByLabelText(/Type Alice to confirm/), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Purge Identity permanently' }));

    expect(await screen.findByText('No removed Identity tombstones')).toBeVisible();
    expect(window.location.pathname).toBe('/access-control/removed-identities');
    expect(access.deleteEntity).toHaveBeenCalledWith(
      session,
      'entity-alice',
      undefined,
    );
  });
});
