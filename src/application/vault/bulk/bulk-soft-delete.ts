import { kvActionPaths } from '@/application/vault/useKvActionPermissions';
import type {
  KvV2Gateway,
  VaultCapabilityMap,
  VaultSession,
} from '@/domain/vault/contracts';
import type { BulkItemOutcome } from '@/domain/vault/bulk-operation';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';
import {
  allowsVaultCapability,
  bulkOutcomeForError,
  uniqueVaultPaths,
} from './bulk-operation-helpers';

const BULK_SOFT_DELETE_CONCURRENCY = 4;

export interface BulkSoftDeleteCandidate {
  readonly path: string;
  readonly version: number;
  readonly canUndo: boolean;
}

export interface BulkSoftDeletePreflight {
  readonly requestedPaths: readonly string[];
  readonly eligible: readonly BulkSoftDeleteCandidate[];
  readonly excluded: readonly BulkItemOutcome[];
}

interface BulkSoftDeleteContext {
  readonly gateway: KvV2Gateway;
  readonly session: VaultSession;
  readonly mount: string;
}

interface PrepareBulkSoftDeleteInput extends BulkSoftDeleteContext {
  readonly paths: readonly string[];
  readonly queryCapabilities: (
    paths: readonly string[],
    signal?: AbortSignal,
  ) => Promise<VaultCapabilityMap>;
  readonly signal?: AbortSignal;
}

interface ExecuteBulkSoftDeleteInput extends BulkSoftDeleteContext {
  readonly candidates: readonly BulkSoftDeleteCandidate[];
  readonly signal?: AbortSignal;
}

interface UndoBulkSoftDeleteInput extends BulkSoftDeleteContext {
  readonly candidates: readonly BulkSoftDeleteCandidate[];
  readonly signal?: AbortSignal;
}

export async function prepareBulkSoftDelete({
  gateway,
  session,
  mount,
  paths,
  queryCapabilities,
  signal,
}: PrepareBulkSoftDeleteInput): Promise<BulkSoftDeletePreflight> {
  const requestedPaths = uniqueVaultPaths(paths);
  const actionPaths = new Map(
    requestedPaths.map((path) => [path, kvActionPaths(mount, path)]),
  );
  const capabilities = await queryCapabilities(
    [...actionPaths.values()].flatMap((pathsForSecret) => [
      pathsForSecret.deleteVersions,
      pathsForSecret.metadata,
      pathsForSecret.undelete,
    ]),
    signal,
  );

  const denied: BulkItemOutcome[] = [];
  const inspectable = requestedPaths.filter((path) => {
    const pathsForSecret = actionPaths.get(path)!;
    const canDelete = allowsVaultCapability(
      capabilities[pathsForSecret.deleteVersions],
      'update',
    );
    const canReadMetadata = allowsVaultCapability(
      capabilities[pathsForSecret.metadata],
      'read',
    );
    if (canDelete && canReadMetadata) return true;
    denied.push({
      path,
      status: 'denied',
      message: !canDelete
        ? 'Delete is not allowed for this secret.'
        : 'Metadata read is required to identify the current version.',
    });
    return false;
  });

  const inspected = await mapWithConcurrency(
    inspectable,
    BULK_SOFT_DELETE_CONCURRENCY,
    async (path): Promise<
      | { readonly candidate: BulkSoftDeleteCandidate }
      | { readonly excluded: BulkItemOutcome }
    > => {
      try {
        const history = await gateway.readSecretHistory(
          session,
          mount,
          path,
          signal,
        );
        const current = history.versions.find(
          (version) => version.version === history.currentVersion,
        );
        if (!current || current.destroyed || current.deletionTime) {
          return {
            excluded: {
              path,
              status: 'missing',
              version: history.currentVersion || undefined,
              message: current?.destroyed
                ? 'The current version is already destroyed.'
                : current?.deletionTime
                  ? 'The current version is already soft-deleted.'
                  : 'Vault returned no current version.',
            },
          };
        }
        const pathsForSecret = actionPaths.get(path)!;
        return {
          candidate: {
            path,
            version: current.version,
            canUndo: allowsVaultCapability(
              capabilities[pathsForSecret.undelete],
              'update',
            ),
          },
        };
      } catch (cause) {
        const outcome = bulkOutcomeForError(path, cause);
        if (outcome.errorCode === 'session-expired') throw cause;
        return { excluded: outcome };
      }
    },
  );

  return {
    requestedPaths,
    eligible: inspected.flatMap((result) => (
      'candidate' in result ? [result.candidate] : []
    )),
    excluded: [
      ...denied,
      ...inspected.flatMap((result) => (
        'excluded' in result ? [result.excluded] : []
      )),
    ],
  };
}

export async function executeBulkSoftDelete({
  gateway,
  session,
  mount,
  candidates,
  signal,
}: ExecuteBulkSoftDeleteInput): Promise<readonly BulkItemOutcome[]> {
  return mapWithConcurrency(
    candidates,
    BULK_SOFT_DELETE_CONCURRENCY,
    async ({ path, version }) => {
      try {
        await gateway.deleteVersions(session, mount, path, [version], signal);
        return { path, version, status: 'succeeded' as const };
      } catch (cause) {
        return bulkOutcomeForError(path, cause, version);
      }
    },
  );
}

export async function undoBulkSoftDelete({
  gateway,
  session,
  mount,
  candidates,
  signal,
}: UndoBulkSoftDeleteInput): Promise<readonly BulkItemOutcome[]> {
  return mapWithConcurrency(
    candidates.filter((candidate) => candidate.canUndo),
    BULK_SOFT_DELETE_CONCURRENCY,
    async ({ path, version }) => {
      try {
        await gateway.undeleteVersions(
          session,
          mount,
          path,
          [version],
          signal,
        );
        return { path, version, status: 'succeeded' as const };
      } catch (cause) {
        return bulkOutcomeForError(path, cause, version);
      }
    },
  );
}
