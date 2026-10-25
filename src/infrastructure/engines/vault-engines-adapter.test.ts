import { describe, expect, it, vi } from 'vitest';

import { vaultToken } from '@/domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../vault/http/vault-http-client';
import { VaultApiAdapter, VaultEnginesAdapter } from './vault-engines-adapter';

const session = { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' as const };

function json(body: unknown, status = 200) {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('VaultEnginesAdapter', () => {
  it('lists every engine type, skips system mounts, and sorts by path', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(json({
      data: {
        secret: {
          'transit/': { type: 'transit', accessor: 'transit_1', description: '' },
          'cubbyhole/': { type: 'cubbyhole', accessor: 'c', description: '' },
          'db/': { type: 'database', accessor: 'database_1', description: 'Postgres' },
          'apps/': { type: 'kv', accessor: 'kv_1', description: '', options: { version: '2' } },
          'aws/': { type: 'aws', accessor: 'aws_1', description: null, options: null },
        },
      },
    }));
    const engines = await new VaultEnginesAdapter(new VaultHttpClient(fetchRequest)).listEngines(session);
    expect(engines.map(({ path, kind }) => [path, kind])).toEqual([
      ['apps', 'kv-v2'],
      ['aws', 'other'],
      ['db', 'database'],
      ['transit', 'transit'],
    ]);
  });

  it('enables an engine with options and lease limits', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(json(null, 204));
    await new VaultEnginesAdapter(new VaultHttpClient(fetchRequest)).enableEngine(session, {
      path: ' pki/ ',
      type: 'pki',
      description: ' Root CA ',
      maxLeaseTtl: '87600h',
    });
    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/v1/sys/mounts/pki');
    expect(JSON.parse(String(init?.body))).toEqual({
      type: 'pki',
      description: 'Root CA',
      config: { max_lease_ttl: '87600h' },
    });
  });

  it('reads and writes tune settings and rejects unsafe mount paths', async () => {
    const fetchRequest = vi.fn<VaultFetch>()
      .mockResolvedValueOnce(json({ data: { description: 'x', default_lease_ttl: 3600, max_lease_ttl: 86400 } }))
      .mockResolvedValueOnce(json(null, 204));
    const adapter = new VaultEnginesAdapter(new VaultHttpClient(fetchRequest));
    await expect(adapter.readTune(session, 'db')).resolves.toEqual({
      description: 'x',
      defaultLeaseTtlSeconds: 3600,
      maxLeaseTtlSeconds: 86400,
    });
    await adapter.tuneEngine(session, 'db', { description: 'y', defaultLeaseTtl: '', maxLeaseTtl: '24h' });
    expect(JSON.parse(String(fetchRequest.mock.calls[1][1]?.body))).toEqual({
      description: 'y',
      default_lease_ttl: 'system',
      max_lease_ttl: '24h',
    });
    await expect(adapter.disableEngine(session, '../sys')).rejects.toMatchObject({ code: 'invalid-request' });
  });
});

describe('VaultApiAdapter', () => {
  it('lists, reads with lease details, and treats a missing list as empty', async () => {
    const fetchRequest = vi.fn<VaultFetch>()
      .mockResolvedValueOnce(json({ data: { keys: ['a', 'b/'] } }))
      .mockResolvedValueOnce(json({ errors: [] }, 404))
      .mockResolvedValueOnce(json({ lease_id: 'db/creds/r/1', lease_duration: 3600, renewable: true, data: { username: 'u' }, warnings: null }));
    const adapter = new VaultApiAdapter(new VaultHttpClient(fetchRequest));
    await expect(adapter.list(session, 'aws/roles/')).resolves.toEqual(['a', 'b/']);
    expect(String(fetchRequest.mock.calls[0][0])).toBe('https://vault.example.test/v1/aws/roles?list=true');
    await expect(adapter.list(session, 'aws/none')).resolves.toEqual([]);
    await expect(adapter.read(session, 'db/creds/r')).resolves.toEqual({
      data: { username: 'u' },
      leaseId: 'db/creds/r/1',
      leaseDurationSeconds: 3600,
      renewable: true,
      warnings: [],
    });
  });
});
