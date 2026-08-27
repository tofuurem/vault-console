import type { KvV2MountConfig } from './kv-v2';
import { isVaultDuration } from './kv-v2';

export interface MountConfigFormValue {
  readonly maxVersions: string;
  readonly casRequired: boolean;
  readonly deleteVersionAfter: string;
}

export type MountConfigFormResult =
  | { readonly ok: true; readonly data: KvV2MountConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseMountConfigForm(value: MountConfigFormValue): MountConfigFormResult {
  const errors: string[] = [];
  const maxVersions = Number(value.maxVersions);
  if (!/^\d+$/.test(value.maxVersions.trim()) || !Number.isSafeInteger(maxVersions)) {
    errors.push('Maximum versions must be a non-negative whole number.');
  }
  const deleteVersionAfter = value.deleteVersionAfter.trim();
  if (!isVaultDuration(deleteVersionAfter)) {
    errors.push('Default delete delay must be a Vault duration such as 0s, 30m, or 24h.');
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      maxVersions,
      casRequired: value.casRequired,
      deleteVersionAfter,
    },
  };
}
