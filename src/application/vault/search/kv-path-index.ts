import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import {
  kvPathEntryFromListKey,
  type KvPathEntry,
} from '@/domain/vault/search';

export type KvPathIndexTerminalStatus = 'complete' | 'partial' | 'limit-reached';

export interface KvPathScanLimits {
  readonly maxEntries: number;
  readonly maxListRequests: number;
  readonly concurrency: number;
}

export interface KvPathIndexCheckpoint {
  readonly mount: string;
  readonly status: KvPathIndexTerminalStatus;
  readonly entries: readonly KvPathEntry[];
  readonly pendingPrefixes: readonly string[];
  readonly visitedPrefixes: readonly string[];
  readonly inaccessiblePrefixes: readonly string[];
  readonly failedPrefixes: readonly string[];
  readonly totalListRequests: number;
  readonly totalScannedPrefixes: number;
}

export interface ScanKvPathIndexOptions {
  readonly mount: string;
  readonly list: (path: string, signal: AbortSignal) => Promise<readonly string[]>;
  readonly signal?: AbortSignal;
  readonly checkpoint?: KvPathIndexCheckpoint;
  readonly limits?: Partial<KvPathScanLimits>;
  readonly onProgress?: (checkpoint: KvPathIndexCheckpoint) => void;
}

const DEFAULT_LIMITS: KvPathScanLimits = {
  maxEntries: 5_000,
  maxListRequests: 2_000,
  concurrency: 4,
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function abortError(): VaultError {
  return new VaultError('aborted', {
    cause: new DOMException('cancelled', 'AbortError'),
  });
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function resolvedLimits(input: Partial<KvPathScanLimits> | undefined): KvPathScanLimits {
  const limits = { ...DEFAULT_LIMITS, ...input };
  if (
    !Number.isInteger(limits.maxEntries)
    || limits.maxEntries < 1
    || !Number.isInteger(limits.maxListRequests)
    || limits.maxListRequests < 1
    || !Number.isInteger(limits.concurrency)
    || limits.concurrency < 1
  ) {
    throw new VaultError('invalid-request');
  }
  return limits;
}

export async function scanKvPathIndex(
  options: ScanKvPathIndexOptions,
): Promise<KvPathIndexCheckpoint> {
  const limits = resolvedLimits(options.limits);
  const controller = options.signal
    ? null
    : new AbortController();
  const signal = options.signal ?? controller!.signal;
  const previous = options.checkpoint?.mount === options.mount
    ? options.checkpoint
    : undefined;
  const entries = new Map(
    (previous?.entries ?? []).map((entry) => [`${entry.kind}:${entry.path}`, entry]),
  );
  const visited = new Set(previous?.visitedPrefixes ?? []);
  const inaccessible = new Set(previous?.inaccessiblePrefixes ?? []);
  const failures = new Set(previous?.failedPrefixes ?? []);
  const queue = unique(
    previous?.pendingPrefixes.length
      ? previous.pendingPrefixes
      : previous
        ? []
        : [''],
  ).filter((prefix) => !visited.has(prefix));
  const queued = new Set(queue);
  const deferred: string[] = [];
  let budgetListRequests = 0;
  let budgetEntries = 0;
  let scannedPrefixes = previous?.totalScannedPrefixes ?? 0;
  let limitReached = false;
  const checkpoint = (
    status: KvPathIndexTerminalStatus,
    pendingPrefixes: readonly string[],
  ): KvPathIndexCheckpoint => ({
    mount: options.mount,
    status,
    entries: [...entries.values()],
    pendingPrefixes,
    visitedPrefixes: [...visited],
    inaccessiblePrefixes: [...inaccessible],
    failedPrefixes: [...failures],
    totalListRequests: (previous?.totalListRequests ?? 0) + budgetListRequests,
    totalScannedPrefixes: scannedPrefixes,
  });

  const enqueue = (prefix: string) => {
    if (visited.has(prefix) || queued.has(prefix)) return;
    queue.push(prefix);
    queued.add(prefix);
  };

  while (queue.length > 0) {
    assertNotAborted(signal);
    const remainingRequests = limits.maxListRequests - budgetListRequests;
    if (remainingRequests <= 0) {
      limitReached = true;
      break;
    }
    const batch = queue.splice(0, Math.min(
      limits.concurrency,
      remainingRequests,
      queue.length,
    ));
    batch.forEach((prefix) => queued.delete(prefix));
    budgetListRequests += batch.length;
    const results = await Promise.all(batch.map(async (prefix) => {
      try {
        return { prefix, keys: await options.list(prefix, signal) } as const;
      } catch (cause) {
        return { prefix, error: normalizeVaultError(cause) } as const;
      }
    }));

    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const result = results[resultIndex];
      if ('error' in result) {
        if (result.error.code === 'aborted' || signal.aborted) throw abortError();
        if (result.error.code === 'session-expired') throw result.error;
        if (result.error.code === 'authorization') {
          visited.add(result.prefix);
          inaccessible.add(result.prefix);
          failures.delete(result.prefix);
          scannedPrefixes += 1;
          continue;
        }
        if (result.error.code === 'not-found') {
          visited.add(result.prefix);
          inaccessible.delete(result.prefix);
          failures.delete(result.prefix);
          scannedPrefixes += 1;
          continue;
        }
        failures.add(result.prefix);
        deferred.push(result.prefix);
        continue;
      }

      failures.delete(result.prefix);
      visited.add(result.prefix);
      scannedPrefixes += 1;
      for (const key of result.keys) {
        const entry = kvPathEntryFromListKey(options.mount, result.prefix, key);
        if (!entry) continue;
        const identity = `${entry.kind}:${entry.path}`;
        if (!entries.has(identity)) {
          if (budgetEntries >= limits.maxEntries) {
            visited.delete(result.prefix);
            scannedPrefixes -= 1;
            deferred.unshift(result.prefix);
            limitReached = true;
            break;
          }
          entries.set(identity, entry);
          budgetEntries += 1;
        }
        if (entry.kind === 'folder') enqueue(entry.path);
      }

      if (limitReached) {
        for (const unprocessed of results.slice(resultIndex + 1)) {
          if (!visited.has(unprocessed.prefix)) deferred.push(unprocessed.prefix);
        }
        break;
      }
    }
    if (limitReached) break;
    options.onProgress?.(checkpoint(
      'partial',
      unique([...deferred, ...queue]).filter((prefix) => !visited.has(prefix)),
    ));
  }

  const pendingPrefixes = unique([...deferred, ...queue]).filter(
    (prefix) => !visited.has(prefix),
  );
  const status: KvPathIndexTerminalStatus = limitReached || (
    pendingPrefixes.length > 0 && budgetListRequests >= limits.maxListRequests
  )
    ? 'limit-reached'
    : inaccessible.size > 0 || failures.size > 0 || pendingPrefixes.length > 0
      ? 'partial'
      : 'complete';

  return checkpoint(status, pendingPrefixes);
}
