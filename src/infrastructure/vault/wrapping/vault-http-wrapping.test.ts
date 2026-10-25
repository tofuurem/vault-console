import { describe, expect, it, vi } from 'vitest';

import type { VaultSession } from '@/domain/vault/contracts';
import { vaultToken, vaultWrappingToken } from '@/domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../http/vault-http-client';
import { VaultWrappingAdapter } from './vault-wrapping-adapter';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.operator'),
  authMethod: 'token',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('VaultWrappingAdapter', () => {
  it('reads one KV v2 version through response wrapping', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({
      request_id: 'r1',
      data: null,
      wrap_info: {
        token: 'hvs.CAESwrapped',
        accessor: 'accessor-1',
        ttl: 3600,
        creation_time: '2026-10-25T10:00:00Z',
        creation_path: 'applications/data/billing/database',
      },
    }));
    const gateway = new VaultWrappingAdapter(new VaultHttpClient(fetchRequest));

    const share = await gateway.wrapKvSecretVersion(session, 'applications', 'billing/database', 3, '1h');

    expect(share.token.reveal()).toBe('hvs.CAESwrapped');
    expect(JSON.stringify(share)).not.toContain('hvs.CAESwrapped');
    expect(share).toMatchObject({
      ttlSeconds: 3600,
      creationTime: '2026-10-25T10:00:00Z',
      creationPath: 'applications/data/billing/database',
    });
    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/v1/applications/data/billing/database?version=3');
    expect(new Headers(init?.headers).get('X-Vault-Wrap-TTL')).toBe('1h');
    expect(new Headers(init?.headers).get('X-Vault-Token')).toBe('hvs.operator');
  });

  it('refuses an unwrapped response instead of reading secret data', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({
      data: { data: { password: 'leaked-if-read' }, metadata: { version: 3 } },
    }));
    const gateway = new VaultWrappingAdapter(new VaultHttpClient(fetchRequest));

    await expect(
      gateway.wrapKvSecretVersion(session, 'applications', 'billing/database', 3, '5m'),
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('looks up a wrapping token without a session token', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({
      data: {
        creation_path: 'applications/data/billing/database',
        creation_time: '2026-10-25T10:00:00Z',
        creation_ttl: 300,
      },
    }));
    const gateway = new VaultWrappingAdapter(new VaultHttpClient(fetchRequest));

    await expect(
      gateway.lookupWrappingToken('https://vault.example.test', vaultWrappingToken('hvs.CAESwrapped')),
    ).resolves.toEqual({
      creationPath: 'applications/data/billing/database',
      creationTime: '2026-10-25T10:00:00Z',
      ttlSeconds: 300,
    });
    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/v1/sys/wrapping/lookup');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).has('X-Vault-Token')).toBe(false);
    expect(init?.body).toBe(JSON.stringify({ token: 'hvs.CAESwrapped' }));
  });

  it('unwraps a KV v2 response into memory-only field values', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({
      data: {
        data: { API_KEY: 'unwrapped-value', CONFIG: { port: 5432 } },
        metadata: { version: 3, created_time: '2026-10-24T09:00:00Z', destroyed: false },
      },
    }));
    const gateway = new VaultWrappingAdapter(new VaultHttpClient(fetchRequest));

    const result = await gateway.unwrapSecret('https://vault.example.test', vaultWrappingToken('hvs.CAESwrapped'));

    expect(result.version).toBe(3);
    expect(result.createdTime).toBe('2026-10-24T09:00:00Z');
    expect(result.fields.map((field) => [field.key, field.type, field.value.reveal()])).toEqual([
      ['API_KEY', 'string', 'unwrapped-value'],
      ['CONFIG', 'object', '{\n  "port": 5432\n}'],
    ]);
    expect(JSON.stringify(result)).not.toContain('unwrapped-value');
    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/v1/sys/wrapping/unwrap');
    expect(new Headers(init?.headers).get('X-Vault-Token')).toBe('hvs.CAESwrapped');
    expect(init?.body).toBeUndefined();
  });

  it('accepts generic wrapped data and responses without data', async () => {
    const fetchRequest = vi.fn<VaultFetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { note: 'plain' } }))
      .mockResolvedValueOnce(jsonResponse({ data: null, auth: { client_token: 'never-shown' } }));
    const gateway = new VaultWrappingAdapter(new VaultHttpClient(fetchRequest));
    const token = vaultWrappingToken('hvs.CAESwrapped');

    const generic = await gateway.unwrapSecret('https://vault.example.test', token);
    expect(generic.version).toBeUndefined();
    expect(generic.fields.map((field) => field.key)).toEqual(['note']);
    await expect(gateway.unwrapSecret('https://vault.example.test', token)).resolves.toEqual({ fields: [] });
  });

  it('rejects unsupported TTLs and versions before contacting Vault', async () => {
    const fetchRequest = vi.fn<VaultFetch>();
    const gateway = new VaultWrappingAdapter(new VaultHttpClient(fetchRequest));

    await expect(
      gateway.wrapKvSecretVersion(session, 'applications', 'app', 1, '7d' as never),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(
      gateway.wrapKvSecretVersion(session, 'applications', 'app', 0, '1h'),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
