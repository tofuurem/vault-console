import {
  sshOtp,
  type SshCaConfig,
  type SshCaRole,
  type SshCaSetupInput,
  type SshEngineGateway,
  type SshOtp,
  type SshOtpCredential,
  type SshOtpRequest,
  type SshOtpRole,
  type SshOtpVerification,
  type SshRole,
  type SshRoleInput,
  type SshRoleSummary,
  type SshSignedKey,
  type SshSignInput,
} from '@/domain/engines/ssh/ssh';
import type { VaultSession } from '@/domain/vault/contracts';
import { VaultError, type VaultErrorCode } from '@/domain/vault/errors';
import { encodeVaultPath, VaultHttpClient } from '../../vault/http/vault-http-client';
import {
  asArray,
  asNumber,
  asObject,
  asString,
  asStringArray,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  optionalStringRecord,
  type JsonObject,
} from '../../vault/http/validation';

/** One literal path segment such as a role name; slashes and dot segments are rejected. */
function segment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('/') || trimmed === '.' || trimmed === '..') throw new VaultError('invalid-request');
  return encodeURIComponent(trimmed);
}

function mountPath(mount: string, relative: string): string {
  const encodedMount = encodeVaultPath(mount);
  if (!encodedMount) throw new VaultError('invalid-request');
  return `${encodedMount}/${relative}`;
}

function isVaultError(error: unknown, ...codes: readonly VaultErrorCode[]): boolean {
  return error instanceof VaultError && codes.includes(error.code);
}

function data(response: unknown): JsonObject {
  return asObject(asObject(response).data);
}

function text(value: unknown): string {
  return optionalString(value) ?? '';
}

function keyLengths(value: unknown): Readonly<Record<string, readonly number[]>> {
  if (value === undefined || value === null) return {};
  return Object.fromEntries(Object.entries(asObject(value)).map(([name, lengths]) => [
    name,
    typeof lengths === 'number' ? [asNumber(lengths)] : asArray(lengths).map(asNumber),
  ]));
}

function caRole(role: JsonObject): SshCaRole {
  return {
    keyType: 'ca',
    allowUserCertificates: optionalBoolean(role.allow_user_certificates),
    allowHostCertificates: optionalBoolean(role.allow_host_certificates),
    allowedUsers: text(role.allowed_users),
    defaultUser: text(role.default_user),
    allowedDomains: text(role.allowed_domains),
    allowSubdomains: optionalBoolean(role.allow_subdomains),
    allowBareDomains: optionalBoolean(role.allow_bare_domains),
    allowedExtensions: text(role.allowed_extensions),
    defaultExtensions: optionalStringRecord(role.default_extensions),
    allowedCriticalOptions: text(role.allowed_critical_options),
    defaultCriticalOptions: optionalStringRecord(role.default_critical_options),
    allowUserKeyIds: optionalBoolean(role.allow_user_key_ids),
    keyIdFormat: text(role.key_id_format),
    algorithmSigner: optionalString(role.algorithm_signer) ?? 'default',
    allowedUserKeyLengths: keyLengths(role.allowed_user_key_lengths),
    ttlSeconds: optionalNumber(role.ttl) ?? 0,
    maxTtlSeconds: optionalNumber(role.max_ttl) ?? 0,
    notBeforeDurationSeconds: optionalNumber(role.not_before_duration) ?? 0,
    allowedUsersTemplate: optionalBoolean(role.allowed_users_template),
    allowedDomainsTemplate: optionalBoolean(role.allowed_domains_template),
    defaultUserTemplate: optionalBoolean(role.default_user_template),
    defaultExtensionsTemplate: optionalBoolean(role.default_extensions_template),
    allowEmptyPrincipals: optionalBoolean(role.allow_empty_principals),
  };
}

function otpRole(role: JsonObject): SshOtpRole {
  return {
    keyType: 'otp',
    defaultUser: text(role.default_user),
    allowedUsers: text(role.allowed_users),
    cidrList: text(role.cidr_list),
    excludeCidrList: text(role.exclude_cidr_list),
    port: optionalNumber(role.port) ?? 22,
  };
}

