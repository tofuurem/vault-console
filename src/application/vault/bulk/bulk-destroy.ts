import { kvActionPaths } from '@/application/vault/useKvActionPermissions';
import type {
  KvV2Gateway,
  KvV2VersionMetadata,
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

const BULK_DESTROY_PREFLIGHT_CONCURRENCY = 4;
const BULK_DESTROY_EXECUTION_CONCURRENCY = 2;

export interface BulkDestroyCandidate {
  readonly path: string;
  readonly versions: readonly KvV2VersionMetadata[];
}

export interface BulkDestroyTarget {
  readonly path: string;
  readonly versions: readonly number[];
}

export interface BulkDestroyOutcome extends BulkItemOutcome {
  readonly versions: readonly number[];
}

export interface BulkDestroyPreflight {
  readonly requestedPaths: readonly string[];
  readonly eligible: readonly BulkDestroyCandidate[];
  readonly excluded: readonly BulkItemOutcome[];
}

interface BulkDestroyContext {
  readonly gateway: KvV2Gateway;
  readonly session: VaultSession;
  readonly mount: string;
}

interface PrepareBulkDestroyInput extends BulkDestroyContext {
  readonly paths: readonly string[];
  readonly queryCapabilities: (
    paths: readonly string[],
    signal?: AbortSignal,
  ) => Promise<VaultCapabilityMap>;
  readonly signal?: AbortSignal;
}

interface ExecuteBulkDestroyInput extends BulkDestroyContext {
  readonly targets: readonly BulkDestroyTarget[];
  readonly signal?: AbortSignal;
}

export async function prepareBulkDestroy({
  gateway,
  session,
  mount,
  paths,
  queryCapabilities,
  signal,
}: PrepareBulkDestroyInput): Promise<BulkDestroyPreflight> {
  const requestedPaths = uniqueVaultPaths(paths);
  const actionPaths = new Map(
    requestedPaths.map((path) => [path, kvActionPaths(mount, path)]),
  );
  const capabilities = await queryCapabilities(
    [...actionPaths.values()].flatMap((pathsForSecret) => [
      pathsForSecret.metadata,
      pathsForSecret.destroy,
    ]),
    signal,
  );

  const denied: BulkItemOutcome[] = [];
  const inspectable = requestedPaths.filter((path) => {
    const pathsForSecret = actionPaths.get(path)!;
    const canReadMetadata = allowsVaultCapability(
      capabilities[pathsForSecret.metadata],
      'read',
    );
    const canDestroy = allowsVaultCapability(
      capabilities[pathsForSecret.destroy],
      'update',
    );
    if (canReadMetadata && canDestroy) return true;
    denied.push({
      path,
      status: 'denied',
      message: !canDestroy
        ? 'Destroy is not allowed for this secret.'
        : 'Metadata read is required to select explicit versions.',
    });
    return false;
  });

  const inspected = await mapWithConcurrency(
    inspectable,
    BULK_DESTROY_PREFLIGHT_CONCURRENCY,
    async (path): Promise<
      | { readonly candidate: BulkDestroyCandidate }
      | { readonly excluded: BulkItemOutcome }
    > => {
      try {
        const history = await gateway.readSecretMetadata(
          session,
          mount,
          path,
          signal,
        );
        const versions = history.versions.filter((version) => !version.destroyed);
        if (versions.length === 0) {
          return {
            excluded: {
              path,
              status: 'missing',
              message: 'No non-destroyed versions remain.',
            },
          };
        }
        return { candidate: { path, versions } };
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

export async function executeBulkDestroy({
  gateway,
  session,
  mount,
  targets,
  signal,
}: ExecuteBulkDestroyInput): Promise<readonly BulkDestroyOutcome[]> {
  const validTargets = targets.filter((target) => target.versions.length > 0);
  return mapWithConcurrency(
    validTargets,
    BULK_DESTROY_EXECUTION_CONCURRENCY,
    async ({ path, versions }) => {
      const explicitVersions = [...new Set(versions)].sort((left, right) => (
        left - right
      ));
      try {
        await gateway.destroyVersions(
          session,
          mount,
          path,
          explicitVersions,
          signal,
        );
        return {
          path,
          versions: explicitVersions,
          status: 'succeeded' as const,
        };
      } catch (cause) {
        return {
          ...bulkOutcomeForError(path, cause),
          versions: explicitVersions,
        };
      }
    },
  );
}
