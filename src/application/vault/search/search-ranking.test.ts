import { describe, expect, it } from 'vitest';

import type { KvPathEntry } from '@/domain/vault/search';
import { rankKvPathMatches } from './search-ranking';

const entries: readonly KvPathEntry[] = [
  { mount: 'applications', path: 'platform/payments/api-token', name: 'api-token', kind: 'secret' },
  { mount: 'applications', path: 'archive/api-token-old', name: 'api-token-old', kind: 'secret' },
  { mount: 'applications', path: 'api/', name: 'api', kind: 'folder' },
  { mount: 'applications', path: 'platform/api/', name: 'api', kind: 'folder' },
];

describe('rankKvPathMatches', () => {
  it('prefers exact basename, then basename prefix, then path matches', () => {
    expect(rankKvPathMatches(entries, 'api').map((match) => match.entry.path)).toEqual([
      'api/',
      'platform/api/',
      'platform/payments/api-token',
      'archive/api-token-old',
    ]);
  });

  it('does not match secret values because only path entries are accepted', () => {
    expect(rankKvPathMatches(entries, 'database-password')).toEqual([]);
  });
});
