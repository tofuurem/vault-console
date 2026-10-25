import { describe, expect, it, vi } from 'vitest';

import { vaultUnsealKey } from '@/domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../http/vault-http-client';
import { VaultSealAdapter } from './vault-seal-adapter';

const SEALED = {
  type: 'shamir',
  initialized: true,
  sealed: true,
  t: 3,
  n: 5,
  progress: 1,
  nonce: '9297d5c0-98ea-b692-c226-b03b3014919c',
  version: '2.0.3',
  build_date: '2026-06-17T12:39:45Z',
  migration: false,
  recovery_seal: false,
  storage_type: 'file',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('VaultSealAdapter', () => {
  it('reads seal status without a token', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse(SEALED));
    const gateway = new VaultSealAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.getSealStatus('https://vault.example.test')).resolves.toEqual({
      type: 'shamir',
      initialized: true,
      sealed: true,
      threshold: 3,
      shares: 5,
      progress: 1,
      nonce: '9297d5c0-98ea-b692-c226-b03b3014919c',
      version: '2.0.3',
      clusterName: undefined,
      migration: false,
      recoverySeal: false,
      storageType: 'file',
    });
    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/v1/sys/seal-status');
    expect(new Headers(init?.headers).has('X-Vault-Token')).toBe(false);
  });

  it('submits one key share as a PUT body and returns the new progress', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({ ...SEALED, progress: 2 }),
    );
    const gateway = new VaultSealAdapter(new VaultHttpClient(fetchRequest));

    const status = await gateway.submitUnsealKey(
      'https://vault.example.test',
      vaultUnsealKey('abcdef0123456789'),
    );

    expect(status.progress).toBe(2);
    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/v1/sys/unseal');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ key: 'abcdef0123456789' });
    expect(new Headers(init?.headers).has('X-Vault-Token')).toBe(false);
  });

  it('resets an unseal attempt', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({ ...SEALED, progress: 0, nonce: '' }),
    );
    const gateway = new VaultSealAdapter(new VaultHttpClient(fetchRequest));

    const status = await gateway.resetUnseal('https://vault.example.test');

    expect(status).toMatchObject({ progress: 0, nonce: undefined });
    expect(JSON.parse(String(fetchRequest.mock.calls[0][1]?.body))).toEqual({ reset: true });
  });

  it('treats non-shamir seals as auto-unseal', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({ ...SEALED, type: 'awskms', recovery_seal: true }),
    );
    const gateway = new VaultSealAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.getSealStatus('https://vault.example.test')).resolves.toMatchObject({
      type: 'auto',
      recoverySeal: true,
    });
  });

  it('hides Vault error text for rejected key shares', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({ errors: ["'key' must be a valid hex or base64 string"] }, 400),
    );
    const gateway = new VaultSealAdapter(new VaultHttpClient(fetchRequest));

    const failure = gateway.submitUnsealKey('https://vault.example.test', vaultUnsealKey('zzz'));

    await expect(failure).rejects.toMatchObject({ code: 'invalid-request', status: 400 });
    await expect(failure).rejects.not.toHaveProperty('message', expect.stringContaining('hex'));
  });

  it('rejects malformed seal status payloads', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({ sealed: 'yes' }));
    const gateway = new VaultSealAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.getSealStatus('https://vault.example.test')).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });
});
