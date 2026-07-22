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

  it('writes with CAS and returns the created version', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({ data: { version: 4 } }));
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.writeSecret(session, 'secret', 'apps/db', { password: 'value' }, 3)).resolves.toBe(4);
    expect(fetchRequest.mock.calls[0][1]?.method).toBe('POST');
    expect(fetchRequest.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ data: { password: 'value' }, options: { cas: 3 } }),
    );
  });

  it('parses version history in newest-first order', async () => {
    const gateway = new VaultKvV2Adapter(
      new VaultHttpClient(
        vi.fn<VaultFetch>().mockResolvedValue(
          jsonResponse({
            data: {
              current_version: 2,
              oldest_version: 1,
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

    const history = await gateway.readSecretHistory(session, 'secret', 'apps/db');

    expect(history.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(history.versions[0].deletionTime).toBe('later');
  });

  it('uses the documented methods for delete, undelete, destroy, and metadata deletion', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse(null, 204));
    const gateway = new VaultKvV2Adapter(new VaultHttpClient(fetchRequest));

    await gateway.deleteLatestVersion(session, 'secret', 'apps/db');
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
  });
});
