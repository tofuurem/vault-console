export type VaultSealType = 'shamir' | 'auto';

export interface VaultSealStatus {
  readonly type: VaultSealType;
  readonly initialized: boolean;
  readonly sealed: boolean;
  readonly threshold: number;
  readonly shares: number;
  readonly progress: number;
  readonly nonce?: string;
  readonly version?: string;
  readonly clusterName?: string;
  readonly migration: boolean;
  readonly recoverySeal: boolean;
  readonly storageType?: string;
}

export type UnsealPhase =
  | 'uninitialized'
  | 'unsealed'
  | 'auto-unseal'
  | 'awaiting-shares';

export function unsealPhase(status: VaultSealStatus): UnsealPhase {
  if (!status.initialized) return 'uninitialized';
  if (!status.sealed) return 'unsealed';
  if (status.type === 'auto' && !status.migration) return 'auto-unseal';
  return 'awaiting-shares';
}

export function remainingShares(status: VaultSealStatus): number {
  return Math.max(0, status.threshold - status.progress);
}

export type UnsealSubmissionOutcome =
  | 'unsealed'
  | 'accepted'
  | 'duplicate'
  | 'reset-by-vault';

/**
 * Vault answers every accepted share with the new seal status. It ignores a
 * share that was already submitted in the current attempt, and discards the
 * whole attempt when the combined shares fail to decrypt the root key.
 */
export function classifyUnsealSubmission(
  before: VaultSealStatus | undefined,
  after: VaultSealStatus,
): UnsealSubmissionOutcome {
  if (!after.sealed) return 'unsealed';
  if (before && before.progress > 0 && after.progress === 0) return 'reset-by-vault';
  if (before && after.progress <= before.progress && after.nonce === before.nonce) return 'duplicate';
  return 'accepted';
}

const HEX_SHARE = /^[0-9a-f]+$/i;
const BASE64_SHARE = /^[A-Za-z0-9+/]+={0,2}$/;

export function normalizeUnsealKeyShare(value: string): string {
  return value.replace(/\s+/g, '');
}

export function isPlausibleUnsealKeyShare(value: string): boolean {
  const share = normalizeUnsealKeyShare(value);
  if (share.length < 16) return false;
  return (HEX_SHARE.test(share) && share.length % 2 === 0)
    || (BASE64_SHARE.test(share) && share.length % 4 === 0);
}
