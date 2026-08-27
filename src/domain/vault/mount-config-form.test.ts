import { describe, expect, it } from 'vitest';

import { parseMountConfigForm } from './mount-config-form';

describe('KV mount configuration form', () => {
  it('parses the supported KV v2 settings', () => {
    expect(parseMountConfigForm({
      maxVersions: '20',
      casRequired: true,
      deleteVersionAfter: ' 12h ',
    })).toEqual({
      ok: true,
      data: {
        maxVersions: 20,
        casRequired: true,
        deleteVersionAfter: '12h',
      },
    });
  });

  it('rejects invalid maximum versions and Vault durations', () => {
    expect(parseMountConfigForm({
      maxVersions: '2.5',
      casRequired: false,
      deleteVersionAfter: '-1h',
    })).toEqual({
      ok: false,
      errors: [
        'Maximum versions must be a non-negative whole number.',
        'Default delete delay must be a Vault duration such as 0s, 30m, or 24h.',
      ],
    });
  });
});
