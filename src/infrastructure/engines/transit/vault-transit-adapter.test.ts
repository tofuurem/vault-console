import { describe, expect, it, vi } from 'vitest';

import { vaultToken } from '@/domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../../vault/http/vault-http-client';
import { VaultTransitAdapter } from './vault-transit-adapter';

const session = { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' as const };

function json(body: unknown, status = 200) {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function adapterWith(...responses: Response[]) {
  const fetchRequest = vi.fn<VaultFetch>();
  responses.forEach((response) => fetchRequest.mockResolvedValueOnce(response));
  return { adapter: new VaultTransitAdapter(new VaultHttpClient(fetchRequest)), fetchRequest };
}

function call(fetchRequest: ReturnType<typeof vi.fn<VaultFetch>>, index = 0) {
  const [url, init] = fetchRequest.mock.calls[index];
  return {
    url: String(url),
    method: init?.method,
    body: init?.body === undefined || init.body === null ? undefined : JSON.parse(String(init.body)),
  };
}

const AES_KEY = {
  allow_plaintext_backup: false,
  auto_rotate_period: 86400,
  deletion_allowed: false,
  derived: false,
  exportable: false,
  imported_key: false,
  keys: { 2: 1792942560, 3: 1792942600 },
  latest_version: 3,
  min_available_version: 0,
  min_decryption_version: 2,
  min_encryption_version: 0,
  name: 'app',
  supports_decryption: true,
  supports_derivation: true,
  supports_encryption: true,
  supports_signing: false,
  type: 'aes256-gcm96',
};

describe('VaultTransitAdapter keys', () => {
  it('lists keys sorted and treats a missing list as empty', async () => {
    const { adapter, fetchRequest } = adapterWith(
      json({ data: { keys: ['web', 'app'] } }),
      json({ errors: [] }, 404),
    );
    await expect(adapter.listKeys(session, 'transit')).resolves.toEqual(['app', 'web']);
    expect(call(fetchRequest).url).toBe('https://vault.example.test/v1/transit/keys?list=true');
    await expect(adapter.listKeys(session, 'transit')).resolves.toEqual([]);
  });

  it('reads a symmetric key with version creation times', async () => {
    const { adapter, fetchRequest } = adapterWith(json({ data: AES_KEY }));
    const key = await adapter.readKey(session, 'team/transit', 'app');
    expect(call(fetchRequest).url).toBe('https://vault.example.test/v1/team/transit/keys/app');
    expect(key).toMatchObject({
      name: 'app',
      type: 'aes256-gcm96',
      latestVersion: 3,
      minDecryptionVersion: 2,
      minEncryptionVersion: 0,
      autoRotatePeriodSeconds: 86400,
      supportsEncryption: true,
      supportsSigning: false,
    });
    expect(key.versions).toEqual([
      { version: 3, createdAt: new Date(1792942600 * 1000).toISOString() },
      { version: 2, createdAt: new Date(1792942560 * 1000).toISOString() },
    ]);
  });

  it('reads asymmetric public keys and HMAC keys without a key map', async () => {
    const { adapter } = adapterWith(
      json({ data: {
        ...AES_KEY,
        type: 'ed25519',
        keys: { 1: { creation_time: '2026-10-25T15:34:28Z', name: 'ed25519', public_key: 'Ikm7Nm==', certificate_chain: '' } },
      } }),
      json({ data: { ...AES_KEY, type: 'hmac', keys: undefined, key_size: 32 } }),
    );
    const ed = await adapter.readKey(session, 'transit', 'signer');
    expect(ed.versions).toEqual([{ version: 1, createdAt: '2026-10-25T15:34:28Z', publicKey: 'Ikm7Nm==' }]);
    const hmac = await adapter.readKey(session, 'transit', 'mac');
    expect(hmac).toMatchObject({ versions: [], keySize: 32 });
  });

  it('rejects malformed key responses', async () => {
    const { adapter } = adapterWith(
      json({ data: { ...AES_KEY, latest_version: '3' } }),
      json({ data: { ...AES_KEY, keys: { zero: 1 } } }),
    );
    await expect(adapter.readKey(session, 'transit', 'app')).rejects.toMatchObject({ code: 'invalid-response' });
    await expect(adapter.readKey(session, 'transit', 'app')).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('refuses key names and mounts that would escape their path', async () => {
    const { adapter, fetchRequest } = adapterWith();
    await expect(adapter.readKey(session, 'transit', 'a/b')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(adapter.rotateKey(session, 'transit', '..')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(adapter.listKeys(session, '../sys')).rejects.toMatchObject({ code: 'invalid-request' });
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it('creates keys with only the options that were chosen', async () => {
    const { adapter, fetchRequest } = adapterWith(json({ data: AES_KEY }), json(null, 204));
    await adapter.createKey(session, 'transit', {
      name: ' app ',
      type: 'aes256-gcm96',
      derived: true,
      convergentEncryption: true,
      exportable: false,
      allowPlaintextBackup: false,
      autoRotatePeriod: '0',
      keySize: 64,
    });
    expect(call(fetchRequest)).toEqual({
      url: 'https://vault.example.test/v1/transit/keys/app',
      method: 'POST',
      body: { type: 'aes256-gcm96', derived: true, convergent_encryption: true },
    });
    await adapter.createKey(session, 'transit', {
      name: 'mac',
      type: 'hmac',
      derived: false,
      convergentEncryption: false,
      exportable: true,
      allowPlaintextBackup: false,
      autoRotatePeriod: '720h',
      keySize: 64,
    });
    expect(call(fetchRequest, 1).body).toEqual({ type: 'hmac', exportable: true, auto_rotate_period: '720h', key_size: 64 });
  });

  it('rotates, configures, trims, and deletes', async () => {
    const { adapter, fetchRequest } = adapterWith(
      json({ data: AES_KEY }),
      json({ data: AES_KEY }),
      json({ data: AES_KEY }),
      json(null, 204),
    );
    await adapter.rotateKey(session, 'transit', 'app');
    await adapter.updateKeyConfig(session, 'transit', 'app', {
      minDecryptionVersion: 2,
      minEncryptionVersion: 3,
      deletionAllowed: true,
      exportable: false,
      allowPlaintextBackup: false,
      autoRotatePeriod: '',
    });
    await adapter.trimKey(session, 'transit', 'app', 2);
    await adapter.deleteKey(session, 'transit', 'app');
    expect(call(fetchRequest, 0)).toMatchObject({ url: 'https://vault.example.test/v1/transit/keys/app/rotate', method: 'POST' });
    expect(call(fetchRequest, 1).body).toEqual({
      min_decryption_version: 2,
      min_encryption_version: 3,
      deletion_allowed: true,
      exportable: false,
      allow_plaintext_backup: false,
      auto_rotate_period: '0',
    });
    expect(call(fetchRequest, 2)).toMatchObject({ url: 'https://vault.example.test/v1/transit/keys/app/trim', body: { min_available_version: 2 } });
    expect(call(fetchRequest, 3)).toMatchObject({ url: 'https://vault.example.test/v1/transit/keys/app', method: 'DELETE' });
  });

  it("surfaces Vault's explanation for a rejected request", async () => {
    const { adapter } = adapterWith(
      json({ errors: ['error deleting policy app: deletion is not allowed for this key'] }, 400),
      json({ errors: ['1 error occurred:\n\t* invalid key size for HMAC key, must be between 32 and 512 bytes\n\n'] }, 400),
    );
    const deletion = adapter.deleteKey(session, 'transit', 'app');
    await expect(deletion).rejects.toMatchObject({
      code: 'invalid-request',
      reason: 'error deleting policy app: deletion is not allowed for this key',
    });
    await expect(adapter.createKey(session, 'transit', {
      name: 'mac', type: 'hmac', derived: false, convergentEncryption: false, exportable: false, allowPlaintextBackup: false, autoRotatePeriod: '', keySize: 16,
    })).rejects.toMatchObject({ reason: 'invalid key size for HMAC key, must be between 32 and 512 bytes' });
  });

  it('keeps permission errors as authorization failures', async () => {
    const { adapter } = adapterWith(json({ errors: ['1 error occurred:\n\t* permission denied\n\n'] }, 403));
    await expect(adapter.encrypt(session, 'transit', 'app', { plaintext: 'aGk=' })).rejects.toMatchObject({ code: 'authorization' });
  });
});

describe('VaultTransitAdapter operations', () => {
  it('encrypts, decrypts, and rewraps', async () => {
    const { adapter, fetchRequest } = adapterWith(
      json({ data: { ciphertext: 'vault:v3:abc', key_version: 3 } }),
      json({ data: { plaintext: 'aGk=' } }),
      json({ data: {} }),
      json({ data: { ciphertext: 'vault:v4:def', key_version: 4 } }),
    );
    await expect(adapter.encrypt(session, 'transit', 'app', { plaintext: '', context: 'Y3R4', keyVersion: 3 }))
      .resolves.toEqual({ ciphertext: 'vault:v3:abc', keyVersion: 3 });
    expect(call(fetchRequest)).toEqual({
      url: 'https://vault.example.test/v1/transit/encrypt/app',
      method: 'POST',
      body: { plaintext: '', context: 'Y3R4', key_version: 3 },
    });
    await expect(adapter.decrypt(session, 'transit', 'app', { ciphertext: 'vault:v3:abc', context: '' })).resolves.toBe('aGk=');
    expect(call(fetchRequest, 1).body).toEqual({ ciphertext: 'vault:v3:abc' });
    await expect(adapter.decrypt(session, 'transit', 'app', { ciphertext: 'vault:v3:abc' })).resolves.toBe('');
    await expect(adapter.rewrap(session, 'transit', 'app', { ciphertext: 'vault:v3:abc' }))
      .resolves.toEqual({ ciphertext: 'vault:v4:def', keyVersion: 4 });
    expect(call(fetchRequest, 3).url).toBe('https://vault.example.test/v1/transit/rewrap/app');
  });

  it('generates plaintext and wrapped data keys', async () => {
    const { adapter, fetchRequest } = adapterWith(
      json({ data: { ciphertext: 'vault:v1:k', plaintext: 'cGxhaW4=', key_version: 1 } }),
      json({ data: { ciphertext: 'vault:v1:w', key_version: 1 } }),
    );
    await expect(adapter.generateDataKey(session, 'transit', 'app', { kind: 'plaintext', bits: 256 }))
      .resolves.toEqual({ ciphertext: 'vault:v1:k', plaintext: 'cGxhaW4=', keyVersion: 1 });
    await expect(adapter.generateDataKey(session, 'transit', 'app', { kind: 'wrapped', bits: 512 }))
      .resolves.toEqual({ ciphertext: 'vault:v1:w', plaintext: undefined, keyVersion: 1 });
    expect(call(fetchRequest, 1)).toMatchObject({ url: 'https://vault.example.test/v1/transit/datakey/wrapped/app', body: { bits: 512 } });
  });

  it('signs and verifies with algorithm options', async () => {
    const { adapter, fetchRequest } = adapterWith(
      json({ data: { signature: 'vault:v1:sig', key_version: 1 } }),
      json({ data: { valid: false } }),
      json({ data: { valid: 'yes' } }),
    );
    await expect(adapter.sign(session, 'transit', 'rsa', {
      input: 'aGk=',
      hashAlgorithm: 'sha2-512',
      prehashed: false,
      signatureAlgorithm: 'pkcs1v15',
      keyVersion: 1,
    })).resolves.toEqual({ signature: 'vault:v1:sig', keyVersion: 1 });
    expect(call(fetchRequest).body).toEqual({ input: 'aGk=', hash_algorithm: 'sha2-512', signature_algorithm: 'pkcs1v15', key_version: 1 });
    await expect(adapter.verify(session, 'transit', 'ec', {
      input: 'aGk=', signature: 'vault:v1:sig', marshalingAlgorithm: 'jws', prehashed: true,
    })).resolves.toBe(false);
    expect(call(fetchRequest, 1)).toMatchObject({
      url: 'https://vault.example.test/v1/transit/verify/ec',
      body: { input: 'aGk=', signature: 'vault:v1:sig', marshaling_algorithm: 'jws', prehashed: true },
    });
    await expect(adapter.verify(session, 'transit', 'ec', { input: 'aGk=', signature: 's' })).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('computes and verifies HMACs', async () => {
    const { adapter, fetchRequest } = adapterWith(
      json({ data: { hmac: 'vault:v1:mac' } }),
      json({ data: { valid: true } }),
    );
    await expect(adapter.hmac(session, 'transit', 'mac', { input: 'aGk=', algorithm: 'sha2-512' })).resolves.toBe('vault:v1:mac');
    expect(call(fetchRequest)).toMatchObject({ url: 'https://vault.example.test/v1/transit/hmac/mac', body: { input: 'aGk=', algorithm: 'sha2-512' } });
    await expect(adapter.verifyHmac(session, 'transit', 'mac', { input: 'aGk=', hmac: 'vault:v1:mac' })).resolves.toBe(true);
    expect(call(fetchRequest, 1).body).toEqual({ input: 'aGk=', hmac: 'vault:v1:mac' });
  });

  it('generates random bytes and hashes data', async () => {
    const { adapter, fetchRequest } = adapterWith(
      json({ data: { random_bytes: 'ff00' } }),
      json({ data: { sum: 'abcd' } }),
    );
    await expect(adapter.randomBytes(session, 'transit', { bytes: 16, format: 'hex', source: 'all' })).resolves.toBe('ff00');
    expect(call(fetchRequest)).toEqual({
      url: 'https://vault.example.test/v1/transit/random/all/16',
      method: 'POST',
      body: { format: 'hex' },
    });
    await expect(adapter.hash(session, 'transit', { input: 'aGk=', algorithm: 'sha3-256', format: 'base64' })).resolves.toBe('abcd');
    expect(call(fetchRequest, 1)).toMatchObject({ url: 'https://vault.example.test/v1/transit/hash/sha3-256' });
    await expect(adapter.randomBytes(session, 'transit', { bytes: 0, format: 'hex', source: 'all' })).rejects.toMatchObject({ code: 'invalid-request' });
  });
});