function roleBody(input: SshRoleInput): JsonObject {
  if (input.keyType === 'otp') {
    return {
      key_type: 'otp',
      default_user: input.defaultUser.trim(),
      allowed_users: input.allowedUsers.trim(),
      cidr_list: input.cidrList.trim(),
      exclude_cidr_list: input.excludeCidrList.trim(),
      port: input.port,
    };
  }
  return {
    key_type: 'ca',
    allow_user_certificates: input.allowUserCertificates,
    allow_host_certificates: input.allowHostCertificates,
    allowed_users: input.allowedUsers.trim(),
    default_user: input.defaultUser.trim(),
    allowed_domains: input.allowedDomains.trim(),
    allow_subdomains: input.allowSubdomains,
    allow_bare_domains: input.allowBareDomains,
    allowed_extensions: input.allowedExtensions.trim(),
    default_extensions: input.defaultExtensions,
    allowed_critical_options: input.allowedCriticalOptions.trim(),
    default_critical_options: input.defaultCriticalOptions,
    allow_user_key_ids: input.allowUserKeyIds,
    key_id_format: input.keyIdFormat.trim(),
    algorithm_signer: input.algorithmSigner,
    allowed_user_key_lengths: input.allowedUserKeyLengths,
    // Vault resets a duration to the mount default when it receives "0".
    ttl: input.ttl.trim() || '0',
    max_ttl: input.maxTtl.trim() || '0',
    not_before_duration: input.notBeforeDuration.trim() || '30s',
    allowed_users_template: input.allowedUsersTemplate,
    allowed_domains_template: input.allowedDomainsTemplate,
    default_user_template: input.defaultUserTemplate,
    default_extensions_template: input.defaultExtensionsTemplate,
    allow_empty_principals: input.allowEmptyPrincipals,
  };
}

function signBody(input: SshSignInput): JsonObject {
  const body: JsonObject = { public_key: input.publicKey.trim(), cert_type: input.certType };
  if (input.validPrincipals.trim()) body.valid_principals = input.validPrincipals.trim();
  if (input.ttl.trim()) body.ttl = input.ttl.trim();
  if (input.keyId.trim()) body.key_id = input.keyId.trim();
  if (input.extensions) body.extensions = input.extensions;
  if (input.criticalOptions && Object.keys(input.criticalOptions).length > 0) body.critical_options = input.criticalOptions;
  return body;
}

function caBody(input: SshCaSetupInput): JsonObject {
  if (input.mode === 'import') {
    return { generate_signing_key: false, private_key: input.privateKey.reveal(), public_key: input.publicKey.trim() };
  }
  return { generate_signing_key: true, key_type: input.keyType, ...(input.keyBits ? { key_bits: input.keyBits } : {}) };
}

