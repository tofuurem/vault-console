import {
  type CiphertextResult,
  type CreateTransitKeyInput,
  type DataKeyInput,
  type DataKeyResult,
  type DecryptInput,
  type EncryptInput,
  type HashInput,
  type HmacInput,
  type RandomBytesInput,
  type RewrapInput,
  type SignInput,
  type SignResult,
  type TransitEngineGateway,
  type TransitKey,
  type TransitKeyConfigInput,
  type TransitKeyVersion,
  type VerifyHmacInput,
  type VerifyInput,
} from '@/domain/engines/transit/transit';
import type { VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { kvMountPathError, normalizeKvMountPath } from '@/domain/vault/kv-mount';
import { encodeVaultPath, VaultHttpClient } from '../../vault/http/vault-http-client';
import {
  asBoolean,
  asNumber,
  asObject,
  asString,
  asStringArray,
  optionalBoolean,
  optionalNumber,
  optionalString,
  type JsonObject,
} from '../../vault/http/validation';

function mountPath(mount: string): string {
  if (kvMountPathError(mount)) throw new VaultError('invalid-request');
  return encodeVaultPath(normalizeKvMountPath(mount));
}

/** Key names are a single path segment; anything else would address a different endpoint. */
function nameSegment(name: string): string {
  if (!name || name.includes('/') || name === '.' || name === '..') throw new VaultError('invalid-request');
  return encodeURIComponent(name);
}

function invalidResponse(): never {
  throw new VaultError('invalid-response');
}

function versionNumber(value: string): number {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) return invalidResponse();
  return version;
}

/** Symmetric keys map versions to Unix seconds; asymmetric keys map them to objects with public keys. */
function parseVersions(value: unknown): readonly TransitKeyVersion[] {
  if (value === undefined || value === null) return [];
  return Object.entries(asObject(value))
    .map(([version, entry]): TransitKeyVersion => {
      if (typeof entry === 'number') {
        return { version: versionNumber(version), createdAt: new Date(asNumber(entry) * 1000).toISOString() };
      }
      const details = asObject(entry);
      return {
        version: versionNumber(version),
        createdAt: optionalString(details.creation_time),
        publicKey: optionalString(details.public_key),
      };
    })
    .sort((left, right) => right.version - left.version);
}

function parseKey(data: JsonObject, fallbackName: string): TransitKey {
  return {
    name: optionalString(data.name) ?? fallbackName,
    type: asString(data.type),
    latestVersion: asNumber(data.latest_version),
    minDecryptionVersion: asNumber(data.min_decryption_version),
    minEncryptionVersion: optionalNumber(data.min_encryption_version) ?? 0,
    minAvailableVersion: optionalNumber(data.min_available_version) ?? 0,
    deletionAllowed: asBoolean(data.deletion_allowed),
    exportable: optionalBoolean(data.exportable),
    allowPlaintextBackup: optionalBoolean(data.allow_plaintext_backup),
    derived: optionalBoolean(data.derived),
    convergentEncryption: optionalBoolean(data.convergent_encryption),
    importedKey: optionalBoolean(data.imported_key),
    supportsEncryption: optionalBoolean(data.supports_encryption),
    supportsDecryption: optionalBoolean(data.supports_decryption),
    supportsDerivation: optionalBoolean(data.supports_derivation),
    supportsSigning: optionalBoolean(data.supports_signing),
    autoRotatePeriodSeconds: optionalNumber(data.auto_rotate_period) ?? 0,
    keySize: optionalNumber(data.key_size),
    versions: parseVersions(data.keys),
  };
}

/** Payload fields where an empty string is a real value (an empty message). */
const PAYLOAD_FIELDS = new Set(['plaintext', 'input']);

/** Drops empty optional values so Vault applies its own defaults. */
function compact(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key, value]) => (
    value !== undefined && (value !== '' || PAYLOAD_FIELDS.has(key))
  )));
}

