import { describe, expect, it } from 'vitest';

import type { KvV2SecretHistory } from './contracts';
import {
  kvMountConfigFingerprint,
  kvSecretMetadataFingerprint,
  secretMetadataInputFromHistory,
} from './kv-settings-snapshot';

const history = (customMetadata: Readonly<Record<string, string>>): KvV2SecretHistory => ({
  createdTime: '2026-08-20T12:00:00Z',
  updatedTime: '2026-08-21T12:00:00Z',
  currentVersion: 4,
  oldestVersion: 1,
  maxVersions: 10,
  casRequired: false,
  deleteVersionAfter: '24h',
  customMetadata,
  versions: [],
});

describe('KV full-document setting snapshots', () => {
  it('normalizes custom metadata ordering and ignores version-history fields', () => {
    const first = history({ owner: 'platform', environment: 'production' });
    const second = {
      ...history({ environment: 'production', owner: 'platform' }),
      updatedTime: '2026-08-28T15:00:00Z',
      currentVersion: 9,
    };

    expect(kvSecretMetadataFingerprint(first)).toBe(kvSecretMetadataFingerprint(second));
    expect(secretMetadataInputFromHistory(first)).toEqual({
      maxVersions: 10,
      casRequired: false,
      deleteVersionAfter: '24h',
      customMetadata: {
        environment: 'production',
        owner: 'platform',
      },
    });
  });

  it('detects supported key metadata and mount configuration changes', () => {
    expect(kvSecretMetadataFingerprint(history({ owner: 'platform' })))
      .not.toBe(kvSecretMetadataFingerprint({
        ...history({ owner: 'security' }),
        maxVersions: 12,
      }));
    expect(kvMountConfigFingerprint({
      maxVersions: 10,
      casRequired: false,
      deleteVersionAfter: '0s',
    })).not.toBe(kvMountConfigFingerprint({
      maxVersions: 12,
      casRequired: false,
      deleteVersionAfter: '0s',
    }));
  });
});
