import { describe, expect, it, vi } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import {
  encodeVaultPath,
  VaultHttpClient,
  type VaultFetch,
} from './vault-http-client';

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

  it('requests response wrapping only when a wrap TTL is given', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockImplementation(async () => new Response(
      JSON.stringify({ wrap_info: { token: 'hvs.wrapped' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const client = new VaultHttpClient(fetchRequest);

    await client.request('https://vault.example.test', 'secret/data/app', { wrapTtl: '1h' });
    await client.request('https://vault.example.test', 'secret/data/app');

    expect(new Headers(fetchRequest.mock.calls[0][1]?.headers).get('X-Vault-Wrap-TTL')).toBe('1h');
    expect(new Headers(fetchRequest.mock.calls[1][1]?.headers).has('X-Vault-Wrap-TTL')).toBe(false);
  });

  it.each(['', '0', '1d', '1h; x', '-5m'])('rejects a malformed wrap TTL before sending: %j', async (wrapTtl) => {
    const fetchRequest = vi.fn<VaultFetch>();

    await expect(
      new VaultHttpClient(fetchRequest).request('https://vault.example.test', 'secret/data/app', { wrapTtl }),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    expect(fetchRequest).not.toHaveBeenCalled();
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
    const requestId = '9b4d3315-14e3-4d0c-8ac3-47ab4faeef3c';
    const secretBody = JSON.stringify({
      request_id: requestId,
      errors: ['upstream echoed password=do-not-leak'],
    });
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response(secretBody, { status: 403, headers: { 'Content-Type': 'application/json' } }),
      ),
    );

    const error = await client.request('https://vault.example.test', 'secret/data/app').catch((value: unknown) => value);

    expect(error).toBeInstanceOf(VaultError);
    expect((error as VaultError).code).toBe('authorization');
    expect((error as Error).message).not.toContain('do-not-leak');
    expect((error as VaultError).diagnostic).toMatchObject({
      operation: 'GET /v1/:vault-path',
      retryCount: 0,
      requestId,
    });
    expect((error as VaultError).diagnostic?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify((error as VaultError).diagnostic)).not.toContain('secret/data/app');
    expect(JSON.stringify((error as VaultError).diagnostic)).not.toContain('do-not-leak');
  });

  it('classifies Vault invalid-token responses without retaining the raw error body', async () => {
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response(JSON.stringify({
          request_id: 'invalid-session-request',
          errors: ['2 errors occurred:\n\t* permission denied\n\t* invalid token\n\n'],
        }), { status: 403, headers: { 'Content-Type': 'application/json' } }),
      ),
    );

    const error = await client.request('https://vault.example.test', 'sys/capabilities-self')
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(VaultError);
    expect(error).toMatchObject({
      code: 'session-expired',
      status: 403,
      diagnostic: {
        requestId: 'invalid-session-request',
        operation: 'GET /v1/:vault-path',
      },
    });
    expect((error as Error).message).not.toContain('invalid token');
    expect(JSON.stringify(error)).not.toContain('permission denied');
  });

  it('does not confuse unrelated token wording with an invalid session', async () => {
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response(JSON.stringify({
          errors: ['permission denied for token policy'],
        }), { status: 403, headers: { 'Content-Type': 'application/json' } }),
      ),
    );

    await expect(
      client.request('https://vault.example.test', 'secret/data/app'),
    ).rejects.toMatchObject({ code: 'authorization', status: 403 });
  });

  it('classifies Vault KV check-and-set mismatches as conflicts even with HTTP 400', async () => {
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response(JSON.stringify({
          request_id: 'cas-conflict-request',
          errors: ['check-and-set parameter did not match the current version'],
        }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
      ),
    );

    const error = await client.request('https://vault.example.test', 'secret/data/app', {
      method: 'POST',
      body: { data: { secret: 'do-not-retain' }, options: { cas: 0 } },
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: 'conflict',
      status: 400,
      diagnostic: { requestId: 'cas-conflict-request' },
    });
    expect(JSON.stringify(error)).not.toContain('do-not-retain');
    expect(JSON.stringify(error)).not.toContain('check-and-set parameter');
  });

  it('attaches the sanitized Vault reason only when the request opts in', async () => {
    const body = JSON.stringify({ errors: ['1 error occurred:\n\t* common name evil.example not allowed by this role\n\n'] });
    const fetchRequest = vi.fn<VaultFetch>().mockImplementation(async () => new Response(body, { status: 400 }));
    const client = new VaultHttpClient(fetchRequest);

    const plain = await client.request('https://vault.example.test', 'pki/issue/web').catch((error: unknown) => error);
    expect(plain).toMatchObject({ code: 'invalid-request', reason: undefined });

    const reasoned = await client.request('https://vault.example.test', 'pki/issue/web', { includeReason: true })
      .catch((error: unknown) => error);
    expect(reasoned).toBeInstanceOf(VaultError);
    expect(reasoned).toMatchObject({
      code: 'invalid-request',
      message: 'Vault rejected the requested operation.',
      reason: 'common name evil.example not allowed by this role',
    });
  });

  it('keeps status-based handling for non-JSON error responses', async () => {
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response('invalid token', { status: 403, headers: { 'Content-Type': 'text/plain' } }),
      ),
    );

    await expect(
      client.request('https://vault.example.test', 'secret/data/app'),
    ).rejects.toMatchObject({ code: 'authorization', status: 403 });
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

  it('classifies the structured sealed marker without exposing Vault text', async () => {
    const client = new VaultHttpClient(
      vi.fn<VaultFetch>().mockResolvedValue(
        new Response(JSON.stringify({ errors: ['Vault is sealed'] }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(client.request('https://vault.example.test', 'sys/mounts')).rejects.toMatchObject({
      code: 'sealed',
      status: 503,
      message: 'Vault is sealed. Unseal it before continuing.',
    });
  });

  it('rejects non-http server URLs before sending a request', async () => {
    const fetchRequest = vi.fn<VaultFetch>();
    const client = new VaultHttpClient(fetchRequest);

    await expect(client.request('file:///tmp/vault', 'sys/seal-status')).rejects.toMatchObject({
      code: 'invalid-request',
    });
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it('encodes canonical nested paths while preserving boundary slash compatibility', () => {
    expect(encodeVaultPath('team/app secret/ключ%name\\file')).toBe(
      'team/app%20secret/%D0%BA%D0%BB%D1%8E%D1%87%25name%5Cfile',
    );
    expect(encodeVaultPath('/team/platform/')).toBe('team/platform');
    expect(encodeVaultPath('')).toBe('');
    expect(encodeVaultPath('/')).toBe('');
    expect(encodeVaultPath('%2e%2e')).toBe('%252e%252e');
  });

  it.each([
    '.',
    '..',
    'team/./app',
    'team/../app',
    'team//app',
    '//team/app',
    'team/app//',
    'team/\u0000/app',
    'team/\u001f/app',
    'team/\u007f/app',
  ])('rejects an ambiguous logical Vault path without echoing it: %j', (path) => {
    let error: unknown;
    try {
      encodeVaultPath(path);
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(VaultError);
    expect(error).toMatchObject({ code: 'invalid-request' });
    expect((error as Error).message).toBe('Vault rejected the requested operation.');
  });

  it.each([
    '../sys/health',
    'auth/userpass/users/..',
    'auth/userpass/users/%2e%2e',
    'auth/userpass/users/%00',
    'auth//userpass/users/alice',
    'auth/userpass/users/%',
  ])('rejects a request path that could normalize away from its intended endpoint: %j', async (path) => {
    const fetchRequest = vi.fn<VaultFetch>();
    const client = new VaultHttpClient(fetchRequest);

    await expect(
      client.request('https://vault.example.test/proxy', path),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
