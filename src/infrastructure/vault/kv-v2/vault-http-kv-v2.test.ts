import { describe, expect, it, vi } from 'vitest';

import type { VaultSession } from '../../../domain/vault/contracts';
import { vaultToken } from '../../../domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../http/vault-http-client';
import { VaultKvV2Adapter } from './vault-kv-v2-adapter';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.token'),
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

describe('VaultKvV2Adapter', () => {
  it('discovers only visible KV v2 mounts', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({
        data: {
          auth: {},
          secret: {
            'secret/': {
              type: 'kv',
              accessor: 'kv_123',
              description: 'Application secrets',
              options: { version: '2' },
            },
            'legacy/': {
              type: 'kv',
              accessor: 'kv_456',
              description: '',
              options: { version: '1' },
            },
            'transit/': {
              type: 'transit',
              accessor: 'transit_123',
              description: '',
              options: null,
            },
          },
        },
      }),
    );
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.listMounts(session)).resolves.toEqual([
      {
        path: 'secret',
        accessor: 'kv_123',
        description: 'Application secrets',
        version: 2,
      },
    ]);
    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/sys/internal/ui/mounts',
    );
  });

  it('lists virtual folders using the browser-safe list query', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({ data: { keys: ['api-key', 'production/'] } }),
    );
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.listPaths(session, 'team/secret', 'apps/billing')).resolves.toEqual([
      'api-key',
      'production/',
    ]);
    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/team/secret/metadata/apps/billing?list=true',
    );
  });

  it('creates a KV v2 secrets engine with the documented sys mount payload', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse(null, 204));
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await gateway.createKvV2Mount(session, {
      path: '/team/platform/',
      description: 'Platform secrets',
    });

    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/sys/mounts/team/platform',
    );
    expect(fetchRequest.mock.calls[0][1]?.method).toBe('POST');
    expect(fetchRequest.mock.calls[0][1]?.body).toBe(JSON.stringify({
      type: 'kv',
      description: 'Platform secrets',
      options: { version: '2' },
    }));
  });

  it('treats a missing list path as an empty folder', async () => {
    const gateway = new VaultKvV2Adapter(
      new VaultHttpClient(
        vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({ errors: [] }, 404)),
      ),
    );

    await expect(gateway.listPaths(session, 'secret', 'missing')).resolves.toEqual([]);
  });

  it('reads a requested version and validates its metadata shape', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({
        data: {
          data: { username: 'service' },
          metadata: {
            created_time: '2026-07-21T12:00:00Z',
            custom_metadata: { owner: 'platform' },
            deletion_time: '',
            destroyed: false,
            version: 3,
          },
        },
      }),
    );
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.readSecret(session, 'secret', 'apps/db', 3)).resolves.toEqual({
      mount: 'secret',
      path: 'apps/db',
      data: { username: 'service' },
      metadata: {
        createdTime: '2026-07-21T12:00:00Z',
        version: 3,
        customMetadata: { owner: 'platform' },
        destroyed: false,
        deletionTime: undefined,
      },
    });
    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/secret/data/apps/db?version=3',
    );
  });

  it('writes with typed CAS strategies and returns the created version', async () => {
    const fetchRequest = vi.fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { version: 4 } }))
      .mockResolvedValueOnce(jsonResponse({ data: { version: 5 } }));
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.writeSecret(
      session,
      'secret',
      'apps/db',
      { password: 'value' },
      { type: 'check-and-set', version: 3 },
    )).resolves.toBe(4);
    await expect(gateway.writeSecret(
      session,
      'secret',
      'apps/db',
      { password: 'replacement' },
      { type: 'unconditional' },
    )).resolves.toBe(5);
    expect(fetchRequest.mock.calls[0][1]?.method).toBe('POST');
    expect(fetchRequest.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ data: { password: 'value' }, options: { cas: 3 } }),
    );
    expect(fetchRequest.mock.calls[1][1]?.body).toBe(
      JSON.stringify({ data: { password: 'replacement' } }),
    );
  });

  it('parses rich key metadata in newest-first version order', async () => {
    const gateway = new VaultKvV2Adapter(
      new VaultHttpClient(
        vi.fn<VaultFetch>().mockResolvedValue(
          jsonResponse({
            data: {
              created_time: '2026-07-20T12:00:00Z',
              updated_time: '2026-07-21T12:00:00Z',
              current_version: 2,
              oldest_version: 1,
              max_versions: 12,
              cas_required: true,
              delete_version_after: '24h',
              custom_metadata: null,
              versions: {
                '1': { created_time: '2026-07-20T12:00:00Z', deletion_time: '', destroyed: false },
                '2': { created_time: '2026-07-21T12:00:00Z', deletion_time: 'later', destroyed: false },
              },
            },
          }),
        ),
      ),
    );

    const history = await gateway.readSecretMetadata(session, 'secret', 'apps/db');

    expect(history.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(history.versions[0].deletionTime).toBe('later');
    expect(history).toMatchObject({
      createdTime: '2026-07-20T12:00:00Z',
      updatedTime: '2026-07-21T12:00:00Z',
      maxVersions: 12,
      casRequired: true,
      deleteVersionAfter: '24h',
    });
  });

  it('uses distinct latest, exact-version, and metadata deletion endpoints', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse(null, 204));
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await gateway.deleteLatestSecret(session, 'secret', 'apps/db');
    await gateway.deleteVersions(session, 'secret', 'apps/db', [1]);
    await gateway.undeleteVersions(session, 'secret', 'apps/db', [1]);
    await gateway.destroyVersions(session, 'secret', 'apps/db', [1]);
    await gateway.deleteMetadata(session, 'secret', 'apps/db');

    expect(fetchRequest.mock.calls.map(([, request]) => request?.method)).toEqual([
      'DELETE',
      'POST',
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(fetchRequest.mock.calls.slice(1, 4).map(([, request]) => request?.body)).toEqual([
      JSON.stringify({ versions: [1] }),
      JSON.stringify({ versions: [1] }),
      JSON.stringify({ versions: [1] }),
    ]);
    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/secret/data/apps/db',
    );
  });

  it('reads and updates key metadata and mount configuration', async () => {
    const fetchRequest = vi.fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          max_versions: 8,
          cas_required: false,
          delete_version_after: '12h',
        },
      }))
      .mockResolvedValue(jsonResponse(null, 204));
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.readMountConfig(session, 'secret')).resolves.toEqual({
      maxVersions: 8,
      casRequired: false,
      deleteVersionAfter: '12h',
    });
    await gateway.updateMountConfig(session, 'secret', {
      maxVersions: 9,
      casRequired: true,
      deleteVersionAfter: '24h',
    });
    await gateway.updateSecretMetadata(session, 'secret', 'apps/db', {
      maxVersions: 3,
      casRequired: false,
      deleteVersionAfter: '0s',
      customMetadata: { owner: 'platform' },
    });

    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/secret/config',
    );
    expect(fetchRequest.mock.calls[1][1]?.body).toBe(JSON.stringify({
      max_versions: 9,
      cas_required: true,
      delete_version_after: '24h',
    }));
    expect(fetchRequest.mock.calls[2][1]?.body).toBe(JSON.stringify({
      max_versions: 3,
      cas_required: false,
      delete_version_after: '0s',
      custom_metadata: { owner: 'platform' },
    }));
  });
});
