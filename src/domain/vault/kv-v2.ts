import { VaultError } from './errors';

export type KvV2WriteStrategy =
  | { readonly type: 'create-only' }
  | { readonly type: 'check-and-set'; readonly version: number }
  | { readonly type: 'unconditional' };

export interface KvV2WriteOptions {
  readonly cas: number;
}

export interface KvV2RetentionSettings {
  readonly maxVersions: number;
  readonly casRequired: boolean;
  readonly deleteVersionAfter: string;
}

export interface KvV2SecretMetadataInput extends KvV2RetentionSettings {
  readonly customMetadata: Readonly<Record<string, string>>;
}

export type KvV2MountConfig = KvV2RetentionSettings;

// Vault accepts Go duration strings. KV configuration uses a non-negative
// duration and documents `0s` as the disabled value.
const VAULT_DURATION = /^(?:0s|(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+)$/u;

export function kvV2WriteOptions(
  strategy: KvV2WriteStrategy,
): KvV2WriteOptions | undefined {
  if (strategy.type === 'unconditional') return undefined;
  if (strategy.type === 'create-only') return { cas: 0 };
  if (!Number.isInteger(strategy.version) || strategy.version < 1) {
    throw new VaultError('invalid-request');
  }
  return { cas: strategy.version };
}

export function validateKvV2Retention<T extends KvV2RetentionSettings>(
  input: T,
): T {
  if (!Number.isInteger(input.maxVersions) || input.maxVersions < 0) {
    throw new VaultError('invalid-request');
  }
  if (!VAULT_DURATION.test(input.deleteVersionAfter)) {
    throw new VaultError('invalid-request');
  }
  if ('customMetadata' in input) {
    const metadata = input.customMetadata;
    if (
      typeof metadata !== 'object'
      || metadata === null
      || Array.isArray(metadata)
      || Object.entries(metadata).some(([key, value]) => (
        key.trim().length === 0 || typeof value !== 'string'
      ))
    ) {
      throw new VaultError('invalid-request');
    }
  }
  return input;
}
