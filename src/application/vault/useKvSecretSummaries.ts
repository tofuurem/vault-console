import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import type { KvV2SecretHistory } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import { createConcurrencyLimiter } from '@/shared/async/concurrency-limiter';
import { useKvV2Gateway } from './KvV2GatewayContext';
import { useVaultSession } from './VaultSessionContext';

/** Metadata requests running at once for one table; the rest wait in a queue. */
export const SECRET_SUMMARY_CONCURRENCY = 4;

/** Custom metadata key shown in the Owner column. */
export const SECRET_OWNER_METADATA_KEY = 'owner';

export interface KvSecretSummary {
  readonly updatedTime?: string;
  readonly currentVersion?: number;
  readonly owner?: string;
}

export type KvSecretSummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: KvSecretSummary }
  /** Not readable with this token, missing, or failed; shown as a quiet dash. */
  | { readonly status: 'unavailable' };

export type KvSecretSummaries = ReadonlyMap<string, KvSecretSummaryState>;

export function summaryFromHistory(history: KvV2SecretHistory): KvSecretSummary {
  const owner = history.customMetadata[SECRET_OWNER_METADATA_KEY]?.trim();
  return {
    updatedTime: history.updatedTime || undefined,
    currentVersion: history.currentVersion > 0 ? history.currentVersion : undefined,
    owner: owner || undefined,
  };
}

function combineSummaries(
  paths: readonly string[],
  results: readonly UseQueryResult<KvSecretSummary | null>[],
): { readonly summaries: KvSecretSummaries; readonly sessionExpired: boolean } {
  const summaries = new Map<string, KvSecretSummaryState>();
  let sessionExpired = false;
  results.forEach((result, index) => {
    if (result.isError && normalizeVaultError(result.error).code === 'session-expired') {
      sessionExpired = true;
    }
    summaries.set(paths[index], result.data
      ? { status: 'success', data: result.data }
      : result.isPending ? { status: 'loading' } : { status: 'unavailable' });
  });
  return { summaries, sessionExpired };
}

/**
 * Lazily reads KV v2 metadata for the given secret paths (normally the rows a
 * user has scrolled into view). Missing permission resolves quietly; an
 * expired session ends the session like other Vault hooks do.
 */
export function useKvSecretSummaries(
  mount: string,
  paths: readonly string[],
): KvSecretSummaries {
  const gateway = useKvV2Gateway();
  const vault = useVaultSession();
  const session = vault.session;
  const [limiter] = useState(() => createConcurrencyLimiter(SECRET_SUMMARY_CONCURRENCY));
  // A stable combine lets TanStack Query keep the same map between renders.
  const combine = useCallback(
    (results: readonly UseQueryResult<KvSecretSummary | null>[]) => combineSummaries(paths, results),
    [paths],
  );
  const { summaries, sessionExpired } = useQueries({
    queries: paths.map((path) => ({
      queryKey: vaultQueryKeys.secretMetadataSummary(mount, path),
      enabled: Boolean(session && mount),
      queryFn: async ({ signal }: { readonly signal: AbortSignal }) => {
        try {
          const history = await limiter.run(
            () => gateway.readSecretMetadata(session!, mount, path, signal),
            signal,
          );
          return summaryFromHistory(history);
        } catch (cause) {
          const error = normalizeVaultError(cause);
          // A row the token cannot describe is normal, not an error to report.
          if (error.code === 'authorization' || error.code === 'not-found') return null;
          throw error;
        }
      },
    })),
    combine,
  });

  useEffect(() => {
    if (sessionExpired) vault.expireSession();
  }, [sessionExpired, vault]);

  return summaries;
}
