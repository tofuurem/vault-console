import type { VaultSessionLease } from './contracts';

interface LookupLeaseInput {
  readonly expireTime?: string;
  readonly ttlSeconds?: number;
  readonly renewable?: boolean;
}

interface DurationLeaseInput {
  readonly durationSeconds?: number;
  readonly renewable?: boolean;
  readonly renewed?: boolean;
}

function validDuration(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function expiryFromDuration(durationSeconds: number | undefined, now: number): number | undefined {
  return durationSeconds !== undefined && durationSeconds > 0
    ? now + durationSeconds * 1_000
    : undefined;
}

function expiryFromDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function leaseFromLookup(
  input: LookupLeaseInput,
  now = Date.now(),
): VaultSessionLease {
  const leaseDurationSeconds = validDuration(input.ttlSeconds);
  return {
    expiresAt: expiryFromDate(input.expireTime)
      ?? expiryFromDuration(leaseDurationSeconds, now),
    leaseDurationSeconds,
    renewable: input.renewable,
  };
}

export function leaseFromDuration(
  input: DurationLeaseInput,
  now = Date.now(),
): VaultSessionLease {
  const leaseDurationSeconds = validDuration(input.durationSeconds);
  return {
    expiresAt: expiryFromDuration(leaseDurationSeconds, now),
    leaseDurationSeconds,
    renewable: input.renewable,
    renewedAt: input.renewed ? now : undefined,
  };
}
