import { describe, expect, it } from 'vitest';

import { kvSecretPathError, normalizeKvSecretPath } from './kv-secret-path';

describe('exact KV secret path', () => {
  it('normalizes surrounding whitespace and one optional leading slash', () => {
    expect(normalizeKvSecretPath(' /team/database ')).toBe('team/database');
    expect(kvSecretPathError(' /team/database ')).toBeUndefined();
    expect(kvSecretPathError('team database/primary')).toBeUndefined();
  });

  it.each([
    ['', 'Enter a secret path.'],
    ['folder/', 'Enter a secret path, not a folder path.'],
    ['folder//secret', 'Each path segment must have a name.'],
    ['//secret', 'Each path segment must have a name.'],
    ['folder/./secret', 'Relative path segments are not allowed.'],
    ['folder/../secret', 'Relative path segments are not allowed.'],
    ['folder/\u0000secret', 'Control characters are not allowed.'],
  ])('rejects %j', (value, message) => {
    expect(kvSecretPathError(value)).toBe(message);
  });
});
