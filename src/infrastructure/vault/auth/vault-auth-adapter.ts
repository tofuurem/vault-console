import type {
  UserpassLogin,
  VaultAuthGateway,
  VaultCapability,
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
  VaultSessionLease,
} from '../../../domain/vault/contracts';
import { VaultError } from '../../../domain/vault/errors';
import { leaseFromDuration, leaseFromLookup } from '../../../domain/vault/session-lease';
import { vaultToken, type VaultToken } from '../../../domain/vault/sensitive-value';
import { encodeVaultPath, VaultHttpClient } from '../http/vault-http-client';
import { asBoolean, asNumber, asObject, asString, asStringArray, optionalString } from '../http/validation';

const VAULT_CAPABILITIES = new Set<VaultCapability>([
  'create',
  'read',
  'update',
  'patch',
  'delete',
  'list',
  'sudo',
  'deny',
  'root',
]);

function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null ? undefined : asNumber(value);
}

function optionalBooleanValue(value: unknown): boolean | undefined {
  return value === undefined || value === null ? undefined : asBoolean(value);
}

export class VaultAuthAdapter implements VaultAuthGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  async getHealth(serverUrl: string, signal?: AbortSignal): Promise<VaultHealth> {
    const response = asObject(
      await this.client.request(serverUrl, 'sys/health', {
        signal,
        allowStatuses: [429, 472, 473, 501, 503],
      }),
    );

    return {
      initialized: asBoolean(response.initialized),
      sealed: asBoolean(response.sealed),
      standby: asBoolean(response.standby),
      version: optionalString(response.version),
    };
  }

  async validateToken(serverUrl: string, token: VaultToken, signal?: AbortSignal): Promise<VaultSession> {
    try {
      const response = asObject(
        await this.client.request(serverUrl, 'auth/token/lookup-self', { token, signal }),
      );
      const data = asObject(response.data);

      return {
        serverUrl,
        token,
        authMethod: 'token',
        displayName: optionalString(data.display_name),
        ...leaseFromLookup({
          expireTime: optionalString(data.expire_time),
          ttlSeconds: optionalNumber(data.ttl),
          renewable: optionalBooleanValue(data.renewable),
        }),
      };
    } catch (error) {
      if (error instanceof VaultError && error.status === 403) {
        return {
          serverUrl,
          token,
          authMethod: 'token',
        };
      }
      if (error instanceof VaultError && error.status === 401) {
        throw new VaultError('session-expired', { cause: error, status: error.status });
      }
      throw error;
    }
  }

  async loginUserpass(input: UserpassLogin, signal?: AbortSignal): Promise<VaultSession> {
    try {
      const mount = encodeVaultPath(input.mount);
      const username = encodeURIComponent(input.username);
      const response = asObject(
        await this.client.request(input.serverUrl, `auth/${mount}/login/${username}`, {
          method: 'POST',
          body: { password: input.password.reveal() },
          signal,
        }),
      );
      const auth = asObject(response.auth);
      const leaseDuration = asNumber(auth.lease_duration);
      const renewable = optionalBooleanValue(auth.renewable);
      const metadata = auth.metadata === null ? {} : asObject(auth.metadata);

      return {
        serverUrl: input.serverUrl,
        token: vaultToken(asString(auth.client_token)),
        authMethod: 'userpass',
        displayName: optionalString(metadata.username) ?? input.username,
        ...leaseFromDuration({
          durationSeconds: leaseDuration,
          renewable,
        }),
      };
    } catch (error) {
      if (error instanceof VaultError && (error.status === 400 || error.status === 403)) {
        throw new VaultError('authentication', { cause: error, status: error.status });
      }
      throw error;
    }
  }

  async renewSelf(
    session: VaultSession,
    signal?: AbortSignal,
  ): Promise<VaultSessionLease> {
    const response = asObject(
      await this.client.request(session.serverUrl, 'auth/token/renew-self', {
        method: 'POST',
        token: session.token,
        signal,
      }),
    );
    const auth = asObject(response.auth);
    return leaseFromDuration({
      durationSeconds: asNumber(auth.lease_duration),
      renewable: optionalBooleanValue(auth.renewable),
      renewed: true,
    });
  }

  async getCapabilities(
    session: VaultSession,
    paths: readonly string[],
    signal?: AbortSignal,
  ): Promise<VaultCapabilityMap> {
    if (paths.length === 0) return {};

    const response = asObject(
      await this.client.request(session.serverUrl, 'sys/capabilities-self', {
        method: 'POST',
        token: session.token,
        body: { paths },
        signal,
      }),
    );

    return Object.fromEntries(paths.map((path) => {
      const capabilities = asStringArray(response[path]);
      if (capabilities.some((capability) => !VAULT_CAPABILITIES.has(capability as VaultCapability))) {
        throw new VaultError('invalid-response');
      }
      return [path, capabilities as readonly VaultCapability[]];
    }));
  }
}
