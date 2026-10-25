import type { VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { isSecretJsonObject } from '@/domain/vault/secret-json';
import { vaultWrappingToken, type VaultWrappingToken } from '@/domain/vault/sensitive-value';
import {
  unwrappedSecretFields,
  isWrapTtl,
  type UnwrappedSecret,
  type VaultWrappingGateway,
  type WrapTtl,
  type WrappedSecretShare,
  type WrappingTokenInfo,
} from '@/domain/vault/wrapping';
import { encodeVaultPath, VaultHttpClient } from '../http/vault-http-client';
import { asNumber, asObject, asString, optionalString } from '../http/validation';

function kvDataPath(mount: string, path: string): string {
  return [encodeVaultPath(mount), 'data', encodeVaultPath(path)].join('/');
}

function optionalVersion(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function kvV2Payload(data: Readonly<Record<string, unknown>>): UnwrappedSecret | undefined {
  if (!isSecretJsonObject(data.data) || !isSecretJsonObject(data.metadata)) return undefined;
  const metadata = data.metadata;
  return {
    fields: unwrappedSecretFields(data.data),
    version: optionalVersion(metadata.version),
    createdTime: optionalString(metadata.created_time),
  };
}

/**
 * Response wrapping keeps a secret inside Vault's cubbyhole until a single
 * unwrap. Lookup and unwrap authenticate with the wrapping token itself and
 * never attach the operator's session token.
 */
export class VaultWrappingAdapter implements VaultWrappingGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  async wrapKvSecretVersion(
    session: VaultSession,
    mount: string,
    path: string,
    version: number,
    ttl: WrapTtl,
    signal?: AbortSignal,
  ): Promise<WrappedSecretShare> {
    if (!isWrapTtl(ttl) || !Number.isInteger(version) || version < 1) {
      throw new VaultError('invalid-request');
    }
    const response = asObject(
      await this.client.request(session.serverUrl, kvDataPath(mount, path), {
        token: session.token,
        query: { version },
        wrapTtl: ttl,
        signal,
      }),
    );
    // Without wrap_info the body would be the secret itself; never read it.
    const wrapInfo = asObject(response.wrap_info);
    return {
      token: vaultWrappingToken(asString(wrapInfo.token)),
      ttlSeconds: asNumber(wrapInfo.ttl),
      creationTime: asString(wrapInfo.creation_time),
      creationPath: asString(wrapInfo.creation_path),
    };
  }

  async lookupWrappingToken(
    serverUrl: string,
    token: VaultWrappingToken,
    signal?: AbortSignal,
  ): Promise<WrappingTokenInfo> {
    const response = asObject(
      await this.client.request(serverUrl, 'sys/wrapping/lookup', {
        method: 'POST',
        body: { token: token.reveal() },
        signal,
      }),
    );
    const data = asObject(response.data);
    return {
      creationPath: asString(data.creation_path),
      creationTime: asString(data.creation_time),
      ttlSeconds: asNumber(data.creation_ttl),
    };
  }

  async unwrapSecret(
    serverUrl: string,
    token: VaultWrappingToken,
    signal?: AbortSignal,
  ): Promise<UnwrappedSecret> {
    const response = asObject(
      await this.client.request(serverUrl, 'sys/wrapping/unwrap', {
        method: 'POST',
        token,
        signal,
      }),
    );
    if (response.data === null || response.data === undefined) return { fields: [] };
    const data = asObject(response.data);
    return kvV2Payload(data) ?? { fields: unwrappedSecretFields(data) };
  }
}
