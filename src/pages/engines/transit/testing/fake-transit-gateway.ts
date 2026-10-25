import { vi } from 'vitest';

import type { TransitEngineGateway, TransitKey } from '@/domain/engines/transit/transit';
import { VaultError } from '@/domain/vault/errors';
import { testEngine } from '@/test/engines';

/** Test-only helpers for the transit workspace; never imported by application code. */
export const TRANSIT_ENGINE = testEngine('transit', 'transit', { description: 'Encryption as a service' });

export function transitKey(name: string, overrides: Partial<TransitKey> = {}): TransitKey {
  return {
    name,
    type: 'aes256-gcm96',
    latestVersion: 1,
    minDecryptionVersion: 1,
    minEncryptionVersion: 0,
    minAvailableVersion: 0,
    deletionAllowed: false,
    exportable: false,
    allowPlaintextBackup: false,
    derived: false,
    convergentEncryption: false,
    importedKey: false,
    supportsEncryption: true,
    supportsDecryption: true,
    supportsDerivation: true,
    supportsSigning: false,
    autoRotatePeriodSeconds: 0,
    versions: [{ version: 1, createdAt: '2026-10-01T10:00:00Z' }],
    ...overrides,
  };
}

export const SIGNING_KEY = transitKey('signer', {
  type: 'ed25519',
  supportsEncryption: false,
  supportsDecryption: false,
  supportsSigning: true,
  versions: [{ version: 1, createdAt: '2026-10-01T10:00:00Z', publicKey: 'Ikm7NmROzPX575iX4PTjjXA7xtY7jvJROsH3rwo9QNM=' }],
});

type Gateway = TransitEngineGateway;

/** In-memory gateway whose methods are spies, so tests can assert on calls and still see state change. */
export function fakeTransitGateway(initial: readonly TransitKey[] = [transitKey('app'), SIGNING_KEY]) {
  const keys = new Map(initial.map((key) => [key.name, key]));
  const find = (name: string) => {
    const key = keys.get(name);
    if (!key) throw new VaultError('not-found');
    return key;
  };
  const gateway = {
    listKeys: vi.fn<Gateway['listKeys']>(async () => [...keys.keys()].sort()),
    readKey: vi.fn<Gateway['readKey']>(async (_session, _mount, name) => find(name)),
    createKey: vi.fn<Gateway['createKey']>(async (_session, _mount, input) => {
      keys.set(input.name, transitKey(input.name, { type: input.type, derived: input.derived }));
    }),
    rotateKey: vi.fn<Gateway['rotateKey']>(async (_session, _mount, name) => {
      const key = find(name);
      const version = key.latestVersion + 1;
      keys.set(name, { ...key, latestVersion: version, versions: [{ version, createdAt: '2026-10-20T10:00:00Z' }, ...key.versions] });
    }),
    updateKeyConfig: vi.fn<Gateway['updateKeyConfig']>(async (_session, _mount, name, input) => {
      keys.set(name, { ...find(name), ...input, autoRotatePeriodSeconds: 0 });
    }),
    trimKey: vi.fn<Gateway['trimKey']>(async (_session, _mount, name, minAvailableVersion) => {
      keys.set(name, { ...find(name), minAvailableVersion });
    }),
    deleteKey: vi.fn<Gateway['deleteKey']>(async (_session, _mount, name) => {
      keys.delete(name);
    }),
    encrypt: vi.fn<Gateway['encrypt']>(async (_session, _mount, _name, input) => ({ ciphertext: `vault:v1:${input.plaintext}`, keyVersion: 1 })),
    decrypt: vi.fn<Gateway['decrypt']>(async (_session, _mount, _name, input) => input.ciphertext.replace(/^vault:v\d+:/, '')),
    rewrap: vi.fn<Gateway['rewrap']>(async () => ({ ciphertext: 'vault:v2:rewrapped', keyVersion: 2 })),
    generateDataKey: vi.fn<Gateway['generateDataKey']>(async (_session, _mount, _name, input) => ({
      ciphertext: 'vault:v1:datakey',
      plaintext: input.kind === 'plaintext' ? 'cGxhaW4ta2V5' : undefined,
      keyVersion: 1,
    })),
    sign: vi.fn<Gateway['sign']>(async () => ({ signature: 'vault:v1:signature', keyVersion: 1 })),
    verify: vi.fn<Gateway['verify']>(async (_session, _mount, _name, input) => input.signature === 'vault:v1:signature'),
    hmac: vi.fn<Gateway['hmac']>(async () => 'vault:v1:hmac'),
    verifyHmac: vi.fn<Gateway['verifyHmac']>(async (_session, _mount, _name, input) => input.hmac === 'vault:v1:hmac'),
    randomBytes: vi.fn<Gateway['randomBytes']>(async () => 'cmFuZG9t'),
    hash: vi.fn<Gateway['hash']>(async () => 'abc123'),
  } satisfies TransitEngineGateway;
  return gateway;
}

export type FakeTransitGateway = ReturnType<typeof fakeTransitGateway>;
