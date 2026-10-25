import type { KvSecretSummaries, KvSecretSummary } from '@/application/vault/useKvSecretSummaries';

export type SecretTableSortKey = 'name' | 'updated' | 'version';
export type SecretTableSortDirection = 'ascending' | 'descending';

export interface SecretTableSort {
  readonly key: SecretTableSortKey;
  readonly direction: SecretTableSortDirection;
}

interface SortableEntry {
  readonly kind: 'folder' | 'secret';
  readonly name: string;
  readonly path: string;
}

export const DEFAULT_SECRET_TABLE_SORT: SecretTableSort = { key: 'name', direction: 'ascending' };

/** Dates and versions start newest/highest first; names start A to Z. */
const FIRST_DIRECTION: Record<SecretTableSortKey, SecretTableSortDirection> = {
  name: 'ascending',
  updated: 'descending',
  version: 'descending',
};

export function nextSecretTableSort(
  current: SecretTableSort,
  key: SecretTableSortKey,
): SecretTableSort {
  if (current.key !== key) return { key, direction: FIRST_DIRECTION[key] };
  return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
}

function summaryValue(
  summary: KvSecretSummary | undefined,
  key: Exclude<SecretTableSortKey, 'name'>,
): number | undefined {
  if (!summary) return undefined;
  if (key === 'version') return summary.currentVersion;
  const time = summary.updatedTime ? Date.parse(summary.updatedTime) : Number.NaN;
  return Number.isNaN(time) ? undefined : time;
}

function compareNames(left: SortableEntry, right: SortableEntry): number {
  return left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
}

/**
 * Folders always stay above secrets. Rows whose metadata is not loaded or not
 * readable sort after rows with a value, in either direction.
 */
export function sortDirectoryEntries<T extends SortableEntry>(
  entries: readonly T[],
  sort: SecretTableSort,
  summaries?: KvSecretSummaries,
): readonly T[] {
  const sign = sort.direction === 'ascending' ? 1 : -1;
  const valueOf = (entry: T) => {
    if (sort.key === 'name' || entry.kind === 'folder') return undefined;
    const state = summaries?.get(entry.path);
    return summaryValue(state?.status === 'success' ? state.data : undefined, sort.key);
  };
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
    if (sort.key === 'name') return sign * compareNames(left, right);
    const leftValue = valueOf(left);
    const rightValue = valueOf(right);
    if (leftValue === undefined || rightValue === undefined) {
      if (leftValue !== rightValue) return leftValue === undefined ? 1 : -1;
      return compareNames(left, right);
    }
    return sign * (leftValue - rightValue) || compareNames(left, right);
  });
}
