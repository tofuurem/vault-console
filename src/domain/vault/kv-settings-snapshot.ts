import type { KvV2SecretHistory } from './contracts';
import type {
  KvV2MountConfig,
  KvV2SecretMetadataInput,
} from './kv-v2';

function sortedMetadata(
  metadata: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function secretMetadataInputFromHistory(
  history: KvV2SecretHistory,
): KvV2SecretMetadataInput {
  return {
    maxVersions: history.maxVersions,
    casRequired: history.casRequired,
    deleteVersionAfter: history.deleteVersionAfter,
    customMetadata: sortedMetadata(history.customMetadata),
  };
}

export function kvSecretMetadataFingerprint(
  history: KvV2SecretHistory,
): string {
  return JSON.stringify(secretMetadataInputFromHistory(history));
}

export function kvMountConfigFingerprint(config: KvV2MountConfig): string {
  return JSON.stringify({
    maxVersions: config.maxVersions,
    casRequired: config.casRequired,
    deleteVersionAfter: config.deleteVersionAfter,
  });
}
