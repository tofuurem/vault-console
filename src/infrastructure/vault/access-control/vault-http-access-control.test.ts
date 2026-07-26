import { describe, expect, it, vi } from 'vitest';

import type { VaultSession } from '../../../domain/vault/contracts';
import { vaultPassword, vaultToken } from '../../../domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../http/vault-http-client';
import { VaultAccessControlAdapter } from './vault-access-control-adapter';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

function jsonResponse(body: unknown, status = 200): Response {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
}

describe('VaultAccessControlAdapter', () => {
  it('uses the canonical ACL policy API and supports legacy response shapes', async () => {
    const fetchRequest = vi
      .fn<VaultFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            'userpass/': {
              accessor: 'auth_userpass_123',
              type: 'userpass',
              description: 'People',
            },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ policies: ['default', 'platform-reader'] }))
      .mockResolvedValueOnce(
        jsonResponse({ name: 'platform-reader', rules: 'path "secret/data/*" {}' }),
      )
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(null, 204));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.listAuthMounts(session)).resolves.toEqual([
      {
        path: 'userpass',
        accessor: 'auth_userpass_123',
        type: 'userpass',
        description: 'People',
      },
    ]);
    await expect(gateway.listPolicies(session)).resolves.toEqual(['default', 'platform-reader']);
    await expect(gateway.readPolicy(session, 'platform-reader')).resolves.toEqual({
      name: 'platform-reader',
      policy: 'path "secret/data/*" {}',
    });
    await gateway.writePolicy(session, { name: 'alice-direct', policy: 'path "secret/*" {}' });
    await gateway.deletePolicy(session, 'alice-direct');

    expect(String(fetchRequest.mock.calls[1][0])).toBe(
      'https://vault.example.test/v1/sys/policies/acl?list=true',
    );
    expect(String(fetchRequest.mock.calls[2][0])).toBe(
      'https://vault.example.test/v1/sys/policies/acl/platform-reader',
    );
    expect(String(fetchRequest.mock.calls[3][0])).toBe(
      'https://vault.example.test/v1/sys/policies/acl/alice-direct',
    );
    expect(fetchRequest.mock.calls[3][1]?.body).toBe(
      JSON.stringify({ policy: 'path "secret/*" {}' }),
    );
    expect(String(fetchRequest.mock.calls[4][0])).toBe(
      'https://vault.example.test/v1/sys/policies/acl/alice-direct',
    );
    expect(fetchRequest.mock.calls[4][1]?.method).toBe('DELETE');
  });

  it('loads internal groups and preserves their complete state when updating membership', async () => {
    const fetchRequest = vi.fn<VaultFetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/identity/group/id') && init?.method !== 'POST') {
        return jsonResponse({ data: { keys: ['group-1', 'group-2'] } });
      }
      if (url.pathname.endsWith('/identity/group/id/group-1') && init?.method !== 'POST') {
        return jsonResponse({
          data: {
            id: 'group-1',
            name: 'Platform team',
            type: 'internal',
            policies: ['platform-reader'],
            member_entity_ids: ['entity-1'],
            member_group_ids: ['child-group'],
            metadata: { owner: 'platform' },
          },
        });
      }
      if (url.pathname.endsWith('/identity/group/id/group-2')) {
        return jsonResponse({
          data: {
            id: 'group-2',
            name: 'LDAP team',
            type: 'external',
            policies: [],
            member_entity_ids: [],
            member_group_ids: [],
            metadata: {},
          },
        });
      }
      return jsonResponse({ data: { id: 'group-1' } });
    });
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    const groups = await gateway.listGroups(session);
    expect(groups).toEqual([
      {
        id: 'group-1',
        name: 'Platform team',
        type: 'internal',
        policies: ['platform-reader'],
        memberEntityIds: ['entity-1'],
        memberGroupIds: ['child-group'],
        metadata: { owner: 'platform' },
      },
      {
        id: 'group-2',
        name: 'LDAP team',
        type: 'external',
        policies: [],
        memberEntityIds: [],
        memberGroupIds: [],
        metadata: {},
      },
    ]);

    await gateway.updateGroupMembers(session, groups[0], ['entity-1', 'entity-2']);
    expect(JSON.parse(String(fetchRequest.mock.calls[3][1]?.body))).toEqual({
      name: 'Platform team',
      type: 'internal',
      policies: ['platform-reader'],
      member_entity_ids: ['entity-1', 'entity-2'],
      member_group_ids: ['child-group'],
      metadata: { owner: 'platform' },
    });
  });

  it('treats missing group and user indexes as empty collections', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({ errors: [] }, 404),
    );
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.listGroups(session)).resolves.toEqual([]);
    await expect(gateway.listUserpassAccounts(session, 'userpass')).resolves.toEqual([]);
    await expect(gateway.readUserpassAccount(session, 'userpass', 'missing')).resolves.toBeNull();
  });

  it('reads one current internal group for membership reconciliation', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({
      data: {
        id: 'group-live',
        name: 'Live platform team',
        type: 'internal',
        policies: ['platform-reader'],
        member_entity_ids: ['entity-concurrent'],
        member_group_ids: [],
        metadata: { owner: 'platform' },
      },
    }));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.readGroup(session, 'group-live')).resolves.toEqual({
      id: 'group-live',
      name: 'Live platform team',
      type: 'internal',
      policies: ['platform-reader'],
      memberEntityIds: ['entity-concurrent'],
      memberGroupIds: [],
      metadata: { owner: 'platform' },
    });
    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/identity/group/id/group-live',
    );
  });

  it('lists and mutates userpass accounts at a custom mount without broad updates', async () => {
    const fetchRequest = vi
      .fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { keys: ['alice'] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            token_policies: ['default', 'platform-reader'],
            token_ttl: 3600,
            token_max_ttl: 7200,
            token_explicit_max_ttl: 10800,
            token_bound_cidrs: ['10.0.0.0/8'],
            token_type: 'service',
            token_num_uses: 4,
            token_period: 900,
            token_no_default_policy: false,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(null, 204));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.listUserpassAccounts(session, 'team/userpass')).resolves.toEqual([
      {
        username: 'alice',
        mount: 'team/userpass',
        tokenPolicies: ['default', 'platform-reader'],
        tokenTtlSeconds: 3600,
        tokenMaxTtlSeconds: 7200,
        tokenExplicitMaxTtlSeconds: 10800,
        tokenBoundCidrs: ['10.0.0.0/8'],
        tokenType: 'service',
        tokenNumUses: 4,
        tokenPeriodSeconds: 900,
        tokenNoDefaultPolicy: false,
      },
    ]);
    await gateway.createUserpassAccount(session, 'team/userpass', {
      username: 'bob',
      password: vaultPassword('memory-only'),
      tokenPolicies: ['billing-editor'],
    });
    await gateway.updateUserpassPolicies(
      session,
      'team/userpass',
      'bob',
      ['default', 'billing-reader'],
    );
    await gateway.resetUserpassPassword(
      session,
      'team/userpass',
      'bob',
      vaultPassword('new-memory-only'),
    );
    await gateway.deleteUserpassAccount(session, 'team/userpass', 'bob');

    expect(String(fetchRequest.mock.calls[2][0])).toBe(
      'https://vault.example.test/v1/auth/team/userpass/users/bob',
    );
    expect(fetchRequest.mock.calls[2][1]?.body).toBe(
      JSON.stringify({ password: 'memory-only', token_policies: ['billing-editor'] }),
    );
    expect(String(fetchRequest.mock.calls[3][0])).toBe(
      'https://vault.example.test/v1/auth/team/userpass/users/bob/policies',
    );
    expect(fetchRequest.mock.calls[3][1]?.body).toBe(
      JSON.stringify({ token_policies: ['default', 'billing-reader'] }),
    );
    expect(String(fetchRequest.mock.calls[4][0])).toBe(
      'https://vault.example.test/v1/auth/team/userpass/users/bob/password',
    );
    expect(fetchRequest.mock.calls[4][1]?.body).toBe(
      JSON.stringify({ password: 'new-memory-only' }),
    );
    expect(fetchRequest.mock.calls[5][1]?.method).toBe('DELETE');
  });

  it('reads and mutates entities and aliases through their documented endpoints', async () => {
    const entityPayload = {
      data: {
        id: 'entity-1',
        name: 'alice',
        disabled: false,
        policies: ['direct-policy'],
        group_ids: ['group-1'],
        metadata: { managed_by: 'vault-console', owner: 'platform' },
        aliases: [
          {
            id: 'alias-1',
            name: 'alice',
            canonical_id: 'entity-1',
            mount_accessor: 'auth_userpass_123',
          },
        ],
      },
    };
    const fetchRequest = vi
      .fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse(entityPayload))
      .mockResolvedValueOnce(jsonResponse(entityPayload))
      .mockResolvedValueOnce(jsonResponse({ errors: [] }, 404))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'entity-2' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'alias-2' } }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(null, 204));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.readEntityByName(session, 'alice')).resolves.toEqual({
      id: 'entity-1',
      name: 'alice',
      disabled: false,
      policies: ['direct-policy'],
      groupIds: ['group-1'],
      metadata: { managed_by: 'vault-console', owner: 'platform' },
      aliases: [
        {
          id: 'alias-1',
          name: 'alice',
          canonicalId: 'entity-1',
          mountAccessor: 'auth_userpass_123',
        },
      ],
    });
    await expect(gateway.readEntity(session, 'entity-1')).resolves.toMatchObject({
      id: 'entity-1',
      name: 'alice',
    });
    await expect(
      gateway.lookupEntityByAlias(session, 'missing', 'auth_userpass_123'),
    ).resolves.toBeNull();
    await expect(
      gateway.createEntity(session, { name: 'bob', policies: ['bob-direct'] }),
    ).resolves.toBe('entity-2');
    await expect(
      gateway.createEntityAlias(session, {
        name: 'bob',
        canonicalId: 'entity-2',
        mountAccessor: 'auth_userpass_123',
      }),
    ).resolves.toBe('alias-2');
    await gateway.deleteEntityAlias(session, 'alias-2');
    await gateway.deleteEntity(session, 'entity-2');

    expect(String(fetchRequest.mock.calls[1][0])).toBe(
      'https://vault.example.test/v1/identity/entity/id/entity-1',
    );
    expect(String(fetchRequest.mock.calls[2][0])).toBe(
      'https://vault.example.test/v1/identity/lookup/entity',
    );
    expect(fetchRequest.mock.calls[2][1]?.body).toBe(
      JSON.stringify({ alias_name: 'missing', alias_mount_accessor: 'auth_userpass_123' }),
    );
    expect(String(fetchRequest.mock.calls[4][0])).toBe(
      'https://vault.example.test/v1/identity/entity-alias',
    );
  });

  it('creates, updates, and deletes managed internal groups with complete payloads', async () => {
    const fetchRequest = vi
      .fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'group-new' } }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(null, 204));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));
    const group = {
      name: 'Platform team',
      policies: ['vc-role-platform'],
      memberEntityIds: ['entity-1'],
      memberGroupIds: ['child-1'],
      metadata: { managed_by: 'vault-console', owner: 'platform' },
    };

    await expect(gateway.createGroup(session, group)).resolves.toBe('group-new');
    await gateway.updateGroup(session, 'group-new', {
      ...group,
      name: 'Platform engineering',
    });
    await gateway.deleteGroup(session, 'group-new');

    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/identity/group',
    );
    expect(JSON.parse(String(fetchRequest.mock.calls[0][1]?.body))).toEqual({
      name: 'Platform team',
      type: 'internal',
      policies: ['vc-role-platform'],
      member_entity_ids: ['entity-1'],
      member_group_ids: ['child-1'],
      metadata: { managed_by: 'vault-console', owner: 'platform' },
    });
    expect(String(fetchRequest.mock.calls[1][0])).toBe(
      'https://vault.example.test/v1/identity/group/id/group-new',
    );
    expect(JSON.parse(String(fetchRequest.mock.calls[1][1]?.body))).toMatchObject({
      name: 'Platform engineering',
      type: 'internal',
    });
    expect(fetchRequest.mock.calls[2][1]?.method).toBe('DELETE');
  });

  it('updates complete entities and queries exact plan capabilities', async () => {
    const fetchRequest = vi
      .fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          'identity/entity/id/entity-1': ['read', 'update'],
          'sys/policies/acl/vc-role-reader': ['read'],
        },
      }));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await gateway.updateEntity(session, 'entity-1', {
      name: 'Alice Doe',
      disabled: true,
      policies: ['external-policy'],
      metadata: { managed_by: 'vault-console', lifecycle_state: 'active' },
    });
    await expect(gateway.getCapabilities(session, [
      'identity/entity/id/entity-1',
      'sys/policies/acl/vc-role-reader',
    ])).resolves.toEqual({
      'identity/entity/id/entity-1': ['read', 'update'],
      'sys/policies/acl/vc-role-reader': ['read'],
    });

    expect(JSON.parse(String(fetchRequest.mock.calls[0][1]?.body))).toEqual({
      name: 'Alice Doe',
      disabled: true,
      policies: ['external-policy'],
      metadata: { managed_by: 'vault-console', lifecycle_state: 'active' },
    });
    expect(String(fetchRequest.mock.calls[1][0])).toBe(
      'https://vault.example.test/v1/sys/capabilities-self',
    );
    expect(fetchRequest.mock.calls[1][1]?.body).toBe(JSON.stringify({
      paths: [
        'identity/entity/id/entity-1',
        'sys/policies/acl/vc-role-reader',
      ],
    }));
  });

  it('treats a no-content identity alias lookup as not found', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse(null, 204));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(
      gateway.lookupEntityByAlias(session, 'missing', 'auth_userpass_123'),
    ).resolves.toBeNull();
  });

  it('lists complete identity entities by ID with bounded reads', async () => {
    const fetchRequest = vi.fn<VaultFetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/identity/entity/id')) {
        return jsonResponse({ data: { keys: ['entity-1', 'entity-2'] } });
      }
      const id = url.pathname.split('/').at(-1)!;
      return jsonResponse({
        data: {
          id,
          name: id === 'entity-1' ? 'Alice' : 'Bob',
          disabled: false,
          policies: [],
          group_ids: [],
          aliases: [],
          metadata: {},
        },
      });
    });
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.listEntities(session)).resolves.toEqual([
      expect.objectContaining({ id: 'entity-1', name: 'Alice' }),
      expect.objectContaining({ id: 'entity-2', name: 'Bob' }),
    ]);
    expect(fetchRequest).toHaveBeenCalledTimes(3);
  });
});
