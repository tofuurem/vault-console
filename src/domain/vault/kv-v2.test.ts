import { describe, expect, it } from 'vitest';

import { VaultError } from './errors';
import {
  kvV2WriteOptions,
  validateKvV2Retention,
  type KvV2SecretMetadataInput,
} from './kv-v2';

describe('KV v2 domain inputs', () => {
  it('keeps create-only, known-version, and unconditional writes distinct', () => {
    expect(kvV2WriteOptions({ type: 'create-only' })).toEqual({ cas: 0 });
    expect(kvV2WriteOptions({ type: 'check-and-set', version: 7 })).toEqual({ cas: 7 });
    expect(kvV2WriteOptions({ type: 'unconditional' })).toBeUndefined();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid known-version CAS %s',
    (version) => {
      expect(() => kvV2WriteOptions({ type: 'check-and-set', version }))
        .toThrowError(VaultError);
    },
  );

  it.each(['0s', '30s', '1h30m', '250ms', '1.5h'])(
    'accepts Vault duration %s',
    (deleteVersionAfter) => {
      expect(() => validateKvV2Retention({
        maxVersions: 10,
        casRequired: true,
        deleteVersionAfter,
      })).not.toThrow();
    },
  );

  it.each(['', '0', '-1h', 'tomorrow', '1d', '1 h'])('rejects invalid Vault duration %s', (deleteVersionAfter) => {
    expect(() => validateKvV2Retention({
      maxVersions: 10,
      casRequired: false,
      deleteVersionAfter,
    })).toThrowError(VaultError);
  });

  it.each([-1, 1.5, Number.NaN])('rejects invalid max versions %s', (maxVersions) => {
    expect(() => validateKvV2Retention({
      maxVersions,
      casRequired: false,
      deleteVersionAfter: '0s',
    })).toThrowError(VaultError);
  });

  it('rejects blank custom metadata keys', () => {
    const input: KvV2SecretMetadataInput = {
      maxVersions: 0,
      casRequired: false,
      deleteVersionAfter: '0s',
      customMetadata: { '  ': 'invalid' },
    };

    expect(() => validateKvV2Retention(input)).toThrowError(VaultError);
  });
});
