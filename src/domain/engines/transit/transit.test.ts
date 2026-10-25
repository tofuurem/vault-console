import { describe, expect, it } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import { transitErrorText } from './transit';
import {
  compactBase64,
  decodeBase64Text,
  encodeTextBase64,
  isBase64,
  payloadBase64,
} from './transit-encoding';
import {
  isTransitOperation,
  signingOptions,
  transitKeyOperations,
  transitKeyTypeInfo,
  transitKeyTypeLabel,
  TRANSIT_KEY_TYPES,
} from './transit-key-types';
import {
  autoRotatePeriodError,
  autoRotatePeriodInput,
  durationSeconds,
  hmacKeySizeError,
  keyVersionLimitsError,
  keyVersionState,
  maxTrimVersion,
  randomBytesError,
  transitKeyNameError,
  trimVersionError,
  usableKeyVersions,
} from './transit-validation';

const RING = { latestVersion: 5, minDecryptionVersion: 2, minEncryptionVersion: 4, minAvailableVersion: 0 };

describe('transit encoding', () => {
  it('round-trips UTF-8 text through base64', () => {
    expect(encodeTextBase64('hello')).toBe('aGVsbG8=');
    const unicode = 'Grüße, 世界 🔐';
    expect(decodeBase64Text(encodeTextBase64(unicode))).toEqual({ kind: 'text', text: unicode });
  });

  it('reports binary payloads instead of mangling them', () => {
    expect(decodeBase64Text('/wD+AQ==')).toEqual({ kind: 'binary', byteLength: 4 });
    expect(decodeBase64Text(btoa('a\u0001b'))).toEqual({ kind: 'binary', byteLength: 3 });
    expect(decodeBase64Text(btoa('line\nnext\ttab'))).toEqual({ kind: 'text', text: 'line\nnext\ttab' });
  });

  it('validates padded base64 and ignores whitespace', () => {
    expect(isBase64('aGVsbG8=')).toBe(true);
    expect(isBase64('aGVs\nbG8=')).toBe(true);
    expect(isBase64('hello')).toBe(false);
    expect(isBase64('')).toBe(false);
    expect(compactBase64(' aG Vs\nbG8= ')).toBe('aGVsbG8=');
  });

  it('builds payloads from text or existing base64', () => {
    expect(payloadBase64('hi', false)).toEqual({ ok: true, value: 'aGk=' });
    expect(payloadBase64('aGk=\n', true)).toEqual({ ok: true, value: 'aGk=' });
    expect(payloadBase64('not base64', true)).toMatchObject({ ok: false });
  });
});

describe('transit key types', () => {
  it('describes what each family can do', () => {
    expect(TRANSIT_KEY_TYPES.map((entry) => entry.type)).toEqual([
      'aes256-gcm96', 'aes128-gcm96', 'chacha20-poly1305', 'ed25519',
      'ecdsa-p256', 'ecdsa-p384', 'ecdsa-p521', 'rsa-2048', 'rsa-3072', 'rsa-4096', 'hmac',
    ]);
    expect(transitKeyTypeInfo('aes256-gcm96')).toMatchObject({ encryption: true, convergent: true, derivation: true });
    expect(transitKeyTypeInfo('ed25519')).toMatchObject({ signing: true, derivation: true, convergent: false, asymmetric: true });
    expect(transitKeyTypeInfo('rsa-4096')).toMatchObject({ encryption: true, signing: true, derivation: false });
    expect(transitKeyTypeInfo('hmac')).toMatchObject({ encryption: false, signing: false });
    expect(transitKeyTypeLabel('ecdsa-p384')).toBe('ECDSA P384');
    expect(transitKeyTypeLabel('future-type')).toBe('future-type');
  });

  it('derives operations from the key flags', () => {
    const flags = { supportsEncryption: false, supportsDecryption: false, supportsSigning: false };
    expect(transitKeyOperations({ ...flags, type: 'aes256-gcm96', supportsEncryption: true, supportsDecryption: true }))
      .toEqual(['encrypt', 'decrypt', 'rewrap', 'datakey', 'hmac', 'verify-hmac']);
    expect(transitKeyOperations({ ...flags, type: 'ed25519', supportsSigning: true }))
      .toEqual(['sign', 'verify', 'hmac', 'verify-hmac']);
    expect(transitKeyOperations({ ...flags, type: 'hmac' })).toEqual(['hmac', 'verify-hmac']);
    expect(transitKeyOperations({ ...flags, type: 'managed_key' })).toEqual([]);
    expect(isTransitOperation('verify-hmac')).toBe(true);
    expect(isTransitOperation('export')).toBe(false);
  });

  it('shows only signing options the algorithm uses', () => {
    expect(signingOptions('rsa-2048')).toEqual({ hashAlgorithm: true, prehashed: true, signatureAlgorithm: true, marshalingAlgorithm: false });
    expect(signingOptions('ecdsa-p256')).toEqual({ hashAlgorithm: true, prehashed: true, signatureAlgorithm: false, marshalingAlgorithm: true });
    expect(signingOptions('ed25519')).toEqual({ hashAlgorithm: false, prehashed: false, signatureAlgorithm: false, marshalingAlgorithm: false });
  });
});

