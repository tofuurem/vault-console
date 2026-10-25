import { normalizeVaultError } from '@/domain/vault/errors';

/** Vault's own explanation, when the adapter captured one. */
export function vaultReason(error: unknown): string | undefined {
  return error === null || error === undefined ? undefined : normalizeVaultError(error).reason;
}

/**
 * Plain-English message for a failed database-engine action.
 * `action` completes "Your policy does not allow …", e.g. "listing roles".
 */
export function databaseErrorMessage(error: unknown, action: string): string {
  const normalized = normalizeVaultError(error);
  if (normalized.code === 'authorization') return `Your policy does not allow ${action}.`;
  const reason = vaultReason(normalized);
  if (reason) return `Vault reported: ${reason}`;
  return normalized.message;
}

export function isNotFound(error: unknown): boolean {
  return error !== null && error !== undefined && normalizeVaultError(error).code === 'not-found';
}
