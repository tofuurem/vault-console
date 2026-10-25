import { describe, expect, it } from 'vitest';

import { describeVaultError, VaultError } from './errors';
import { sanitizeVaultReason } from './vault-reason';

describe('sanitizeVaultReason', () => {
  it('flattens multierror text into one sentence', () => {
    expect(sanitizeVaultReason(['1 error occurred:\n\t* "web" is not an allowed role\n\n'])).toBe('"web" is not an allowed role');
    expect(sanitizeVaultReason(['a', 'a', 'b'])).toBe('a; b');
    expect(sanitizeVaultReason([])).toBeUndefined();
    expect(sanitizeVaultReason([42, null])).toBeUndefined();
  });

  it('redacts credentials, tokens, and PEM material', () => {
    expect(sanitizeVaultReason(['failed postgresql://root:hunter2@db:5432 password=hunter2 PASSWORD \'hunter2\'']))
      .toBe('failed postgresql://root:***@db:5432 password=*** PASSWORD ***');
    expect(sanitizeVaultReason(['bad token hvs.CAESIabcdefghijkl'])).toBe('bad token ***');
    expect(sanitizeVaultReason(['could not parse key: -----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----']))
      .toBe('could not parse key:');
  });

  it('caps very long reasons', () => {
    expect(sanitizeVaultReason(['x'.repeat(400)])).toHaveLength(300);
  });
});

describe('describeVaultError', () => {
  it('adds the reason except for permission errors', () => {
    expect(describeVaultError(new VaultError('invalid-request', { reason: 'path is already in use at pki/' })))
      .toBe('Vault rejected the requested operation. Vault reported: path is already in use at pki/');
    expect(describeVaultError(new VaultError('authorization', { reason: 'permission denied' })))
      .toBe('Your Vault token does not allow this operation.');
    expect(describeVaultError(new VaultError('unavailable'))).toBe('Vault is currently unavailable.');
  });
});
