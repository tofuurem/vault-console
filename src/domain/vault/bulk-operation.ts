import type { VaultErrorCode } from './errors';

export type BulkOutcomeStatus = 'succeeded' | 'denied' | 'missing' | 'failed';

export interface BulkItemOutcome {
  readonly path: string;
  readonly status: BulkOutcomeStatus;
  readonly version?: number;
  readonly message?: string;
  readonly errorCode?: VaultErrorCode;
}

export interface BulkOutcomeSummary {
  readonly total: number;
  readonly succeeded: number;
  readonly denied: number;
  readonly missing: number;
  readonly failed: number;
}

export function summarizeBulkOutcomes(
  outcomes: readonly BulkItemOutcome[],
): BulkOutcomeSummary {
  const counts = {
    succeeded: 0,
    denied: 0,
    missing: 0,
    failed: 0,
  };
  for (const outcome of outcomes) {
    counts[outcome.status] += 1;
  }
  return { total: outcomes.length, ...counts };
}
