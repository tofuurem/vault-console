import {
  PkiPrivateKey,
  type PkiCaSubjectInput,
  type PkiCrlConfig,
  type PkiEngineGateway,
  type PkiGeneratedCsr,
  type PkiGeneratedRoot,
  type PkiGenerateIntermediateInput,
  type PkiGenerateRootInput,
  type PkiImportResult,
  type PkiIssuedCertificate,
  type PkiIssueInput,
  type PkiIssuer,
  type PkiIssuerSummary,
  type PkiIssuerUpdate,
  type PkiKeySummary,
  type PkiRevocation,
  type PkiRole,
  type PkiRoleInput,
  type PkiRoleKeyType,
  type PkiSignedCertificate,
  type PkiSignInput,
  type PkiSignIntermediateInput,
  type PkiStoredCertificate,
  type PkiTidyInput,
  type PkiTidyStatus,
  type PkiUrlsConfig,
} from '@/domain/engines/pki/pki';
import { splitList } from '@/domain/engines/pki/pki-helpers';
import { certificatePems } from '@/domain/engines/pki/x509';
import type { VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { encodeVaultPath, VaultHttpClient, type VaultRequestOptions } from '../../vault/http/vault-http-client';
import {
  asNumber,
  asObject,
  asString,
  asStringArray,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  type JsonObject,
} from '../../vault/http/validation';

type RequestOptions = Pick<VaultRequestOptions, 'method' | 'body' | 'query' | 'signal'>;

const ROLE_KEY_TYPES: readonly PkiRoleKeyType[] = ['rsa', 'ec', 'ed25519', 'any'];

/** Issuer fields Vault resets when they are missing from an update. */
const ISSUER_WRITABLE_FIELDS = [
  'issuer_name',
  'leaf_not_after_behavior',
  'usage',
  'manual_chain',
  'revocation_signature_algorithm',
  'issuing_certificates',
  'crl_distribution_points',
  'delta_crl_distribution_points',
  'ocsp_servers',
  'enable_aia_url_templating',
] as const;

function invalidResponse(): never {
  throw new VaultError('invalid-response');
}

/** One path segment such as an issuer reference, role name, or serial number. */
function segment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('/') || trimmed === '.' || trimmed === '..') throw new VaultError('invalid-request');
  return encodeURIComponent(trimmed);
}

function data(response: JsonObject | null): JsonObject {
  if (!response) return invalidResponse();
  return asObject(response.data);
}

function warnings(response: JsonObject | null): readonly string[] {
  return optionalStringArray(response?.warnings);
}

/** Vault reports some epoch values as JSON numbers and others as numeric strings. */
function epochSeconds(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return asNumber(value);
}

function privateKey(values: JsonObject): PkiPrivateKey | undefined {
  const key = optionalString(values.private_key);
  return key ? new PkiPrivateKey(key, optionalString(values.private_key_type) ?? '') : undefined;
}

