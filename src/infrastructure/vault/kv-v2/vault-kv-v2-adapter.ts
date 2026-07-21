import type {
  KvV2Gateway,
  KvV2Mount,
  KvV2Secret,
  KvV2SecretHistory,
  KvV2VersionMetadata,
  VaultSession,
} from '../../../domain/vault/contracts';
import { VaultError } from '../../../domain/vault/errors';
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

    return Object.entries(data).flatMap(([path, value]) => {
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
    cas: number,
    signal?: AbortSignal,
  ): Promise<number> {
    if (!Number.isInteger(cas) || cas < 0) throw new VaultError('invalid-request');
    const response = asObject(
      await this.client.request(session.serverUrl, kvPath(mount, 'data', path), {
        method: 'POST',
        token: session.token,
        body: { data, options: { cas } },
        signal,
      }),
    );
    return asNumber(asObject(response.data).version);
  }

  async readSecretHistory(
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
      currentVersion: asNumber(data.current_version),
      oldestVersion: asNumber(data.oldest_version),
      customMetadata: optionalStringRecord(data.custom_metadata),
      versions: Object.entries(versions)
        .map(([version, metadata]) => parseVersionMetadata(Number(version), metadata))
        .sort((left, right) => right.version - left.version),
    };
  }

  async deleteLatestVersion(
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
