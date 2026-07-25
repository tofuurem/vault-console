import { describe, expect, it } from 'vitest';

import {
  kvPathEntryFromListKey,
  normalizeKvDirectoryPath,
} from './search';

describe('KV path search domain', () => {
  it('normalizes directory paths without changing logical segments', () => {
    expect(normalizeKvDirectoryPath('')).toBe('');
    expect(normalizeKvDirectoryPath('/platform//apps/')).toBe('platform/apps/');
  });

  it('maps LIST keys to folder and secret path entries', () => {
    expect(kvPathEntryFromListKey('applications', 'platform/', 'api/')).toEqual({
      mount: 'applications',
      kind: 'folder',
      name: 'api',
      path: 'platform/api/',
    });
    expect(kvPathEntryFromListKey('applications', 'platform/', 'token')).toEqual({
      mount: 'applications',
      kind: 'secret',
      name: 'token',
      path: 'platform/token',
    });
  });

  it('rejects empty LIST keys', () => {
    expect(kvPathEntryFromListKey('applications', '', '/')).toBeNull();
  });
});
