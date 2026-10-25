import type { KvPathEntry } from '@/domain/vault/search';

export interface RankedKvPathMatch {
  readonly entry: KvPathEntry;
  readonly score: number;
}

function matchScore(entry: KvPathEntry, query: string): number | null {
  const name = entry.name.toLocaleLowerCase();
  const path = entry.path.toLocaleLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 10;
  if (name.includes(query)) return 20;
  const segmentIndex = path.split('/').findIndex((segment) => segment.startsWith(query));
  if (segmentIndex >= 0) return 30 + segmentIndex;
  const pathIndex = path.indexOf(query);
  return pathIndex >= 0 ? 50 + pathIndex : null;
}

/** Lowercased whitespace-separated terms; the whole phrase ranks first. */
export function searchTerms(rawQuery: string): readonly string[] {
  return rawQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

function termsScore(entry: KvPathEntry, terms: readonly string[]): number | null {
  let total = 0;
  for (const term of terms) {
    const score = matchScore(entry, term);
    if (score === null) return null;
    total += score;
  }
  return 100 + total;
}

export function rankKvPathMatches(
  entries: readonly KvPathEntry[],
  rawQuery: string,
): readonly RankedKvPathMatch[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];
  const terms = searchTerms(query);
  return entries
    .flatMap((entry) => {
      const score = matchScore(entry, query)
        ?? (terms.length > 1 ? termsScore(entry, terms) : null);
      return score === null ? [] : [{ entry, score }];
    })
    .sort((left, right) => (
      left.score - right.score
      || left.entry.name.length - right.entry.name.length
      || left.entry.path.localeCompare(right.entry.path)
      || left.entry.kind.localeCompare(right.entry.kind)
    ));
}
