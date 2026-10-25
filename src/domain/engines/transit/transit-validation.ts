import { durationError } from '../engines';
import type { TransitKey } from './transit';

/** Vault's name pattern for transit keys: word characters, dots, and dashes, starting and ending with a word character. */
const KEY_NAME = /^\w(?:[\w.-]*\w)?$/;

export function transitKeyNameError(name: string, existing: readonly string[] = []): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a key name.';
  if (!KEY_NAME.test(trimmed)) return 'Use letters, numbers, dots, dashes, and underscores. Start and end with a letter or number.';
  if (existing.includes(trimmed)) return 'A key with this name already exists.';
  return undefined;
}

const UNIT_SECONDS: Readonly<Record<string, number>> = {
  ns: 1e-9,
  us: 1e-6,
  µs: 1e-6,
  ms: 1e-3,
  s: 1,
  m: 60,
  h: 3600,
};

/** Seconds in a Vault duration (`24h`, `1h30m`, `3600`); undefined when it does not parse. */
export function durationSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (durationError(trimmed)) return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  let total = 0;
  for (const match of trimmed.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) {
    total += Number(match[1]) * UNIT_SECONDS[match[2]];
  }
  return total;
}

/** Vault accepts 0 (off) or at least one hour. */
export function autoRotatePeriodError(value: string): string | undefined {
  const format = durationError(value);
  if (format) return format;
  const seconds = durationSeconds(value) ?? 0;
  if (seconds !== 0 && seconds < 3600) return 'Use 0 to turn automatic rotation off, or at least 1h.';
  return undefined;
}

/** A rotation period as an editable duration, e.g. 86400 → `24h`. */
export function autoRotatePeriodInput(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export const HMAC_KEY_SIZE = { min: 32, max: 512, default: 32 } as const;

export function hmacKeySizeError(value: string): string | undefined {
  const size = Number(value);
  if (!/^\d+$/.test(value.trim()) || size < HMAC_KEY_SIZE.min || size > HMAC_KEY_SIZE.max) {
    return `Use a whole number of bytes from ${HMAC_KEY_SIZE.min} to ${HMAC_KEY_SIZE.max}.`;
  }
  return undefined;
}

export interface KeyVersionLimits {
  readonly minDecryptionVersion: number;
  readonly minEncryptionVersion: number;
}

/**
 * Checks the version floors against the key ring. Decryption can only be
 * raised up to the latest version; encryption 0 means "always the latest".
 */
export function keyVersionLimitsError(key: Pick<TransitKey, 'latestVersion' | 'minAvailableVersion'>, limits: KeyVersionLimits): string | undefined {
  const { minDecryptionVersion: decryption, minEncryptionVersion: encryption } = limits;
  const floor = Math.max(1, key.minAvailableVersion);
  if (!Number.isInteger(decryption) || decryption < floor || decryption > key.latestVersion) {
    return `Minimum decryption version must be from ${floor} to ${key.latestVersion}.`;
  }
  if (!Number.isInteger(encryption) || encryption < 0 || encryption > key.latestVersion) {
    return `Minimum encryption version must be 0 (latest) or up to ${key.latestVersion}.`;
  }
  if (encryption !== 0 && encryption < decryption) {
    return 'Minimum encryption version cannot be lower than the minimum decryption version.';
  }
  return undefined;
}

/**
 * Highest version trimming may keep as the oldest. Vault requires both
 * version floors to be set explicitly and never trims past either of them.
 */
export function maxTrimVersion(key: Pick<TransitKey, 'minDecryptionVersion' | 'minEncryptionVersion'>): number | undefined {
  if (key.minDecryptionVersion < 1 || key.minEncryptionVersion < 1) return undefined;
  return Math.min(key.minDecryptionVersion, key.minEncryptionVersion);
}

export function trimVersionError(key: Pick<TransitKey, 'minDecryptionVersion' | 'minEncryptionVersion' | 'minAvailableVersion'>, version: number): string | undefined {
  const max = maxTrimVersion(key);
  if (max === undefined) return 'Set both minimum versions before trimming.';
  const min = Math.max(1, key.minAvailableVersion);
  if (!Number.isInteger(version) || version < min || version > max) {
    return min === max ? `Only version ${max} can be kept as the oldest.` : `Choose a version from ${min} to ${max}.`;
  }
  return undefined;
}

export const RANDOM_BYTES = { min: 1, max: 131_071 } as const;

export function randomBytesError(value: string): string | undefined {
  const bytes = Number(value);
  if (!/^\d+$/.test(value.trim()) || bytes < RANDOM_BYTES.min || bytes > RANDOM_BYTES.max) {
    return `Use a whole number from ${RANDOM_BYTES.min} to ${RANDOM_BYTES.max.toLocaleString('en-US')}.`;
  }
  return undefined;
}

export type VersionState = 'active' | 'decrypt-only' | 'archived' | 'trimmed';

/**
 * How a version can be used: versions at or above the encryption floor
 * encrypt and decrypt (sign and verify); older ones only decrypt (verify);
 * below the decryption floor they are archived; below the available floor
 * they were trimmed and are gone.
 */
export function keyVersionState(key: Pick<TransitKey, 'minDecryptionVersion' | 'minEncryptionVersion' | 'minAvailableVersion'>, version: number): VersionState {
  if (key.minAvailableVersion > 0 && version < key.minAvailableVersion) return 'trimmed';
  if (version < key.minDecryptionVersion) return 'archived';
  if (key.minEncryptionVersion > 0 && version < key.minEncryptionVersion) return 'decrypt-only';
  return 'active';
}

/** Versions a caller may pin for encrypt, sign, rewrap, or HMAC, newest first. */
export function usableKeyVersions(key: Pick<TransitKey, 'latestVersion' | 'minDecryptionVersion' | 'minEncryptionVersion' | 'minAvailableVersion'>): readonly number[] {
  const versions: number[] = [];
  for (let version = key.latestVersion; version >= 1; version -= 1) {
    if (keyVersionState(key, version) === 'active') versions.push(version);
  }
  return versions;
}
