import { describe, expect, it, vi } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import { vaultPassword, vaultToken } from '@/domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../../vault/http/vault-http-client';
import { VaultDatabaseAdapter } from './vault-database-adapter';

const session = { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' as const };

function json(body: unknown, status = 200) {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(...responses: Response[]) {
  const fetchRequest = vi.fn<VaultFetch>();
  responses.forEach((response) => fetchRequest.mockResolvedValueOnce(response));
  return { fetchRequest, adapter: new VaultDatabaseAdapter(new VaultHttpClient(fetchRequest)) };
}

function call(fetchRequest: ReturnType<typeof vi.fn<VaultFetch>>, index = 0) {
  const [url, init] = fetchRequest.mock.calls[index];
  return {
    url: String(url),
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) as unknown : undefined,
  };
}

describe('VaultDatabaseAdapter connections', () => {
  it('lists sorted names and treats a missing list as empty', async () => {
    const { fetchRequest, adapter } = setup(json({ data: { keys: ['pg', 'mysql'] } }), json({ errors: [] }, 404));
    await expect(adapter.listConnections(session, 'db/team')).resolves.toEqual(['mysql', 'pg']);
    expect(call(fetchRequest).url).toBe('https://vault.example.test/v1/db/team/config?list=true');
    await expect(adapter.listConnections(session, 'db')).resolves.toEqual([]);
  });

  it('reads a connection, keeps only non-secret settings, and maps root rotation statements', async () => {
    const { adapter } = setup(json({
      data: {
        allowed_roles: ['*'],
        connection_details: {
          connection_url: 'postgresql://{{username}}:{{password}}@db:5432/app',
          username: 'vault',
          max_open_connections: 4,
          private_key: 'never shown',
          tls_ca: { nested: true },
        },
        password_policy: '',
        plugin_name: 'postgresql-database-plugin',
        plugin_version: '',
        root_credentials_rotate_statements: ['ALTER USER x;'],
        verify_connection: true,
      },
    }));
    await expect(adapter.readConnection(session, 'db', 'pg')).resolves.toEqual({
      name: 'pg',
      pluginName: 'postgresql-database-plugin',
      pluginVersion: undefined,
      connectionUrl: 'postgresql://{{username}}:{{password}}@db:5432/app',
      username: 'vault',
      allowedRoles: ['*'],
      verifyConnection: true,
      passwordPolicy: '',
      rootRotationStatements: ['ALTER USER x;'],
      otherSettings: { max_open_connections: 4 },
    });
  });

  it('reads the address from host for Redis-style plugins and rejects malformed responses', async () => {
    const { adapter } = setup(
      json({ data: { plugin_name: 'redis-database-plugin', connection_details: { host: 'redis', port: 6379 } } }),
      json({ data: { plugin_name: 42 } }),
    );
    await expect(adapter.readConnection(session, 'db', 'cache')).resolves.toMatchObject({
      connectionUrl: 'redis',
      otherSettings: { port: 6379 },
      allowedRoles: [],
    });
    await expect(adapter.readConnection(session, 'db', 'pg')).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('writes a connection with the plugin address key and sends the password only when set', async () => {
    const { fetchRequest, adapter } = setup(json(null, 204), json(null, 204));
    const input = {
      name: 'cache',
      pluginName: 'redis-database-plugin',
      urlParameter: 'host' as const,
      connectionUrl: 'redis.internal',
      username: 'default',
      password: vaultPassword('s3cret'),
      allowedRoles: ['web'],
      verifyConnection: true,
      passwordPolicy: '',
      rootRotationStatements: [],
      extraSettings: { port: 6379, tls: true },
    };
    await adapter.writeConnection(session, 'db', input);
    expect(call(fetchRequest)).toEqual({
      url: 'https://vault.example.test/v1/db/config/cache',
      method: 'POST',
      body: {
        port: 6379,
        tls: true,
        plugin_name: 'redis-database-plugin',
        host: 'redis.internal',
        username: 'default',
        password: 's3cret',
        allowed_roles: ['web'],
        verify_connection: true,
        password_policy: '',
        root_rotation_statements: [],
      },
    });
    await adapter.writeConnection(session, 'db', { ...input, password: undefined });
    expect(call(fetchRequest, 1).body).not.toHaveProperty('password');
  });

  it('surfaces Vault reasons from 400 and 500 responses without passwords', async () => {
    const { adapter } = setup(
      json({ errors: ['error creating database object: error verifying connection: postgresql://root:hunter2@db failed'] }, 400),
      json({ errors: ['1 error occurred:\n\t* "web" is not an allowed role\n\n'] }, 500),
      json({ errors: [] }, 400),
    );
    const error = await adapter.writeConnection(session, 'db', {
      name: 'pg',
      pluginName: 'postgresql-database-plugin',
      urlParameter: 'connection_url',
      connectionUrl: 'x',
      username: '',
      allowedRoles: [],
      verifyConnection: true,
      passwordPolicy: '',
      rootRotationStatements: [],
      extraSettings: {},
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VaultError);
    expect((error as VaultError).reason).toBe(
      'error creating database object: error verifying connection: postgresql://root:***@db failed',
    );
    await expect(adapter.generateCredentials(session, 'db', 'web')).rejects.toMatchObject({
      code: 'unavailable',
      reason: '"web" is not an allowed role',
    });
    await expect(adapter.resetConnection(session, 'db', 'pg')).rejects.toMatchObject({ code: 'invalid-request' });
  });

  it('keeps permission errors and rejects unsafe names before calling Vault', async () => {
    const { fetchRequest, adapter } = setup(json({ errors: ['1 error occurred:\n\t* permission denied\n\n'] }, 403));
    await expect(adapter.rotateRootCredentials(session, 'db', 'pg')).rejects.toMatchObject({ code: 'authorization' });
    expect(call(fetchRequest)).toMatchObject({ url: 'https://vault.example.test/v1/db/rotate-root/pg', method: 'POST' });
    await expect(adapter.deleteConnection(session, 'db', '../sys')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(adapter.readRole(session, '../sys', 'web')).rejects.toMatchObject({ code: 'invalid-request' });
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });
});

describe('VaultDatabaseAdapter roles and credentials', () => {
  it('reads and writes dynamic roles', async () => {
    const { fetchRequest, adapter } = setup(
      json({
        data: {
          creation_statements: ['CREATE ROLE x;'],
          credential_type: 'password',
          db_name: 'pg',
          default_ttl: 3600,
          max_ttl: 86400,
          renew_statements: [],
          revocation_statements: null,
          rollback_statements: [],
        },
      }),
      json(null, 204),
    );
    await expect(adapter.readRole(session, 'db', 'web')).resolves.toEqual({
      name: 'web',
      dbName: 'pg',
      creationStatements: ['CREATE ROLE x;'],
      revocationStatements: [],
      rollbackStatements: [],
      renewStatements: [],
      defaultTtlSeconds: 3600,
      maxTtlSeconds: 86400,
      credentialType: 'password',
    });
    await adapter.writeRole(session, 'db', {
      name: 'web',
      dbName: 'pg',
      creationStatements: ['CREATE ROLE x;'],
      revocationStatements: [],
      rollbackStatements: [],
      renewStatements: [],
      defaultTtl: '1h',
      maxTtl: '',
    });
    expect(call(fetchRequest, 1)).toEqual({
      url: 'https://vault.example.test/v1/db/roles/web',
      method: 'POST',
      body: {
        db_name: 'pg',
        creation_statements: ['CREATE ROLE x;'],
        revocation_statements: [],
        rollback_statements: [],
        renew_statements: [],
        default_ttl: '1h',
        max_ttl: '0',
      },
    });
  });

  it('generates credentials with a lease, then renews and revokes it', async () => {
    const { fetchRequest, adapter } = setup(
      json({
        lease_id: 'db/creds/web/abc',
        lease_duration: 3600,
        renewable: true,
        data: { username: 'v-web-1', password: 'pw' },
        warnings: null,
      }),
      json({ lease_id: 'db/creds/web/abc', lease_duration: 7200, renewable: true, data: null }),
      json(null, 204),
    );
    await expect(adapter.generateCredentials(session, 'db', 'web')).resolves.toEqual({
      data: { username: 'v-web-1', password: 'pw' },
      leaseId: 'db/creds/web/abc',
      leaseDurationSeconds: 3600,
      renewable: true,
      warnings: [],
    });
    expect(call(fetchRequest)).toMatchObject({ url: 'https://vault.example.test/v1/db/creds/web', method: 'GET' });
    await expect(adapter.renewLease(session, 'db/creds/web/abc', '2h')).resolves.toEqual({
      leaseId: 'db/creds/web/abc',
      leaseDurationSeconds: 7200,
      renewable: true,
    });
    expect(call(fetchRequest, 1)).toEqual({
      url: 'https://vault.example.test/v1/sys/leases/renew',
      method: 'PUT',
      body: { lease_id: 'db/creds/web/abc', increment: '2h' },
    });
    await adapter.revokeLease(session, 'db/creds/web/abc');
    expect(call(fetchRequest, 2)).toEqual({
      url: 'https://vault.example.test/v1/sys/leases/revoke',
      method: 'PUT',
      body: { lease_id: 'db/creds/web/abc' },
    });
  });

  it('rejects credentials without a lease', async () => {
    const { adapter } = setup(json({ data: { username: 'u', password: 'p' } }));
    await expect(adapter.generateCredentials(session, 'db', 'web')).rejects.toMatchObject({ code: 'invalid-response' });
  });
});

describe('VaultDatabaseAdapter static roles', () => {
  it('reads period and schedule rotations', async () => {
    const { adapter } = setup(
      json({ data: { db_name: 'pg', username: 'app', rotation_period: 86400, rotation_statements: [], last_vault_rotation: '2026-10-25T15:36:08Z' } }),
      json({ data: { db_name: 'pg', username: 'app', rotation_schedule: '0 * * * *', rotation_window: 3600 } }),
    );
    await expect(adapter.readStaticRole(session, 'db', 'app')).resolves.toEqual({
      name: 'app',
      dbName: 'pg',
      username: 'app',
      rotation: { kind: 'period', periodSeconds: 86400 },
      rotationStatements: [],
      lastVaultRotation: '2026-10-25T15:36:08Z',
      credentialType: 'password',
    });
    await expect(adapter.readStaticRole(session, 'db', 'sched')).resolves.toMatchObject({
      rotation: { kind: 'schedule', schedule: '0 * * * *', windowSeconds: 3600 },
    });
  });

  it('writes either a period or a schedule, never both', async () => {
    const { fetchRequest, adapter } = setup(json(null, 204), json(null, 204));
    const base = { name: 'app', dbName: 'pg', username: 'app', rotationStatements: [] };
    await adapter.writeStaticRole(session, 'db', { ...base, rotation: { kind: 'period', period: '24h' } });
    expect(call(fetchRequest).body).toEqual({ db_name: 'pg', username: 'app', rotation_statements: [], rotation_period: '24h' });
    await adapter.writeStaticRole(session, 'db', { ...base, rotation: { kind: 'schedule', schedule: '0 3 * * *', window: '' } });
    expect(call(fetchRequest, 1).body).toEqual({ db_name: 'pg', username: 'app', rotation_statements: [], rotation_schedule: '0 3 * * *' });
  });

  it('reads static credentials and rotates on request', async () => {
    const { fetchRequest, adapter } = setup(
      json({ data: { username: 'app', password: 'pw', last_vault_rotation: '2026-10-25T15:36:08Z', rotation_period: 86400, ttl: 1200 } }),
      json(null, 204),
      json(null, 204),
    );
    await expect(adapter.readStaticCredentials(session, 'db', 'app')).resolves.toEqual({
      username: 'app',
      password: 'pw',
      lastVaultRotation: '2026-10-25T15:36:08Z',
      ttlSeconds: 1200,
      rotation: { kind: 'period', periodSeconds: 86400 },
    });
    await adapter.rotateStaticRole(session, 'db', 'app');
    expect(call(fetchRequest, 1)).toMatchObject({ url: 'https://vault.example.test/v1/db/rotate-role/app', method: 'POST' });
    await adapter.deleteStaticRole(session, 'db', 'app');
    expect(call(fetchRequest, 2)).toMatchObject({ url: 'https://vault.example.test/v1/db/static-roles/app', method: 'DELETE' });
  });

  it('lists roles and static roles under the mount', async () => {
    const { fetchRequest, adapter } = setup(json({ data: { keys: ['web'] } }), json({ data: { keys: ['app'] } }));
    await expect(adapter.listRoles(session, 'db')).resolves.toEqual(['web']);
    await expect(adapter.listStaticRoles(session, 'db')).resolves.toEqual(['app']);
    expect(call(fetchRequest, 1).url).toBe('https://vault.example.test/v1/db/static-roles?list=true');
  });
});