/** The first certificate of a field that may be a bundle (which can include a key). */
function certificateOnly(value: unknown): string {
  const [first] = certificatePems(asString(value));
  return first ?? invalidResponse();
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function compact(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

function subjectBody(input: PkiCaSubjectInput): Record<string, unknown> {
  return {
    common_name: input.commonName.trim(),
    key_type: input.keyType,
    key_bits: input.keyType === 'ed25519' ? 0 : input.keyBits,
    key_name: optionalText(input.keyName),
    organization: optionalText(input.organization),
    ou: optionalText(input.ou),
    country: optionalText(input.country),
    locality: optionalText(input.locality),
    province: optionalText(input.province),
    alt_names: splitList(input.altNames).join(',') || undefined,
    ip_sans: splitList(input.ipSans).join(',') || undefined,
  };
}

function signedCertificate(response: JsonObject | null): PkiSignedCertificate {
  const values = data(response);
  return {
    certificate: certificateOnly(values.certificate),
    issuingCa: optionalString(values.issuing_ca) ?? '',
    caChain: optionalStringArray(values.ca_chain),
    serialNumber: asString(values.serial_number),
    expiration: epochSeconds(values.expiration),
    warnings: warnings(response),
  };
}

function importResult(response: JsonObject | null): PkiImportResult {
  const values = response?.data === null || response?.data === undefined ? {} : asObject(response.data);
  return {
    importedIssuers: optionalStringArray(values.imported_issuers),
    importedKeys: optionalStringArray(values.imported_keys),
    existingIssuers: optionalStringArray(values.existing_issuers),
    warnings: warnings(response),
  };
}

function issuerSummary(id: string, value: unknown): PkiIssuerSummary {
  const info = asObject(value);
  return {
    id,
    name: optionalString(info.issuer_name) ?? '',
    isDefault: optionalBoolean(info.is_default),
    keyId: optionalString(info.key_id) ?? '',
    serialNumber: asString(info.serial_number),
  };
}

function issuer(values: JsonObject): PkiIssuer {
  return {
    id: asString(values.issuer_id),
    name: optionalString(values.issuer_name) ?? '',
    keyId: optionalString(values.key_id) ?? '',
    certificate: asString(values.certificate),
    caChain: optionalStringArray(values.ca_chain),
    usage: (optionalString(values.usage) ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    leafNotAfterBehavior: optionalString(values.leaf_not_after_behavior) ?? 'err',
    revoked: optionalBoolean(values.revoked),
    issuingCertificates: optionalStringArray(values.issuing_certificates),
    crlDistributionPoints: optionalStringArray(values.crl_distribution_points),
    ocspServers: optionalStringArray(values.ocsp_servers),
  };
}

function roleKeyType(value: unknown): PkiRoleKeyType {
  const type = asString(value);
  return ROLE_KEY_TYPES.find((candidate) => candidate === type) ?? invalidResponse();
}

function role(name: string, values: JsonObject): PkiRole {
  return {
    name,
    issuerRef: optionalString(values.issuer_ref) ?? 'default',
    allowedDomains: optionalStringArray(values.allowed_domains),
    allowSubdomains: optionalBoolean(values.allow_subdomains),
    allowBareDomains: optionalBoolean(values.allow_bare_domains),
    allowGlobDomains: optionalBoolean(values.allow_glob_domains),
    allowAnyName: optionalBoolean(values.allow_any_name),
    allowLocalhost: optionalBoolean(values.allow_localhost),
    allowIpSans: optionalBoolean(values.allow_ip_sans),
    serverFlag: optionalBoolean(values.server_flag),
    clientFlag: optionalBoolean(values.client_flag),
    keyType: roleKeyType(values.key_type),
    keyBits: optionalNumber(values.key_bits) ?? 0,
    ttlSeconds: optionalNumber(values.ttl) ?? 0,
    maxTtlSeconds: optionalNumber(values.max_ttl) ?? 0,
    noStore: optionalBoolean(values.no_store),
    requireCn: optionalBoolean(values.require_cn, true),
    extKeyUsage: optionalStringArray(values.ext_key_usage),
    organization: optionalStringArray(values.organization),
    ou: optionalStringArray(values.ou),
  };
}

function roleBody(input: PkiRoleInput): Record<string, unknown> {
  const fixedSize = input.keyType === 'ed25519' || input.keyType === 'any';
  return {
    issuer_ref: input.issuerRef.trim() || 'default',
    allowed_domains: input.allowedDomains,
    allow_subdomains: input.allowSubdomains,
    allow_bare_domains: input.allowBareDomains,
    allow_glob_domains: input.allowGlobDomains,
    allow_any_name: input.allowAnyName,
    allow_localhost: input.allowLocalhost,
    allow_ip_sans: input.allowIpSans,
    server_flag: input.serverFlag,
    client_flag: input.clientFlag,
    key_type: input.keyType,
    key_bits: fixedSize ? 0 : input.keyBits,
    ttl: input.ttl.trim() || '0',
    max_ttl: input.maxTtl.trim() || '0',
    no_store: input.noStore,
    require_cn: input.requireCn,
    ext_key_usage: input.extKeyUsage,
    organization: input.organization,
    ou: input.ou,
  };
}

function tidyStatus(values: JsonObject): PkiTidyStatus {
  return {
    state: optionalString(values.state) ?? 'Inactive',
    error: optionalString(values.error),
    message: optionalString(values.message),
    timeStarted: optionalString(values.time_started),
    timeFinished: optionalString(values.time_finished),
    lastAutoTidyFinished: optionalString(values.last_auto_tidy_finished),
    certStoreDeletedCount: optionalNumber(values.cert_store_deleted_count),
    revokedCertDeletedCount: optionalNumber(values.revoked_cert_deleted_count),
    currentCertStoreCount: optionalNumber(values.current_cert_store_count),
    currentRevokedCertCount: optionalNumber(values.current_revoked_cert_count),
  };
}

/** Vault's multi-issuer PKI API through the shared HTTP client. */
export class VaultPkiAdapter implements PkiEngineGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  /** Failures keep Vault's sanitized reason ("common name not allowed by this role"). */
  private async call(session: VaultSession, mount: string, path: string, options: RequestOptions = {}): Promise<JsonObject | null> {
    const response = await this.client.request(session.serverUrl, `${encodeVaultPath(mount)}/${path}`, {
      ...options,
      token: session.token,
      includeReason: true,
    });
    if (response === null || response === undefined) return null;
    return asObject(response);
  }

  private async list(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<JsonObject> {
    try {
      return data(await this.call(session, mount, path, { query: { list: true }, signal }));
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return { keys: [] };
      throw error;
    }
  }

  async listIssuers(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly PkiIssuerSummary[]> {
    const values = await this.list(session, mount, 'issuers', signal);
    const info = values.key_info === undefined || values.key_info === null ? {} : asObject(values.key_info);
    return asStringArray(values.keys).map((id) => issuerSummary(id, info[id] ?? { serial_number: '' }));
  }

  async readIssuer(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<PkiIssuer> {
    return issuer(data(await this.call(session, mount, `issuer/${segment(ref)}`, { signal })));
  }

  async updateIssuer(session: VaultSession, mount: string, ref: string, input: PkiIssuerUpdate, signal?: AbortSignal): Promise<PkiIssuer> {
    // POST replaces the issuer's settings, so start from what Vault has now.
    const current = data(await this.call(session, mount, `issuer/${segment(ref)}`, { signal }));
    const kept = Object.fromEntries(ISSUER_WRITABLE_FIELDS.flatMap((field) => (
      current[field] === undefined || current[field] === null ? [] : [[field, current[field]]]
    )));
    const response = await this.call(session, mount, `issuer/${segment(ref)}`, {
      method: 'POST',
      body: {
        ...kept,
        issuer_name: input.name.trim(),
        usage: input.usage.join(','),
        leaf_not_after_behavior: input.leafNotAfterBehavior,
      },
      signal,
    });
    return issuer(data(response));
  }

  async deleteIssuer(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<readonly string[]> {
    return warnings(await this.call(session, mount, `issuer/${segment(ref)}`, { method: 'DELETE', signal }));
  }

  async setDefaultIssuer(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<void> {
    await this.call(session, mount, 'config/issuers', { method: 'POST', body: { default: ref.trim() }, signal });
  }

  async readIssuerCrl(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<string> {
    return asString(data(await this.call(session, mount, `issuer/${segment(ref)}/crl`, { signal })).crl);
  }

  async importBundle(session: VaultSession, mount: string, pemBundle: string, signal?: AbortSignal): Promise<PkiImportResult> {
    return importResult(await this.call(session, mount, 'issuers/import/bundle', {
      method: 'POST',
      body: { pem_bundle: pemBundle.trim() },
      signal,
    }));
  }

  async listKeys(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly PkiKeySummary[]> {
    const values = await this.list(session, mount, 'keys', signal);
    const info = values.key_info === undefined || values.key_info === null ? {} : asObject(values.key_info);
    return asStringArray(values.keys).map((id) => {
      const entry = info[id] === undefined ? {} : asObject(info[id]);
      return { id, name: optionalString(entry.key_name) ?? '', isDefault: optionalBoolean(entry.is_default) };
    });
  }

  async generateRoot(session: VaultSession, mount: string, input: PkiGenerateRootInput, signal?: AbortSignal): Promise<PkiGeneratedRoot> {
    const response = await this.call(session, mount, `root/generate/${input.exportKey}`, {
      method: 'POST',
      body: compact({
        ...subjectBody(input),
        issuer_name: optionalText(input.issuerName),
        ttl: optionalText(input.ttl),
        max_path_length: input.maxPathLength,
      }),
      signal,
    });
    const values = data(response);
    return {
      certificate: certificateOnly(values.certificate),
      issuerId: asString(values.issuer_id),
      issuerName: optionalString(values.issuer_name) ?? '',
      keyId: asString(values.key_id),
      serialNumber: asString(values.serial_number),
      privateKey: privateKey(values),
      warnings: warnings(response),
    };
  }

  async generateIntermediate(
    session: VaultSession,
    mount: string,
    input: PkiGenerateIntermediateInput,
    signal?: AbortSignal,
  ): Promise<PkiGeneratedCsr> {
    const response = await this.call(session, mount, `intermediate/generate/${input.exportKey}`, {
      method: 'POST',
      body: compact(subjectBody(input)),
      signal,
    });
    const values = data(response);
    return {
      csr: asString(values.csr),
      keyId: optionalString(values.key_id) ?? '',
      privateKey: privateKey(values),
      warnings: warnings(response),
    };
  }

  async setSignedIntermediate(session: VaultSession, mount: string, certificate: string, signal?: AbortSignal): Promise<PkiImportResult> {
    return importResult(await this.call(session, mount, 'intermediate/set-signed', {
      method: 'POST',
      body: { certificate: certificate.trim() },
      signal,
    }));
  }

  async signIntermediate(
    session: VaultSession,
    rootMount: string,
    input: PkiSignIntermediateInput,
    signal?: AbortSignal,
  ): Promise<PkiSignedCertificate> {
    const ref = optionalText(input.issuerRef);
    const response = await this.call(session, rootMount, ref ? `issuer/${segment(ref)}/sign-intermediate` : 'root/sign-intermediate', {
      method: 'POST',
      body: compact({
        csr: input.csr.trim(),
        common_name: optionalText(input.commonName),
        ttl: optionalText(input.ttl),
        max_path_length: input.maxPathLength,
        format: 'pem_bundle',
      }),
      signal,
    });
    return signedCertificate(response);
  }

  async listRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]> {
    return asStringArray((await this.list(session, mount, 'roles', signal)).keys);
  }

  async readRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<PkiRole> {
    return role(name, data(await this.call(session, mount, `roles/${segment(name)}`, { signal })));
  }

  async saveRole(
    session: VaultSession,
    mount: string,
    name: string,
    input: PkiRoleInput,
    mode: 'create' | 'update',
    signal?: AbortSignal,
  ): Promise<void> {
    // POST replaces the whole role; keep fields this console does not edit.
    const current = mode === 'update'
      ? data(await this.call(session, mount, `roles/${segment(name)}`, { signal }))
      : {};
    await this.call(session, mount, `roles/${segment(name)}`, {
      method: 'POST',
      body: { ...current, ...roleBody(input) },
      signal,
    });
  }

  async deleteRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void> {
    await this.call(session, mount, `roles/${segment(name)}`, { method: 'DELETE', signal });
  }

  async issueCertificate(
    session: VaultSession,
    mount: string,
    roleName: string,
    input: PkiIssueInput,
    signal?: AbortSignal,
  ): Promise<PkiIssuedCertificate> {
    const response = await this.call(session, mount, `issue/${segment(roleName)}`, {
      method: 'POST',
      body: compact({
        common_name: input.commonName.trim(),
        alt_names: splitList(input.altNames).join(',') || undefined,
        ip_sans: splitList(input.ipSans).join(',') || undefined,
        ttl: optionalText(input.ttl),
        format: input.format,
        private_key_format: input.privateKeyFormat || undefined,
      }),
      signal,
    });
    return { ...signedCertificate(response), privateKey: privateKey(data(response)) };
  }

  async signCertificate(session: VaultSession, mount: string, roleName: string, input: PkiSignInput, signal?: AbortSignal): Promise<PkiSignedCertificate> {
    return signedCertificate(await this.call(session, mount, `sign/${segment(roleName)}`, {
      method: 'POST',
      body: compact({
        csr: input.csr.trim(),
        common_name: optionalText(input.commonName),
        alt_names: splitList(input.altNames).join(',') || undefined,
        ip_sans: splitList(input.ipSans).join(',') || undefined,
        ttl: optionalText(input.ttl),
        format: input.format,
      }),
      signal,
    }));
  }

  async listCertificates(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]> {
    return asStringArray((await this.list(session, mount, 'certs', signal)).keys);
  }

  async readCertificate(session: VaultSession, mount: string, serial: string, signal?: AbortSignal): Promise<PkiStoredCertificate> {
    const values = data(await this.call(session, mount, `cert/${segment(serial)}`, { signal }));
    return {
      serialNumber: serial,
      certificate: asString(values.certificate),
      revocationTime: epochSeconds(values.revocation_time) ?? 0,
      revokedAt: optionalString(values.revocation_time_rfc3339),
      issuerId: optionalString(values.issuer_id),
    };
  }

  async revokeCertificate(session: VaultSession, mount: string, serial: string, signal?: AbortSignal): Promise<PkiRevocation> {
    const response = await this.call(session, mount, 'revoke', { method: 'POST', body: { serial_number: serial.trim() }, signal });
    const values = response?.data === null || response?.data === undefined ? {} : asObject(response.data);
    return { revocationTime: epochSeconds(values.revocation_time) ?? 0, state: optionalString(values.state) };
  }

  async tidy(session: VaultSession, mount: string, input: PkiTidyInput, signal?: AbortSignal): Promise<readonly string[]> {
    return warnings(await this.call(session, mount, 'tidy', {
      method: 'POST',
      body: compact({
        tidy_cert_store: input.tidyCertStore,
        tidy_revoked_certs: input.tidyRevokedCerts,
        tidy_expired_issuers: input.tidyExpiredIssuers,
        safety_buffer: optionalText(input.safetyBuffer),
      }),
      signal,
    }));
  }

  async readTidyStatus(session: VaultSession, mount: string, signal?: AbortSignal): Promise<PkiTidyStatus> {
    return tidyStatus(data(await this.call(session, mount, 'tidy-status', { signal })));
  }

  async readUrls(session: VaultSession, mount: string, signal?: AbortSignal): Promise<PkiUrlsConfig> {
    const values = data(await this.call(session, mount, 'config/urls', { signal }));
    return {
      issuingCertificates: optionalStringArray(values.issuing_certificates),
      crlDistributionPoints: optionalStringArray(values.crl_distribution_points),
      ocspServers: optionalStringArray(values.ocsp_servers),
    };
  }

  async writeUrls(session: VaultSession, mount: string, input: PkiUrlsConfig, signal?: AbortSignal): Promise<void> {
    await this.call(session, mount, 'config/urls', {
      method: 'POST',
      body: {
        issuing_certificates: input.issuingCertificates,
        crl_distribution_points: input.crlDistributionPoints,
        ocsp_servers: input.ocspServers,
      },
      signal,
    });
  }

  async readCrlConfig(session: VaultSession, mount: string, signal?: AbortSignal): Promise<PkiCrlConfig> {
    const values = data(await this.call(session, mount, 'config/crl', { signal }));
    return {
      expiry: optionalString(values.expiry) ?? '',
      disable: optionalBoolean(values.disable),
      autoRebuild: optionalBoolean(values.auto_rebuild),
    };
  }

  async writeCrlConfig(session: VaultSession, mount: string, input: PkiCrlConfig, signal?: AbortSignal): Promise<void> {
    await this.call(session, mount, 'config/crl', {
      method: 'POST',
      body: compact({ expiry: optionalText(input.expiry), disable: input.disable, auto_rebuild: input.autoRebuild }),
      signal,
    });
  }

  async rotateCrl(session: VaultSession, mount: string, signal?: AbortSignal): Promise<void> {
    await this.call(session, mount, 'crl/rotate', { signal });
  }
}
