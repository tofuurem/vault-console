import type {
  KvV2Gateway,
  KvV2Mount,
  KvV2Secret,
  KvV2SecretHistory,
  KvV2VersionMetadata,
  VaultSession,
} from '../../../domain/vault/contracts';
import { VaultError } from '../../../domain/vault/errors';
import {
  kvV2WriteOptions,
  validateKvV2Retention,
  type KvV2MountConfig,
  type KvV2SecretMetadataInput,
  type KvV2WriteStrategy,
} from '../../../domain/vault/kv-v2';
import {
  kvMountPathError,
  normalizeKvMountPath,
  type CreateKvV2Mount,
} from '../../../domain/vault/kv-mount';
import { encodeVaultPath, VaultHttpClient } from '../http/vault-http-client';
import {
  asBoolean,
  asNumber,
  asObject,
  asString,
  asStringArray,
  optionalString,
  optionalStringRecord,
} from '../http/validation';

function kvPath(mount: string, endpoint: string, path = ''): string {
  return [encodeVaultPath(mount), endpoint, encodeVaultPath(path)].filter(Boolean).join('/');
}

function assertVersions(versions: readonly number[]): void {
  if (
    versions.length === 0 ||
    versions.some((version) => !Number.isInteger(version) || version < 1)
  ) {
    throw new VaultError('invalid-request');
  }
}

function parseVersionMetadata(version: number, value: unknown): KvV2VersionMetadata {
  if (!Number.isInteger(version) || version < 1) throw new VaultError('invalid-response');
  const metadata = asObject(value);
  return {
    version,
    createdTime: asString(metadata.created_time),
    destroyed: asBoolean(metadata.destroyed),
    deletionTime: optionalString(metadata.deletion_time),
  };
}

export class VaultKvV2Adapter implements KvV2Gateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  async listMounts(session: VaultSession, signal?: AbortSignal): Promise<readonly KvV2Mount[]> {
    const response = asObject(
      await this.client.request(session.serverUrl, 'sys/internal/ui/mounts', {
        token: session.token,
        signal,
      }),
    );
    const data = asObject(response.data);
    const mounts = data.secret === undefined ? data : asObject(data.secret);

