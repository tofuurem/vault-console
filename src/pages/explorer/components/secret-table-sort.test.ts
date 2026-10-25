import { describe, expect, it } from 'vitest';

import type { KvSecretSummaries } from '@/application/vault/useKvSecretSummaries';
import {
  DEFAULT_SECRET_TABLE_SORT,
  nextSecretTableSort,
  sortDirectoryEntries,
} from './secret-table-sort';

const entries = [
  { kind: 'secret' as const, name: 'beta', path: 'beta' },
  { kind: 'folder' as const, name: 'zeta', path: 'zeta/' },
  { kind: 'secret' as const, name: 'alpha', path: 'alpha' },
  { kind: 'secret' as const, name: 'gamma', path: 'gamma' },
  { kind: 'folder' as const, name: 'apps', path: 'apps/' },
];

const summaries: KvSecretSummaries = new Map([
  ['alpha', { status: 'success', data: { updatedTime: '2026-10-01T00:00:00Z', currentVersion: 7 } }],
  ['beta', { status: 'success', data: { updatedTime: '2026-10-20T00:00:00Z', currentVersion: 2 } }],
  ['gamma', { status: 'unavailable' }],
]);

const names = (rows: readonly { readonly name: string }[]) => rows.map((row) => row.name);

describe('sortDirectoryEntries', () => {
  it('defaults to name order with folders first', () => {
    expect(names(sortDirectoryEntries(entries, DEFAULT_SECRET_TABLE_SORT)))
      .toEqual(['apps', 'zeta', 'alpha', 'beta', 'gamma']);
  });

  it('reverses names within each kind and keeps folders first', () => {
    expect(names(sortDirectoryEntries(entries, { key: 'name', direction: 'descending' })))
      .toEqual(['zeta', 'apps', 'gamma', 'beta', 'alpha']);
  });

  it('sorts by update time and keeps rows without metadata last', () => {
    expect(names(sortDirectoryEntries(entries, { key: 'updated', direction: 'descending' }, summaries)))
      .toEqual(['apps', 'zeta', 'beta', 'alpha', 'gamma']);
    expect(names(sortDirectoryEntries(entries, { key: 'updated', direction: 'ascending' }, summaries)))
      .toEqual(['apps', 'zeta', 'alpha', 'beta', 'gamma']);
  });

  it('sorts by current version', () => {
    expect(names(sortDirectoryEntries(entries, { key: 'version', direction: 'descending' }, summaries)))
      .toEqual(['apps', 'zeta', 'alpha', 'beta', 'gamma']);
    expect(names(sortDirectoryEntries(entries, { key: 'version', direction: 'ascending' })))
      .toEqual(['apps', 'zeta', 'alpha', 'beta', 'gamma']);
  });

  it('does not mutate its input', () => {
    const copy = [...entries];
    sortDirectoryEntries(entries, { key: 'name', direction: 'descending' });
    expect(entries).toEqual(copy);
  });
});

describe('nextSecretTableSort', () => {
  it('starts a new column in its natural direction and toggles the active one', () => {
    expect(nextSecretTableSort(DEFAULT_SECRET_TABLE_SORT, 'updated'))
      .toEqual({ key: 'updated', direction: 'descending' });
    expect(nextSecretTableSort({ key: 'updated', direction: 'descending' }, 'updated'))
      .toEqual({ key: 'updated', direction: 'ascending' });
    expect(nextSecretTableSort(DEFAULT_SECRET_TABLE_SORT, 'name'))
      .toEqual({ key: 'name', direction: 'descending' });
    expect(nextSecretTableSort({ key: 'version', direction: 'ascending' }, 'name'))
      .toEqual({ key: 'name', direction: 'ascending' });
  });
});
