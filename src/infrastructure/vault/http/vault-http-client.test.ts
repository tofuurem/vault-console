import { describe, expect, it, vi } from 'vitest';

import { VaultError } from '../../../domain/vault/errors';
import { vaultToken } from '../../../domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from './vault-http-client';

describe('VaultHttpClient', () => {
  it('builds a v1 request with the token, body, and abort signal', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new VaultHttpClient(fetchRequest);
    const controller = new AbortController();

    await expect(
      client.request('https://vault.example.test/', '/secret/data/app', {
        method: 'POST',
        token: vaultToken('hvs.test-token'),
        query: { version: 2 },
        body: { data: { apiKey: 'secret-value' } },
        signal: controller.signal,
      }),
    ).resolves.toEqual({ data: { ok: true } });

    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/v1/secret/data/app?version=2');
    expect(new Headers(init?.headers).get('X-Vault-Token')).toBe('hvs.test-token');
    expect(new Headers(init?.headers).get('X-Vault-Request')).toBe('true');
    expect(init?.body).toBe(JSON.stringify({ data: { apiKey: 'secret-value' } }));
    expect(init?.signal).toBe(controller.signal);
  });

  it('accepts server URLs already ending in v1', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await new VaultHttpClient(fetchRequest).request('https://vault.example.test/proxy/v1', 'sys/seal-status');

    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/proxy/v1/sys/seal-status',
    );
  });

  it('maps an error status without exposing a secret-bearing response body', async () => {
    const secretBody = JSON.stringify({ errors: ['upstream echoed password=do-not-leak'] });
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response(secretBody, { status: 403, headers: { 'Content-Type': 'application/json' } }),
      ),
    );

    const error = await client.request('https://vault.example.test', 'secret/data/app').catch((value: unknown) => value);

    expect(error).toBeInstanceOf(VaultError);
    expect((error as VaultError).code).toBe('authorization');
    expect((error as Error).message).not.toContain('do-not-leak');
  });

  it('rejects malformed successful responses as invalid-response', async () => {
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      ),
    );

    await expect(client.request('https://vault.example.test', 'sys/seal-status')).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  it('allows documented non-2xx status payloads when requested', async () => {
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response(JSON.stringify({ sealed: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      client.request('https://vault.example.test', 'sys/health', { allowStatuses: [503] }),
    ).resolves.toEqual({ sealed: true });
  });

  it('rejects non-http server URLs before sending a request', async () => {
    const fetchRequest = vi.fn<VaultFetch>();
    const client = new VaultHttpClient(fetchRequest);

    await expect(client.request('file:///tmp/vault', 'sys/seal-status')).rejects.toMatchObject({
      code: 'invalid-request',
    });
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