function signatureBody(input: SignInput | VerifyInput): Record<string, unknown> {
  return {
    input: input.input,
    hash_algorithm: input.hashAlgorithm,
    prehashed: input.prehashed || undefined,
    signature_algorithm: input.signatureAlgorithm,
    marshaling_algorithm: input.marshalingAlgorithm,
    context: input.context,
  };
}

/** Transit keys and cryptographic operations through the Vault HTTP API. */
export class VaultTransitAdapter implements TransitEngineGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  /** POST that keeps Vault's explanation on failure and returns `data` (or null for 204). */
  private async post(
    session: VaultSession,
    path: string,
    body: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<JsonObject | null> {
    const response = await this.client.request(session.serverUrl, path, {
      method: 'POST',
      token: session.token,
      body: compact(body),
      signal,
      includeReason: true,
    });
    if (response === null || response === undefined) return null;
    const object = asObject(response);
    return object.data === null || object.data === undefined ? null : asObject(object.data);
  }

  private async postData(session: VaultSession, path: string, body: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<JsonObject> {
    return (await this.post(session, path, body, signal)) ?? invalidResponse();
  }

  async listKeys(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]> {
    try {
      const response = asObject(await this.client.request(session.serverUrl, `${mountPath(mount)}/keys`, {
        token: session.token,
        query: { list: true },
        signal,
      }));
      return [...asStringArray(asObject(response.data).keys)].sort((left, right) => left.localeCompare(right));
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return [];
      throw error;
    }
  }

  async readKey(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<TransitKey> {
    const response = asObject(await this.client.request(session.serverUrl, `${mountPath(mount)}/keys/${nameSegment(name)}`, {
      token: session.token,
      signal,
    }));
    return parseKey(asObject(response.data), name);
  }

  async createKey(session: VaultSession, mount: string, input: CreateTransitKeyInput, signal?: AbortSignal): Promise<void> {
    const rotate = input.autoRotatePeriod.trim();
    await this.post(session, `${mountPath(mount)}/keys/${nameSegment(input.name.trim())}`, {
      type: input.type,
      derived: input.derived || undefined,
      convergent_encryption: input.convergentEncryption || undefined,
      exportable: input.exportable || undefined,
      allow_plaintext_backup: input.allowPlaintextBackup || undefined,
      auto_rotate_period: rotate && rotate !== '0' ? rotate : undefined,
      key_size: input.type === 'hmac' ? input.keySize : undefined,
    }, signal);
  }

  async rotateKey(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void> {
    await this.post(session, `${mountPath(mount)}/keys/${nameSegment(name)}/rotate`, {}, signal);
  }

  async updateKeyConfig(
    session: VaultSession,
    mount: string,
    name: string,
    input: TransitKeyConfigInput,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.post(session, `${mountPath(mount)}/keys/${nameSegment(name)}/config`, {
      min_decryption_version: input.minDecryptionVersion,
      min_encryption_version: input.minEncryptionVersion,
      deletion_allowed: input.deletionAllowed,
      exportable: input.exportable,
      allow_plaintext_backup: input.allowPlaintextBackup,
      auto_rotate_period: input.autoRotatePeriod.trim() || '0',
    }, signal);
  }

  async trimKey(session: VaultSession, mount: string, name: string, minAvailableVersion: number, signal?: AbortSignal): Promise<void> {
    await this.post(session, `${mountPath(mount)}/keys/${nameSegment(name)}/trim`, {
      min_available_version: minAvailableVersion,
    }, signal);
  }

  async deleteKey(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void> {
    await this.client.request(session.serverUrl, `${mountPath(mount)}/keys/${nameSegment(name)}`, {
      method: 'DELETE',
      token: session.token,
      signal,
      includeReason: true,
    });
  }

  async encrypt(session: VaultSession, mount: string, name: string, input: EncryptInput, signal?: AbortSignal): Promise<CiphertextResult> {
    const data = await this.postData(session, `${mountPath(mount)}/encrypt/${nameSegment(name)}`, {
      plaintext: input.plaintext,
      context: input.context,
      key_version: input.keyVersion,
    }, signal);
    return { ciphertext: asString(data.ciphertext), keyVersion: optionalNumber(data.key_version) };
  }

  async decrypt(session: VaultSession, mount: string, name: string, input: DecryptInput, signal?: AbortSignal): Promise<string> {
    const data = await this.postData(session, `${mountPath(mount)}/decrypt/${nameSegment(name)}`, {
      ciphertext: input.ciphertext,
      context: input.context,
    }, signal);
    // Vault omits the field when the original plaintext was empty.
    return data.plaintext === undefined || data.plaintext === null ? '' : asString(data.plaintext);
  }

  async rewrap(session: VaultSession, mount: string, name: string, input: RewrapInput, signal?: AbortSignal): Promise<CiphertextResult> {
    const data = await this.postData(session, `${mountPath(mount)}/rewrap/${nameSegment(name)}`, {
      ciphertext: input.ciphertext,
      context: input.context,
      key_version: input.keyVersion,
    }, signal);
    return { ciphertext: asString(data.ciphertext), keyVersion: optionalNumber(data.key_version) };
  }

  async generateDataKey(session: VaultSession, mount: string, name: string, input: DataKeyInput, signal?: AbortSignal): Promise<DataKeyResult> {
    const data = await this.postData(session, `${mountPath(mount)}/datakey/${input.kind}/${nameSegment(name)}`, {
      bits: input.bits,
      context: input.context,
    }, signal);
    const plaintext = input.kind === 'plaintext' ? asString(data.plaintext) : undefined;
    return { ciphertext: asString(data.ciphertext), plaintext, keyVersion: optionalNumber(data.key_version) };
  }

  async sign(session: VaultSession, mount: string, name: string, input: SignInput, signal?: AbortSignal): Promise<SignResult> {
    const data = await this.postData(session, `${mountPath(mount)}/sign/${nameSegment(name)}`, {
      ...signatureBody(input),
      key_version: input.keyVersion,
    }, signal);
    return { signature: asString(data.signature), keyVersion: optionalNumber(data.key_version) };
  }

  async verify(session: VaultSession, mount: string, name: string, input: VerifyInput, signal?: AbortSignal): Promise<boolean> {
    const data = await this.postData(session, `${mountPath(mount)}/verify/${nameSegment(name)}`, {
      ...signatureBody(input),
      signature: input.signature,
    }, signal);
    return asBoolean(data.valid);
  }

  async hmac(session: VaultSession, mount: string, name: string, input: HmacInput, signal?: AbortSignal): Promise<string> {
    const data = await this.postData(session, `${mountPath(mount)}/hmac/${nameSegment(name)}`, {
      input: input.input,
      algorithm: input.algorithm,
      key_version: input.keyVersion,
    }, signal);
    return asString(data.hmac);
  }

  async verifyHmac(session: VaultSession, mount: string, name: string, input: VerifyHmacInput, signal?: AbortSignal): Promise<boolean> {
    const data = await this.postData(session, `${mountPath(mount)}/verify/${nameSegment(name)}`, {
      input: input.input,
      hmac: input.hmac,
      algorithm: input.algorithm,
    }, signal);
    return asBoolean(data.valid);
  }

  async randomBytes(session: VaultSession, mount: string, input: RandomBytesInput, signal?: AbortSignal): Promise<string> {
    if (!Number.isInteger(input.bytes) || input.bytes < 1) throw new VaultError('invalid-request');
    const data = await this.postData(session, `${mountPath(mount)}/random/${nameSegment(input.source)}/${input.bytes}`, {
      format: input.format,
    }, signal);
    return asString(data.random_bytes);
  }

  async hash(session: VaultSession, mount: string, input: HashInput, signal?: AbortSignal): Promise<string> {
    const data = await this.postData(session, `${mountPath(mount)}/hash/${nameSegment(input.algorithm)}`, {
      input: input.input,
      format: input.format,
    }, signal);
    return asString(data.sum);
  }
}