/** The SSH secrets engine: signing CA, roles, certificate signing, and one-time passwords. */
export class VaultSshAdapter implements SshEngineGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  private call(session: VaultSession, path: string, options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; list?: boolean; signal?: AbortSignal } = {}) {
    return this.client.request(session.serverUrl, path, {
      method: options.method,
      token: session.token,
      body: options.body,
      query: options.list ? { list: true } : undefined,
      signal: options.signal,
      // Vault's own text ("IP does not belong to role") explains rejected requests.
      includeReason: true,
    });
  }

  async readCa(session: VaultSession, mount: string, signal?: AbortSignal): Promise<SshCaConfig | null> {
    try {
      const response = await this.call(session, mountPath(mount, 'config/ca'), { signal });
      return { publicKey: asString(data(response).public_key).trim() };
    } catch (error) {
      // Vault answers 400 "keys haven't been configured yet" for an empty CA.
      if (isVaultError(error, 'invalid-request', 'not-found')) return null;
      throw error;
    }
  }

  async configureCa(session: VaultSession, mount: string, input: SshCaSetupInput, signal?: AbortSignal): Promise<SshCaConfig | null> {
    const response = await this.call(session, mountPath(mount, 'config/ca'), { method: 'POST', body: caBody(input), signal });
    if (response === null) return null;
    const publicKey = optionalString(data(response).public_key);
    return publicKey ? { publicKey: publicKey.trim() } : null;
  }

  async deleteCa(session: VaultSession, mount: string, signal?: AbortSignal): Promise<void> {
    await this.call(session, mountPath(mount, 'config/ca'), { method: 'DELETE', signal });
  }

  async listRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly SshRoleSummary[]> {
    try {
      const response = data(await this.call(session, mountPath(mount, 'roles'), { list: true, signal }));
      const info = response.key_info === undefined || response.key_info === null ? {} : asObject(response.key_info);
      return asStringArray(response.keys).map((name) => {
        const entry = info[name] === undefined || info[name] === null ? {} : asObject(info[name]);
        return { name, keyType: optionalString(entry.key_type) ?? 'unknown' };
      });
    } catch (error) {
      if (isVaultError(error, 'not-found')) return [];
      throw error;
    }
  }

  async readRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<SshRole> {
    const role = data(await this.call(session, mountPath(mount, `roles/${segment(name)}`), { signal }));
    const keyType = asString(role.key_type);
    if (keyType === 'ca') return caRole(role);
    if (keyType === 'otp') return otpRole(role);
    throw new VaultError('invalid-response');
  }

  async writeRole(session: VaultSession, mount: string, name: string, input: SshRoleInput, signal?: AbortSignal): Promise<void> {
    await this.call(session, mountPath(mount, `roles/${segment(name)}`), { method: 'POST', body: roleBody(input), signal });
  }

  async deleteRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void> {
    await this.call(session, mountPath(mount, `roles/${segment(name)}`), { method: 'DELETE', signal });
  }

  async signKey(session: VaultSession, mount: string, input: SshSignInput, signal?: AbortSignal): Promise<SshSignedKey> {
    const response = data(await this.call(session, mountPath(mount, `sign/${segment(input.role)}`), {
      method: 'POST',
      body: signBody(input),
      signal,
    }));
    return { serialNumber: asString(response.serial_number), signedKey: asString(response.signed_key).trim() };
  }

  async createOtp(session: VaultSession, mount: string, role: string, input: SshOtpRequest, signal?: AbortSignal): Promise<SshOtpCredential> {
    const response = asObject(await this.call(session, mountPath(mount, `creds/${segment(role)}`), {
      method: 'POST',
      body: { ip: input.ip.trim(), ...(input.username?.trim() ? { username: input.username.trim() } : {}) },
      signal,
    }));
    const credential = asObject(response.data);
    const leaseId = optionalString(response.lease_id);
    return {
      otp: sshOtp(asString(credential.key)),
      ip: asString(credential.ip),
      username: text(credential.username),
      port: optionalNumber(credential.port),
      leaseId,
      leaseDurationSeconds: leaseId ? optionalNumber(response.lease_duration) : undefined,
    };
  }

  async verifyOtp(session: VaultSession, mount: string, otp: SshOtp, signal?: AbortSignal): Promise<SshOtpVerification | null> {
    try {
      const response = data(await this.call(session, mountPath(mount, 'verify'), { method: 'POST', body: { otp: otp.reveal() }, signal }));
      return { ip: asString(response.ip), username: text(response.username), roleName: text(response.role_name) };
    } catch (error) {
      // Vault answers 400 "OTP not found" for unknown or already used passwords.
      if (isVaultError(error, 'invalid-request')) return null;
      throw error;
    }
  }

  async readZeroAddressRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]> {
    try {
      return optionalStringArray(data(await this.call(session, mountPath(mount, 'config/zeroaddress'), { signal })).roles);
    } catch (error) {
      if (isVaultError(error, 'not-found')) return [];
      throw error;
    }
  }

  async writeZeroAddressRoles(session: VaultSession, mount: string, roles: readonly string[], signal?: AbortSignal): Promise<void> {
    const path = mountPath(mount, 'config/zeroaddress');
    if (roles.length === 0) {
      await this.call(session, path, { method: 'DELETE', signal });
      return;
    }
    await this.call(session, path, { method: 'POST', body: { roles: roles.join(',') }, signal });
  }
}
