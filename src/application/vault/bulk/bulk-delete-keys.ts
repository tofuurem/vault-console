import { kvActionPaths } from '@/application/vault/useKvActionPermissions';
import type {
  KvV2Gateway,
  VaultCapabilityMap,
  VaultSession,
} from '@/domain/vault/contracts';
import type { BulkItemOutcome } from '@/domain/vault/bulk-operation';
import { normalizeVaultError } from '@/domain/vault/errors';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';
import {
  allowsVaultCapability,
  bulkOutcomeForError,
  uniqueVaultPaths,
} from './bulk-operation-helpers';

const BULK_DELETE_EXECUTION_CONCURRENCY = 4;

export interface BulkDeleteKeyCandidate {
  readonly path: string;
}

export interface BulkDeleteKeysPreflight {
  readonly requestedPaths: readonly string[];
  readonly eligible: readonly BulkDeleteKeyCandidate[];
  readonly excluded: readonly BulkItemOutcome[];
}

interface PrepareBulkDeleteKeysInput {
  readonly mount: string;
  readonly paths: readonly string[];
  readonly queryCapabilities: (
    paths: readonly string[],
    signal?: AbortSignal,
  ) => Promise<VaultCapabilityMap>;
  readonly signal?: AbortSignal;
}

interface ExecuteBulkDeleteKeysInput {
  readonly gateway: KvV2Gateway;
  readonly session: VaultSession;
  readonly mount: string;
  readonly candidates: readonly BulkDeleteKeyCandidate[];
  readonly signal?: AbortSignal;
}

export async function prepareBulkDeleteKeys({
  mount,
  paths,
  queryCapabilities,
  signal,
}: PrepareBulkDeleteKeysInput): Promise<BulkDeleteKeysPreflight> {
  const requestedPaths = [...uniqueVaultPaths(paths)]
    .filter((path) => !path.endsWith('/'))
    .sort((left, right) => left.localeCompare(right));
  const actionPaths = new Map(requestedPaths.map((path) => [
    path,
    kvActionPaths(mount, path).metadata,
  ]));

  let capabilities: VaultCapabilityMap;
  try {
    capabilities = await queryCapabilities([...actionPaths.values()], signal);
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'session-expired' || error.code === 'aborted') throw error;
    return {
      requestedPaths,
      eligible: requestedPaths.map((path) => ({ path })),
      excluded: [],
    };
  }

  const eligible: BulkDeleteKeyCandidate[] = [];
  const excluded: BulkItemOutcome[] = [];
  for (const path of requestedPaths) {
    const metadataPath = actionPaths.get(path)!;
    const available = capabilities[metadataPath];
    if (available === undefined || allowsVaultCapability(available, 'delete')) {
      eligible.push({ path });
    } else {
      excluded.push({
        path,
        status: 'denied',
        message: `Delete is not allowed on ${metadataPath}.`,
      });
    }
  }

  return { requestedPaths, eligible, excluded };
}

export async function executeBulkDeleteKeys({
  gateway,
  session,
  mount,
  candidates,
  signal,
}: ExecuteBulkDeleteKeysInput): Promise<readonly BulkItemOutcome[]> {
  return mapWithConcurrency(
    candidates,
    BULK_DELETE_EXECUTION_CONCURRENCY,
    async ({ path }) => {
      try {
        await gateway.deleteMetadata(session, mount, path, signal);
        return { path, status: 'succeeded' as const };
      } catch (cause) {
        return bulkOutcomeForError(path, cause);
      }
    },
  );
}
