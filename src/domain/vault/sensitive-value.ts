const REDACTED = '[REDACTED]';
const sensitiveKind = Symbol('sensitive-kind');

export interface SensitiveValue<Kind extends string> {
  readonly [sensitiveKind]: Kind;
  reveal(): string;
  toJSON(): typeof REDACTED;
  toString(): typeof REDACTED;
}

class MemoryOnlySensitiveValue<Kind extends string> implements SensitiveValue<Kind> {
  declare readonly [sensitiveKind]: Kind;
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): typeof REDACTED {
    return REDACTED;
  }

  toString(): typeof REDACTED {
    return REDACTED;
  }
}

export type VaultToken = SensitiveValue<'vault-token'>;
export type VaultPassword = SensitiveValue<'vault-password'>;
export type VaultUnsealKey = SensitiveValue<'vault-unseal-key'>;

export function vaultToken(value: string): VaultToken {
  return new MemoryOnlySensitiveValue(value);
}

export function vaultPassword(value: string): VaultPassword {
  return new MemoryOnlySensitiveValue(value);
}

export function vaultUnsealKey(value: string): VaultUnsealKey {
  return new MemoryOnlySensitiveValue(value);
}

/** A single-use response-wrapping token. It can be unwrapped exactly once. */
export type VaultWrappingToken = SensitiveValue<'vault-wrapping-token'>;
/** One field of a secret read through unwrapping, printable form only. */
export type UnwrappedSecretValue = SensitiveValue<'unwrapped-secret-value'>;

export function vaultWrappingToken(value: string): VaultWrappingToken {
  return new MemoryOnlySensitiveValue(value);
}

export function unwrappedSecretValue(value: string): UnwrappedSecretValue {
  return new MemoryOnlySensitiveValue(value);
}
