import type {
  UserpassLogin,
  VaultAuthGateway,
  VaultHealth,
  VaultSession,
} from '../../../domain/vault/contracts';
import { VaultError } from '../../../domain/vault/errors';
import { vaultToken, type VaultToken } from '../../../domain/vault/sensitive-value';
import { encodeVaultPath, VaultHttpClient } from '../http/vault-http-client';
import { asBoolean, asNumber, asObject, asString, optionalString } from '../http/validation';

function expiresAtFromDate(value: unknown): number | undefined {
  const date = optionalString(value);
  if (!date) return undefined;
  const timestamp = Date.parse(date);
  return Number.isNaN(timestamp) ? undefined : timestamp;
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
        expiresAt: expiresAtFromDate(data.expire_time),
      };
    } catch (error) {
      if (error instanceof VaultError && (error.status === 401 || error.status === 403)) {
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
      const metadata = auth.metadata === null ? {} : asObject(auth.metadata);

      return {
        serverUrl: input.serverUrl,
        token: vaultToken(asString(auth.client_token)),
        authMethod: 'userpass',
        displayName: optionalString(metadata.username) ?? input.username,
        expiresAt: leaseDuration > 0 ? Date.now() + leaseDuration * 1_000 : undefined,
      };
    } catch (error) {
      if (error instanceof VaultError && (error.status === 400 || error.status === 403)) {
        throw new VaultError('authentication', { cause: error, status: error.status });
      }
      throw error;
    }
  }
}
