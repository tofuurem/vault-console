import { describe, expect, it } from 'vitest';

import { parseSecretMetadataForm } from './secret-metadata-form';

describe('secret metadata form', () => {
  it('parses retention settings and trimmed custom metadata keys', () => {
    expect(parseSecretMetadataForm({
      maxVersions: '12',
      casRequired: true,
      deleteVersionAfter: ' 24h ',
      customMetadata: [
        { key: ' owner ', value: 'platform' },
        { key: '', value: '' },
      ],
    })).toEqual({
      ok: true,
      data: {
        maxVersions: 12,
        casRequired: true,
        deleteVersionAfter: '24h',
        customMetadata: { owner: 'platform' },
      },
    });
  });

  it('rejects invalid retention values and duplicate or empty keys', () => {
    const result = parseSecretMetadataForm({
      maxVersions: '-1',
      casRequired: false,
      deleteVersionAfter: 'tomorrow',
      customMetadata: [
        { key: 'owner', value: 'one' },
        { key: ' owner ', value: 'two' },
        { key: '', value: 'orphan' },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        'Maximum versions must be a non-negative whole number.',
        'Delete version after must be a Vault duration such as 0s, 30m, or 24h.',
        'Every custom metadata value needs a key.',
        'Custom metadata keys must be unique.',
      ],
    });
  });
});
