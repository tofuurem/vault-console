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

  it('matches every word in any order when the phrase itself is absent', () => {
    const entries = [
      { mount: 'kv', path: 'team/payments/prod/api-key', name: 'api-key', kind: 'secret' as const },
      { mount: 'kv', path: 'team/payments/dev/api-key', name: 'api-key', kind: 'secret' as const },
      { mount: 'kv', path: 'team/search/prod/database', name: 'database', kind: 'secret' as const },
    ];

    expect(rankKvPathMatches(entries, 'prod api').map(({ entry }) => entry.path))
      .toEqual(['team/payments/prod/api-key']);
    expect(rankKvPathMatches(entries, '  API   payments ').map(({ entry }) => entry.path))
      .toEqual(['team/payments/dev/api-key', 'team/payments/prod/api-key']);
  });

  it('ranks a contiguous phrase above scattered words', () => {
    const entries = [
      { mount: 'kv', path: 'prod/x/api', name: 'api', kind: 'secret' as const },
      { mount: 'kv', path: 'team/prod api', name: 'prod api', kind: 'secret' as const },
    ];
    expect(rankKvPathMatches(entries, 'prod api')[0].entry.path).toBe('team/prod api');
  });
});
