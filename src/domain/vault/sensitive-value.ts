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

export function vaultToken(value: string): VaultToken {
  return new MemoryOnlySensitiveValue(value);
}

export function vaultPassword(value: string): VaultPassword {
  return new MemoryOnlySensitiveValue(value);
}
