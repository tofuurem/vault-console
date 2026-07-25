import type {
  VaultCapability,
} from '@/domain/vault/contracts';
import type { BulkItemOutcome } from '@/domain/vault/bulk-operation';
import { normalizeVaultError } from '@/domain/vault/errors';

export function allowsVaultCapability(
  capabilities: readonly VaultCapability[] | undefined,
  required: VaultCapability,
): boolean {
  if (!capabilities || capabilities.includes('deny')) return false;
  return capabilities.includes('root') || capabilities.includes(required);
}

export function bulkOutcomeForError(
  path: string,
  cause: unknown,
  version?: number,
): BulkItemOutcome {
  const error = normalizeVaultError(cause);
  const status = error.code === 'authorization'
    ? 'denied'
    : error.code === 'not-found' ? 'missing' : 'failed';
  return {
    path,
    status,
    version,
    message: error.message,
    errorCode: error.code,
  };
}

export function uniqueVaultPaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.filter(Boolean))];
}