    return Object.entries(mounts).flatMap(([path, value]) => {
      const mount = asObject(value);
      const options = mount.options === null || mount.options === undefined ? {} : asObject(mount.options);
      if (mount.type !== 'kv' || options.version !== '2') return [];

      return [
        {
          path: path.replace(/\/+$/, ''),
          accessor: asString(mount.accessor),
          description: optionalString(mount.description) ?? '',
          version: 2 as const,
        },
      ];
    });
  }

  async createKvV2Mount(
    session: VaultSession,
    mount: CreateKvV2Mount,
    signal?: AbortSignal,
  ): Promise<void> {
    if (kvMountPathError(mount.path)) throw new VaultError('invalid-request');
    const path = normalizeKvMountPath(mount.path);
    await this.client.request(session.serverUrl, `sys/mounts/${encodeVaultPath(path)}`, {
      method: 'POST',
      token: session.token,
      body: {
        type: 'kv',
        description: mount.description.trim(),
        options: { version: '2' },
      },
      signal,
    });
  }

  async listPaths(
    session: VaultSession,
    mount: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    try {
      const response = asObject(
        await this.client.request(session.serverUrl, kvPath(mount, 'metadata', path), {
          token: session.token,
          query: { list: true },
          signal,
        }),
      );
      return asStringArray(asObject(response.data).keys);
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return [];
      throw error;
    }
  }

  async readSecret(
    session: VaultSession,
    mount: string,
    path: string,
    version?: number,
    signal?: AbortSignal,
  ): Promise<KvV2Secret> {
    const response = asObject(
      await this.client.request(session.serverUrl, kvPath(mount, 'data', path), {
        token: session.token,
        query: { version },
        signal,
      }),
    );
    const payload = asObject(response.data);
    const metadata = asObject(payload.metadata);

    return {
      mount: encodeVaultPath(mount),
      path: encodeVaultPath(path),
      data: asObject(payload.data),
      metadata: {
        createdTime: asString(metadata.created_time),
        version: asNumber(metadata.version),
        customMetadata: optionalStringRecord(metadata.custom_metadata),
        destroyed: asBoolean(metadata.destroyed),
        deletionTime: optionalString(metadata.deletion_time),
      },
    };
  }

  async writeSecret(
    session: VaultSession,
    mount: string,
    path: string,
    data: Readonly<Record<string, unknown>>,
    strategy: KvV2WriteStrategy,
    signal?: AbortSignal,
  ): Promise<number> {
    const options = kvV2WriteOptions(strategy);
    const response = asObject(
      await this.client.request(session.serverUrl, kvPath(mount, 'data', path), {
        method: 'POST',
        token: session.token,
        body: options ? { data, options } : { data },
        signal,
      }),
    );
    return asNumber(asObject(response.data).version);
  }

  async readSecretMetadata(
    session: VaultSession,
    mount: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<KvV2SecretHistory> {
    const response = asObject(
      await this.client.request(session.serverUrl, kvPath(mount, 'metadata', path), {
        token: session.token,
        signal,
      }),
    );
    const data = asObject(response.data);
    const versions = asObject(data.versions);

    return {
      createdTime: asString(data.created_time),
      updatedTime: asString(data.updated_time),
      currentVersion: asNumber(data.current_version),
      oldestVersion: asNumber(data.oldest_version),
      maxVersions: asNumber(data.max_versions),
      casRequired: asBoolean(data.cas_required),
      deleteVersionAfter: asString(data.delete_version_after),
      customMetadata: optionalStringRecord(data.custom_metadata),
      versions: Object.entries(versions)
        .map(([version, metadata]) => parseVersionMetadata(Number(version), metadata))
        .sort((left, right) => right.version - left.version),
    };
  }

  async updateSecretMetadata(
    session: VaultSession,
    mount: string,
    path: string,
    input: KvV2SecretMetadataInput,
    signal?: AbortSignal,
  ): Promise<void> {
    validateKvV2Retention(input);
    await this.client.request(session.serverUrl, kvPath(mount, 'metadata', path), {
      method: 'POST',
      token: session.token,
      body: {
        max_versions: input.maxVersions,
        cas_required: input.casRequired,
        delete_version_after: input.deleteVersionAfter,
        custom_metadata: input.customMetadata,
      },
      signal,
    });
  }

  async readMountConfig(
    session: VaultSession,
    mount: string,
    signal?: AbortSignal,
  ): Promise<KvV2MountConfig> {
    const response = asObject(
      await this.client.request(session.serverUrl, kvPath(mount, 'config'), {
        token: session.token,
        signal,
      }),
    );
    const data = asObject(response.data);
    return validateKvV2Retention({
      maxVersions: asNumber(data.max_versions),
      casRequired: asBoolean(data.cas_required),
      deleteVersionAfter: asString(data.delete_version_after),
    });
  }

  async updateMountConfig(
    session: VaultSession,
    mount: string,
    input: KvV2MountConfig,
    signal?: AbortSignal,
  ): Promise<void> {
    validateKvV2Retention(input);
    await this.client.request(session.serverUrl, kvPath(mount, 'config'), {
      method: 'POST',
      token: session.token,
      body: {
        max_versions: input.maxVersions,
        cas_required: input.casRequired,
        delete_version_after: input.deleteVersionAfter,
      },
      signal,
    });
  }

  async deleteLatestSecret(
    session: VaultSession,
    mount: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.request(session.serverUrl, kvPath(mount, 'data', path), {
      method: 'DELETE',
      token: session.token,
      signal,
    });
  }

  async deleteVersions(
    session: VaultSession,
    mount: string,
    path: string,
    versions: readonly number[],
    signal?: AbortSignal,
  ): Promise<void> {
    await this.applyVersionOperation(session, mount, path, 'delete', 'POST', versions, signal);
  }

  async undeleteVersions(
    session: VaultSession,
    mount: string,
    path: string,
    versions: readonly number[],
    signal?: AbortSignal,
  ): Promise<void> {
    await this.applyVersionOperation(session, mount, path, 'undelete', 'POST', versions, signal);
  }

  async destroyVersions(
    session: VaultSession,
    mount: string,
    path: string,
    versions: readonly number[],
    signal?: AbortSignal,
  ): Promise<void> {
    await this.applyVersionOperation(session, mount, path, 'destroy', 'PUT', versions, signal);
  }

  async deleteMetadata(
    session: VaultSession,
    mount: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.request(session.serverUrl, kvPath(mount, 'metadata', path), {
      method: 'DELETE',
      token: session.token,
      signal,
    });
  }

  private async applyVersionOperation(
    session: VaultSession,
    mount: string,
    path: string,
    endpoint: 'delete' | 'undelete' | 'destroy',
    method: 'POST' | 'PUT',
    versions: readonly number[],
    signal?: AbortSignal,
  ): Promise<void> {
    assertVersions(versions);
    await this.client.request(session.serverUrl, kvPath(mount, endpoint, path), {
      method,
      token: session.token,
      body: { versions },
      signal,
    });
  }
}
