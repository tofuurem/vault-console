import type { VaultSealGateway, VaultSession } from '@/domain/vault/contracts';
import type { VaultSealStatus, VaultSealType } from '@/domain/vault/seal';
import type { VaultUnsealKey } from '@/domain/vault/sensitive-value';
import { VaultHttpClient } from '../http/vault-http-client';
import {
  asBoolean,
  asNumber,
  asObject,
  asString,
  optionalBoolean,
  optionalString,
} from '../http/validation';

function sealType(value: unknown): VaultSealType {
  return asString(value) === 'shamir' ? 'shamir' : 'auto';
}

function sealStatusFromResponse(value: unknown): VaultSealStatus {
  const response = asObject(value);
  return {
    type: sealType(response.type),
    initialized: asBoolean(response.initialized),
    sealed: asBoolean(response.sealed),
    threshold: asNumber(response.t),
    shares: asNumber(response.n),
    progress: asNumber(response.progress),
    nonce: optionalString(response.nonce),
    version: optionalString(response.version),
    clusterName: optionalString(response.cluster_name),
    migration: optionalBoolean(response.migration),
    recoverySeal: optionalBoolean(response.recovery_seal),
    storageType: optionalString(response.storage_type),
  };
}

/**
 * Status and unseal endpoints are unauthenticated, so they never attach a
 * token; sealing requires the operator's token with `sudo` on `sys/seal`.
 */
export class VaultSealAdapter implements VaultSealGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  async getSealStatus(serverUrl: string, signal?: AbortSignal): Promise<VaultSealStatus> {
    return sealStatusFromResponse(
      await this.client.request(serverUrl, 'sys/seal-status', { signal }),
    );
  }

  async submitUnsealKey(
    serverUrl: string,
    key: VaultUnsealKey,
    signal?: AbortSignal,
  ): Promise<VaultSealStatus> {
    return sealStatusFromResponse(
      await this.client.request(serverUrl, 'sys/unseal', {
        method: 'PUT',
        body: { key: key.reveal() },
        signal,
      }),
    );
  }

  async resetUnseal(serverUrl: string, signal?: AbortSignal): Promise<VaultSealStatus> {
    return sealStatusFromResponse(
      await this.client.request(serverUrl, 'sys/unseal', {
        method: 'PUT',
        body: { reset: true },
        signal,
      }),
    );
  }

  async seal(session: VaultSession, signal?: AbortSignal): Promise<void> {
    await this.client.request(session.serverUrl, 'sys/seal', {
      method: 'PUT',
      token: session.token,
      signal,
    });
  }
}
