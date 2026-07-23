import { describe, expect, it } from 'vitest';

import { directoryPathFromWildcard, explorerRoute } from './explorer-route';

describe('Explorer route identity', () => {
  it('encodes mounts, folders, and selected secret paths', () => {
    expect(explorerRoute('team/kv', 'billing/database/', 'billing/database/postgres')).toBe(
      '/explorer/team%2Fkv/billing/database/?secret=billing%2Fdatabase%2Fpostgres',
    );
  });

  it('normalizes a wildcard route back to a KV directory prefix', () => {
    expect(directoryPathFromWildcard(undefined)).toBe('');
    expect(directoryPathFromWildcard('billing/database')).toBe('billing/database/');
    expect(directoryPathFromWildcard('/billing//database/')).toBe('billing/database/');
  });
});
