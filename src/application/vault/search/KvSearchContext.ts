import { createContext, useContext } from 'react';

import type { VaultError } from '@/domain/vault/errors';
import type { KvPathEntry } from '@/domain/vault/search';
import type { RankedKvPathMatch } from './search-ranking';

export type KvSearchStatus =
  | 'idle'
  | 'scanning'
  | 'complete'
  | 'partial'
  | 'paused'
  | 'limit-reached';

export interface KvSearchMountState {
  readonly mount: string;
  readonly status: KvSearchStatus;
  readonly entries: readonly KvPathEntry[];
  readonly pendingPrefixes: readonly string[];
  readonly visitedPrefixes: readonly string[];
  readonly inaccessiblePrefixes: readonly string[];
  readonly failedPrefixes: readonly string[];
  readonly totalListRequests: number;
  readonly totalScannedPrefixes: number;
  readonly updatedAt?: number;
  readonly error?: VaultError;
}

export interface KvSearchContextValue {
  stateFor(mount: string): KvSearchMountState;
  start(mount: string): void;
  continueScan(mount: string): void;
  restart(mount: string): void;
  cancel(mount: string): void;
  activateMount(mount: string): void;
  matches(mount: string, query: string): readonly RankedKvPathMatch[];
  clear(): void;
}

export const KvSearchContext = createContext<KvSearchContextValue | null>(null);

export function useKvSearch(): KvSearchContextValue {
  const context = useContext(KvSearchContext);
  if (!context) throw new Error('useKvSearch must be used inside KvSearchProvider');
  return context;
}
