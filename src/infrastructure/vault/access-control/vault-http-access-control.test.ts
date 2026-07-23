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
  it('lists auth mounts and supports legacy ACL policy responses', async () => {
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

    expect(fetchRequest.mock.calls[3][1]?.body).toBe(
      JSON.stringify({ policy: 'path "secret/*" {}' }),
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
        policies: ['platform-reader'],
        memberEntityIds: ['entity-1'],
        memberGroupIds: ['child-group'],
        metadata: { owner: 'platform' },
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
      policies: ['platform-reader'],
      memberEntityIds: ['entity-concurrent'],
      memberGroupIds: [],
      metadata: { owner: 'platform' },
    });
    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/identity/group/id/group-live',
    );
  });

  it('lists, creates, and deletes userpass accounts at a custom mount', async () => {
    const fetchRequest = vi
      .fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { keys: ['alice'] } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { token_policies: ['default', 'platform-reader'] } }),
      )
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(null, 204));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.listUserpassAccounts(session, 'team/userpass')).resolves.toEqual([
      {
        username: 'alice',
        mount: 'team/userpass',
        tokenPolicies: ['default', 'platform-reader'],
      },
    ]);
    await gateway.createUserpassAccount(session, 'team/userpass', {
      username: 'bob',
      password: vaultPassword('memory-only'),
      tokenPolicies: ['billing-editor'],
    });
    await gateway.deleteUserpassAccount(session, 'team/userpass', 'bob');

    expect(String(fetchRequest.mock.calls[2][0])).toBe(
      'https://vault.example.test/v1/auth/team/userpass/users/bob',
    );
    expect(fetchRequest.mock.calls[2][1]?.body).toBe(
      JSON.stringify({ password: 'memory-only', token_policies: ['billing-editor'] }),
    );
    expect(fetchRequest.mock.calls[3][1]?.method).toBe('DELETE');
  });

  it('reads and mutates entities and aliases through their documented endpoints', async () => {
    const entityPayload = {
      data: {
        id: 'entity-1',
        name: 'alice',
        disabled: false,
        policies: ['direct-policy'],
        group_ids: ['group-1'],
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
      aliases: [
        {
          id: 'alias-1',
          name: 'alice',
          canonicalId: 'entity-1',
          mountAccessor: 'auth_userpass_123',
        },
      ],
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
      'https://vault.example.test/v1/identity/lookup/entity',
    );
    expect(fetchRequest.mock.calls[1][1]?.body).toBe(
      JSON.stringify({ alias_name: 'missing', alias_mount_accessor: 'auth_userpass_123' }),
    );
    expect(String(fetchRequest.mock.calls[3][0])).toBe(
      'https://vault.example.test/v1/identity/entity-alias',
    );
  });

  it('treats a no-content identity alias lookup as not found', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse(null, 204));
    const gateway = new VaultAccessControlAdapter(new VaultHttpClient(fetchRequest));

    await expect(
      gateway.lookupEntityByAlias(session, 'missing', 'auth_userpass_123'),
    ).resolves.toBeNull();
  });
});
