import {
  engineKind,
  type EnableEngineInput,
  type EngineTune,
  type SecretEngine,
  type SecretEnginesGateway,
  type TuneEngineInput,
  type VaultApiGateway,
  type VaultApiResponse,
} from '@/domain/engines/engines';
import type { VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { kvMountPathError, normalizeKvMountPath } from '@/domain/vault/kv-mount';
import { encodeVaultPath, VaultHttpClient } from '../vault/http/vault-http-client';
import {
  asNumber,
  asObject,
  asString,
  asStringArray,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
} from '../vault/http/validation';

function mountPath(path: string): string {
  if (kvMountPathError(path)) throw new VaultError('invalid-request');
  return encodeVaultPath(normalizeKvMountPath(path));
}

function apiResponse(value: unknown): VaultApiResponse | null {
  if (value === null || value === undefined) return null;
  const response = asObject(value);
  const leaseId = optionalString(response.lease_id);
  return {
    data: response.data === null || response.data === undefined ? null : asObject(response.data),
    leaseId,
    leaseDurationSeconds: leaseId ? optionalNumber(response.lease_duration) : undefined,
    renewable: leaseId ? optionalBoolean(response.renewable) : undefined,
    warnings: optionalStringArray(response.warnings),
  };
}

/** Lists, enables, tunes, and disables secrets engines of every type. */
export class VaultEnginesAdapter implements SecretEnginesGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  async listEngines(session: VaultSession, signal?: AbortSignal): Promise<readonly SecretEngine[]> {
    const response = asObject(await this.client.request(session.serverUrl, 'sys/internal/ui/mounts', {
      token: session.token,
      signal,
    }));
    const data = asObject(response.data);
    const mounts = data.secret === undefined ? data : asObject(data.secret);
    return Object.entries(mounts)
      .flatMap(([path, value]) => {
        const mount = asObject(value);
        const type = asString(mount.type);
        // System-owned mounts are not useful to browse from the console.
        if (type === 'system' || type === 'identity' || type === 'cubbyhole') return [];
        const options = mount.options === null || mount.options === undefined ? {} : asObject(mount.options);
        return [{
          path: path.replace(/\/+$/, ''),
          type,
          kind: engineKind(type, options),
          description: optionalString(mount.description) ?? '',
          accessor: asString(mount.accessor),
          version: optionalString(mount.running_plugin_version),
        }];
      })
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async enableEngine(session: VaultSession, input: EnableEngineInput, signal?: AbortSignal): Promise<void> {
    const config: Record<string, string> = {};
    if (input.defaultLeaseTtl?.trim()) config.default_lease_ttl = input.defaultLeaseTtl.trim();
    if (input.maxLeaseTtl?.trim()) config.max_lease_ttl = input.maxLeaseTtl.trim();
    await this.client.request(session.serverUrl, `sys/mounts/${mountPath(input.path)}`, {
      method: 'POST',
      token: session.token,
      body: {
        type: input.type,
        description: input.description.trim(),
        ...(input.options ? { options: input.options } : {}),
        ...(Object.keys(config).length > 0 ? { config } : {}),
      },
      signal,
    });
  }

  async readTune(session: VaultSession, path: string, signal?: AbortSignal): Promise<EngineTune> {
    const response = asObject(await this.client.request(session.serverUrl, `sys/mounts/${mountPath(path)}/tune`, {
      token: session.token,
      signal,
    }));
    const data = response.data === undefined ? response : asObject(response.data);
    return {
      description: optionalString(data.description) ?? '',
      defaultLeaseTtlSeconds: asNumber(data.default_lease_ttl),
      maxLeaseTtlSeconds: asNumber(data.max_lease_ttl),
    };
  }

  async tuneEngine(session: VaultSession, path: string, input: TuneEngineInput, signal?: AbortSignal): Promise<void> {
    await this.client.request(session.serverUrl, `sys/mounts/${mountPath(path)}/tune`, {
      method: 'POST',
      token: session.token,
      body: {
        description: input.description.trim(),
        ...(input.defaultLeaseTtl === undefined ? {} : { default_lease_ttl: input.defaultLeaseTtl.trim() || 'system' }),
        ...(input.maxLeaseTtl === undefined ? {} : { max_lease_ttl: input.maxLeaseTtl.trim() || 'system' }),
      },
      signal,
    });
  }

  async disableEngine(session: VaultSession, path: string, signal?: AbortSignal): Promise<void> {
    await this.client.request(session.serverUrl, `sys/mounts/${mountPath(path)}`, {
      method: 'DELETE',
      token: session.token,
      signal,
    });
  }
}

/** Raw path access for engines without a dedicated workspace. */
export class VaultApiAdapter implements VaultApiGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  async list(session: VaultSession, path: string, signal?: AbortSignal): Promise<readonly string[]> {
    try {
      const response = asObject(await this.client.request(session.serverUrl, encodeVaultPath(path), {
        token: session.token,
        query: { list: true },
        signal,
      }));
      return asStringArray(asObject(response.data).keys);
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return [];
      throw error;
    }
  }

  async read(session: VaultSession, path: string, signal?: AbortSignal): Promise<VaultApiResponse | null> {
    return apiResponse(await this.client.request(session.serverUrl, encodeVaultPath(path), {
      token: session.token,
      signal,
    }));
  }

  async write(
    session: VaultSession,
    path: string,
    body: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<VaultApiResponse | null> {
    return apiResponse(await this.client.request(session.serverUrl, encodeVaultPath(path), {
      method: 'POST',
      token: session.token,
      body,
      signal,
    }));
  }

  async remove(session: VaultSession, path: string, signal?: AbortSignal): Promise<void> {
    await this.client.request(session.serverUrl, encodeVaultPath(path), {
      method: 'DELETE',
      token: session.token,
      signal,
    });
  }
}
