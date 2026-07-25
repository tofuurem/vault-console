import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { KvV2Gateway, VaultSession } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import {
  KvSearchContext,
  type KvSearchContextValue,
  type KvSearchMountState,
} from './KvSearchContext';
import {
  scanKvPathIndex,
  type KvPathIndexCheckpoint,
  type KvPathScanLimits,
} from './kv-path-index';
import { rankKvPathMatches } from './search-ranking';

const CACHE_TTL_MS = 5 * 60 * 1_000;

interface KvSearchProviderProps {
  readonly children: ReactNode;
  readonly session: VaultSession;
  readonly gateway: KvV2Gateway;
  readonly onSessionExpired?: () => void;
  readonly cacheTtlMs?: number;
  readonly limits?: Partial<KvPathScanLimits>;
  readonly now?: () => number;
}

function emptyState(mount: string): KvSearchMountState {
  return {
    mount,
    status: 'idle',
    entries: [],
    pendingPrefixes: [],
    visitedPrefixes: [],
    inaccessiblePrefixes: [],
    failedPrefixes: [],
    totalListRequests: 0,
    totalScannedPrefixes: 0,
  };
}

function checkpointFromState(state: KvSearchMountState): KvPathIndexCheckpoint {
  return {
    mount: state.mount,
    status: state.status === 'complete' || state.status === 'partial' || state.status === 'limit-reached'
      ? state.status
      : state.pendingPrefixes.length > 0 ? 'partial' : 'complete',
    entries: state.entries,
    pendingPrefixes: state.pendingPrefixes,
    visitedPrefixes: state.visitedPrefixes,
    inaccessiblePrefixes: state.inaccessiblePrefixes,
    failedPrefixes: state.failedPrefixes,
    totalListRequests: state.totalListRequests,
    totalScannedPrefixes: state.totalScannedPrefixes,
  };
}

export function KvSearchProvider({
  children,
  session,
  gateway,
  onSessionExpired,
  cacheTtlMs = CACHE_TTL_MS,
  limits,
  now = Date.now,
}: KvSearchProviderProps) {
  const [states, setStates] = useState<ReadonlyMap<string, KvSearchMountState>>(
    () => new Map(),
  );
  const statesRef = useRef(states);
  const controllers = useRef(new Map<string, AbortController>());
  const generations = useRef(new Map<string, number>());
  const sessionScope = `${session.serverUrl}\u001f${session.authMethod}\u001f${session.displayName ?? ''}`;
  statesRef.current = states;

  const update = useCallback((
    mount: string,
    reducer: (state: KvSearchMountState) => KvSearchMountState,
  ) => {
    setStates((current) => {
      const next = new Map(current);
      next.set(mount, reducer(current.get(mount) ?? emptyState(mount)));
      return next;
    });
  }, []);

  const abortAll = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    generations.current.clear();
  }, []);
  const clear = useCallback(() => {
    abortAll();
    setStates(new Map());
  }, [abortAll]);

  useEffect(() => {
    clear();
    return abortAll;
  }, [abortAll, clear, sessionScope]);

  const run = useCallback((mount: string, mode: 'start' | 'continue' | 'restart') => {
    if (!mount) return;
    const current = statesRef.current.get(mount) ?? emptyState(mount);
    if (current.status === 'scanning') return;
    if (mode === 'start') {
      if (
        current.status === 'complete'
        && current.updatedAt !== undefined
        && now() - current.updatedAt < cacheTtlMs
      ) return;
      if (
        current.status === 'partial'
        || current.status === 'paused'
        || current.status === 'limit-reached'
      ) return;
    }
    controllers.current.get(mount)?.abort();
    const controller = new AbortController();
    controllers.current.set(mount, controller);
    const generation = (generations.current.get(mount) ?? 0) + 1;
    generations.current.set(mount, generation);
    const checkpoint = mode === 'restart'
      || mode === 'start'
      ? undefined
      : checkpointFromState(current);
    update(mount, (state) => ({
      ...(checkpoint ? state : emptyState(mount)),
      status: 'scanning',
      error: undefined,
    }));

    void scanKvPathIndex({
      mount,
      signal: controller.signal,
      checkpoint,
      limits,
      list: (path, signal) => gateway.listPaths(session, mount, path, signal),
      onProgress: (progress) => {
        if (
          generations.current.get(mount) !== generation
          || controller.signal.aborted
        ) return;
        update(mount, (state) => ({
          ...state,
          ...progress,
          status: 'scanning',
        }));
      },
    }).then((result) => {
      if (generations.current.get(mount) !== generation) return;
      controllers.current.delete(mount);
      update(mount, () => ({
        ...result,
        updatedAt: now(),
      }));
    }).catch((cause) => {
      if (generations.current.get(mount) !== generation) return;
      controllers.current.delete(mount);
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') onSessionExpired?.();
      update(mount, (state) => ({
        ...state,
        status: 'paused',
        error: error.code === 'aborted' ? undefined : error,
        updatedAt: now(),
      }));
    });
  }, [cacheTtlMs, gateway, limits, now, onSessionExpired, session, update]);

  const start = useCallback((mount: string) => run(mount, 'start'), [run]);
  const continueScan = useCallback((mount: string) => run(mount, 'continue'), [run]);
  const restart = useCallback((mount: string) => run(mount, 'restart'), [run]);
  const cancel = useCallback((mount: string) => {
    generations.current.set(mount, (generations.current.get(mount) ?? 0) + 1);
    controllers.current.get(mount)?.abort();
    controllers.current.delete(mount);
    update(mount, (state) => ({
      ...state,
      status: 'paused',
      updatedAt: now(),
    }));
  }, [now, update]);
  const activateMount = useCallback((mount: string) => {
    for (const [candidate, controller] of controllers.current) {
      if (candidate === mount) continue;
      generations.current.set(candidate, (generations.current.get(candidate) ?? 0) + 1);
      controller.abort();
      controllers.current.delete(candidate);
      update(candidate, (state) => ({
        ...state,
        status: 'paused',
        updatedAt: now(),
      }));
    }
  }, [now, update]);
  const stateFor = useCallback(
    (mount: string) => states.get(mount) ?? emptyState(mount),
    [states],
  );
  const matches = useCallback(
    (mount: string, query: string) => rankKvPathMatches(
      states.get(mount)?.entries ?? [],
      query,
    ),
    [states],
  );
  const value = useMemo<KvSearchContextValue>(() => ({
    stateFor,
    start,
    continueScan,
    restart,
    cancel,
    activateMount,
    matches,
    clear,
  }), [
    activateMount,
    cancel,
    clear,
    continueScan,
    matches,
    restart,
    start,
    stateFor,
  ]);

  return <KvSearchContext.Provider value={value}>{children}</KvSearchContext.Provider>;
}
