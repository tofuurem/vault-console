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

type ListResult =
  | { readonly prefix: string; readonly keys: readonly string[] }
  | { readonly prefix: string; readonly error: VaultError };

interface ScanState {
  readonly mount: string;
  readonly previous?: KvPathIndexCheckpoint;
  readonly entries: Map<string, KvPathEntry>;
  readonly visited: Set<string>;
  readonly inaccessible: Set<string>;
  readonly failures: Set<string>;
  readonly queue: string[];
  readonly queued: Set<string>;
  readonly deferred: string[];
  budgetListRequests: number;
  budgetEntries: number;
  scannedPrefixes: number;
  limitReached: boolean;
}

function entryIdentity(entry: KvPathEntry): string {
  return `${entry.kind}:${entry.path}`;
}

function initialPrefixes(previous: KvPathIndexCheckpoint | undefined): readonly string[] {
  if (previous?.pendingPrefixes.length) return previous.pendingPrefixes;
  return previous ? [] : [''];
}

function createScanState(mount: string, previous: KvPathIndexCheckpoint | undefined): ScanState {
  const visited = new Set(previous?.visitedPrefixes ?? []);
  const queue = unique(initialPrefixes(previous)).filter((prefix) => !visited.has(prefix));
  return {
    mount,
    previous,
    entries: new Map((previous?.entries ?? []).map((entry) => [entryIdentity(entry), entry])),
    visited,
    inaccessible: new Set(previous?.inaccessiblePrefixes ?? []),
    failures: new Set(previous?.failedPrefixes ?? []),
    queue,
    queued: new Set(queue),
    deferred: [],
    budgetListRequests: 0,
    budgetEntries: 0,
    scannedPrefixes: previous?.totalScannedPrefixes ?? 0,
    limitReached: false,
  };
}

function checkpoint(
  state: ScanState,
  status: KvPathIndexTerminalStatus,
  pendingPrefixes: readonly string[],
): KvPathIndexCheckpoint {
  return {
    mount: state.mount,
    status,
    entries: [...state.entries.values()],
    pendingPrefixes,
    visitedPrefixes: [...state.visited],
    inaccessiblePrefixes: [...state.inaccessible],
    failedPrefixes: [...state.failures],
    totalListRequests: (state.previous?.totalListRequests ?? 0) + state.budgetListRequests,
    totalScannedPrefixes: state.scannedPrefixes,
  };
}

function pendingPrefixes(state: ScanState): string[] {
  return unique([...state.deferred, ...state.queue]).filter((prefix) => !state.visited.has(prefix));
}

function enqueue(state: ScanState, prefix: string): void {
  if (state.visited.has(prefix) || state.queued.has(prefix)) return;
  state.queue.push(prefix);
  state.queued.add(prefix);
}

function takeBatch(state: ScanState, limits: KvPathScanLimits): string[] | null {
  const remainingRequests = limits.maxListRequests - state.budgetListRequests;
  if (remainingRequests <= 0) {
    state.limitReached = true;
    return null;
  }
  const batch = state.queue.splice(0, Math.min(
    limits.concurrency,
    remainingRequests,
    state.queue.length,
  ));
  batch.forEach((prefix) => state.queued.delete(prefix));
  state.budgetListRequests += batch.length;
  return batch;
}

function listBatch(
  list: ScanKvPathIndexOptions['list'],
  batch: readonly string[],
  signal: AbortSignal,
): Promise<ListResult[]> {
  return Promise.all(batch.map(async (prefix): Promise<ListResult> => {
    try {
      return { prefix, keys: await list(prefix, signal) };
    } catch (cause) {
      return { prefix, error: normalizeVaultError(cause) };
    }
  }));
}

function applyListError(
  state: ScanState,
  prefix: string,
  error: VaultError,
  signal: AbortSignal,
): void {
  if (error.code === 'aborted' || signal.aborted) throw abortError();
  if (error.code === 'session-expired') throw error;
  if (error.code === 'authorization') {
    state.visited.add(prefix);
    state.inaccessible.add(prefix);
    state.failures.delete(prefix);
    state.scannedPrefixes += 1;
    return;
  }
  if (error.code === 'not-found') {
    state.visited.add(prefix);
    state.inaccessible.delete(prefix);
    state.failures.delete(prefix);
    state.scannedPrefixes += 1;
    return;
  }
  state.failures.add(prefix);
  state.deferred.push(prefix);
}

function applyListedKeys(
  state: ScanState,
  prefix: string,
  keys: readonly string[],
  maxEntries: number,
): void {
  state.failures.delete(prefix);
  state.visited.add(prefix);
  state.scannedPrefixes += 1;
  for (const key of keys) {
    const entry = kvPathEntryFromListKey(state.mount, prefix, key);
    if (!entry) continue;
    const identity = entryIdentity(entry);
    if (!state.entries.has(identity)) {
      if (state.budgetEntries >= maxEntries) {
        state.visited.delete(prefix);
        state.scannedPrefixes -= 1;
        state.deferred.unshift(prefix);
        state.limitReached = true;
        return;
      }
      state.entries.set(identity, entry);
      state.budgetEntries += 1;
    }
    if (entry.kind === 'folder') enqueue(state, entry.path);
  }
}

function applyBatchResults(
  state: ScanState,
  results: readonly ListResult[],
  signal: AbortSignal,
  maxEntries: number,
): void {
  for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
    const result = results[resultIndex];
    if ('error' in result) {
      applyListError(state, result.prefix, result.error, signal);
      continue;
    }
    applyListedKeys(state, result.prefix, result.keys, maxEntries);
    if (state.limitReached) {
      for (const unprocessed of results.slice(resultIndex + 1)) {
        if (!state.visited.has(unprocessed.prefix)) state.deferred.push(unprocessed.prefix);
      }
      return;
    }
  }
}

function terminalStatus(
  state: ScanState,
  pending: readonly string[],
  limits: KvPathScanLimits,
): KvPathIndexTerminalStatus {
  if (state.limitReached || (pending.length > 0 && state.budgetListRequests >= limits.maxListRequests)) {
    return 'limit-reached';
  }
  if (state.inaccessible.size > 0 || state.failures.size > 0 || pending.length > 0) return 'partial';
  return 'complete';
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
  const state = createScanState(options.mount, previous);

  while (state.queue.length > 0) {
    assertNotAborted(signal);
    const batch = takeBatch(state, limits);
    if (!batch) break;
    const results = await listBatch(options.list, batch, signal);
    applyBatchResults(state, results, signal, limits.maxEntries);
    if (state.limitReached) break;
    options.onProgress?.(checkpoint(state, 'partial', pendingPrefixes(state)));
  }

  const pending = pendingPrefixes(state);
  return checkpoint(state, terminalStatus(state, pending, limits), pending);
}