describe('transit validation', () => {
  it('checks key names the way Vault does', () => {
    expect(transitKeyNameError('')).toBe('Enter a key name.');
    expect(transitKeyNameError('app-key.v2')).toBeUndefined();
    expect(transitKeyNameError('a')).toBeUndefined();
    expect(transitKeyNameError('-app')).toMatch(/Start and end/);
    expect(transitKeyNameError('team/app')).toMatch(/Use letters/);
    expect(transitKeyNameError('app', ['app'])).toBe('A key with this name already exists.');
  });

  it('parses durations and enforces the rotation minimum', () => {
    expect(durationSeconds('1h30m')).toBe(5400);
    expect(durationSeconds('86400')).toBe(86400);
    expect(durationSeconds('')).toBe(0);
    expect(durationSeconds('soon')).toBeUndefined();
    expect(autoRotatePeriodError('')).toBeUndefined();
    expect(autoRotatePeriodError('0')).toBeUndefined();
    expect(autoRotatePeriodError('30m')).toMatch(/at least 1h/);
    expect(autoRotatePeriodError('720h')).toBeUndefined();
    expect(autoRotatePeriodError('weekly')).toMatch(/duration/);
    expect(autoRotatePeriodInput(0)).toBe('');
    expect(autoRotatePeriodInput(86400)).toBe('24h');
    expect(autoRotatePeriodInput(5400)).toBe('90m');
    expect(autoRotatePeriodInput(3601)).toBe('3601s');
  });

  it('bounds HMAC key sizes and random byte counts', () => {
    expect(hmacKeySizeError('32')).toBeUndefined();
    expect(hmacKeySizeError('16')).toMatch(/32 to 512/);
    expect(hmacKeySizeError('64.5')).toMatch(/whole number/);
    expect(randomBytesError('32')).toBeUndefined();
    expect(randomBytesError('0')).toMatch(/from 1/);
    expect(randomBytesError('131072')).toMatch(/131,071/);
  });

  it('keeps version floors inside the key ring', () => {
    expect(keyVersionLimitsError(RING, { minDecryptionVersion: 2, minEncryptionVersion: 0 })).toBeUndefined();
    expect(keyVersionLimitsError(RING, { minDecryptionVersion: 6, minEncryptionVersion: 0 })).toMatch(/from 1 to 5/);
    expect(keyVersionLimitsError(RING, { minDecryptionVersion: 3, minEncryptionVersion: 2 })).toMatch(/cannot be lower/);
    expect(keyVersionLimitsError({ ...RING, minAvailableVersion: 3 }, { minDecryptionVersion: 2, minEncryptionVersion: 0 }))
      .toMatch(/from 3 to 5/);
  });

  it('limits trimming to explicit version floors', () => {
    expect(maxTrimVersion(RING)).toBe(2);
    expect(maxTrimVersion({ ...RING, minEncryptionVersion: 0 })).toBeUndefined();
    expect(trimVersionError({ ...RING, minEncryptionVersion: 0 }, 2)).toMatch(/Set both/);
    expect(trimVersionError(RING, 2)).toBeUndefined();
    expect(trimVersionError(RING, 3)).toBe('Choose a version from 1 to 2.');
    expect(trimVersionError({ ...RING, minAvailableVersion: 2 }, 1)).toBe('Only version 2 can be kept as the oldest.');
  });

  it('labels each version by what it can still do', () => {
    const ring = { ...RING, minAvailableVersion: 2, minDecryptionVersion: 3 };
    expect([1, 2, 3, 4, 5].map((version) => keyVersionState(ring, version)))
      .toEqual(['trimmed', 'archived', 'decrypt-only', 'active', 'active']);
    expect(usableKeyVersions(ring)).toEqual([5, 4]);
    expect(usableKeyVersions({ ...RING, minEncryptionVersion: 0, minDecryptionVersion: 1 })).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('transit errors', () => {
  it('explains permission, validation, and missing-key failures plainly', () => {
    expect(transitErrorText(new VaultError('authorization'), 'encrypt with this key').message)
      .toBe('Your token is not allowed to encrypt with this key. Ask an operator for a policy that grants it.');
    expect(transitErrorText(new VaultError('invalid-request', { reason: "missing 'context' for key derivation" }), 'encrypt with this key'))
      .toEqual({ message: 'Vault could not encrypt with this key.', detail: "Missing 'context' for key derivation" });
    expect(transitErrorText(new VaultError('invalid-request'), 'sign').detail).toBe('Check the values and try again.');
    expect(transitErrorText(new VaultError('not-found'), 'rotate the key').message).toMatch(/no longer exists/);
    expect(transitErrorText(new VaultError('unavailable'), 'x').message).toBe('Vault is currently unavailable.');
  });
});
