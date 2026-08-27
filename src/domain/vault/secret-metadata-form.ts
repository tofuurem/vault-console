import type { KvV2SecretMetadataInput } from './kv-v2';
import { isVaultDuration } from './kv-v2';

export interface CustomMetadataField {
  readonly key: string;
  readonly value: string;
}

export interface SecretMetadataFormValue {
  readonly maxVersions: string;
  readonly casRequired: boolean;
  readonly deleteVersionAfter: string;
  readonly customMetadata: readonly CustomMetadataField[];
}

export type SecretMetadataFormResult =
  | { readonly ok: true; readonly data: KvV2SecretMetadataInput }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseSecretMetadataForm(
  value: SecretMetadataFormValue,
): SecretMetadataFormResult {
  const errors: string[] = [];
  const maxVersions = Number(value.maxVersions);
  if (!/^\d+$/.test(value.maxVersions.trim()) || !Number.isSafeInteger(maxVersions)) {
    errors.push('Maximum versions must be a non-negative whole number.');
  }

  const deleteVersionAfter = value.deleteVersionAfter.trim();
  if (!isVaultDuration(deleteVersionAfter)) {
    errors.push('Delete version after must be a Vault duration such as 0s, 30m, or 24h.');
  }

  const populated = value.customMetadata.filter(({ key, value: fieldValue }) => (
    key.trim().length > 0 || fieldValue.length > 0
  ));
  if (populated.some(({ key }) => key.trim().length === 0)) {
    errors.push('Every custom metadata value needs a key.');
  }
  const keys = populated.map(({ key }) => key.trim()).filter(Boolean);
  if (new Set(keys).size !== keys.length) {
    errors.push('Custom metadata keys must be unique.');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      maxVersions,
      casRequired: value.casRequired,
      deleteVersionAfter,
      customMetadata: Object.fromEntries(
        populated.map(({ key, value: fieldValue }) => [key.trim(), fieldValue]),
      ),
    },
  };
}
