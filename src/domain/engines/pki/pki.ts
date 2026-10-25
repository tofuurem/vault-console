import type { VaultSession } from '@/domain/vault/contracts';

export type PkiKeyType = 'rsa' | 'ec' | 'ed25519';
/** Roles may also accept any key type when signing CSRs. */
export type PkiRoleKeyType = PkiKeyType | 'any';
/** `internal` keeps the private key in Vault; `exported` returns it once. */
export type PkiKeyExport = 'internal' | 'exported';
export type PkiLeafNotAfterBehavior = 'err' | 'truncate' | 'permit';
export type PkiIssuerUsage = 'read-only' | 'issuing-certificates' | 'crl-signing' | 'ocsp-signing';
export type PkiCertificateFormat = 'pem' | 'pem_bundle';
/** Empty keeps Vault's default (PKCS#1/SEC1 for PEM). */
export type PkiPrivateKeyFormat = '' | 'pkcs8';

export const PKI_KEY_BITS: Readonly<Record<PkiRoleKeyType, readonly number[]>> = {
  rsa: [2048, 3072, 4096],
  ec: [256, 384, 521],
  ed25519: [0],
  any: [0],
};

export const PKI_DEFAULT_KEY_BITS: Readonly<Record<PkiRoleKeyType, number>> = {
  rsa: 2048,
  ec: 256,
  ed25519: 0,
  any: 0,
};

export const PKI_ISSUER_USAGES: readonly { readonly value: PkiIssuerUsage; readonly label: string; readonly description: string }[] = [
  { value: 'read-only', label: 'Read', description: 'Anyone with read access can fetch the certificate.' },
  { value: 'issuing-certificates', label: 'Issue certificates', description: 'Signs leaf and intermediate certificates.' },
  { value: 'crl-signing', label: 'Sign CRLs', description: 'Signs the revocation list for certificates it issued.' },
  { value: 'ocsp-signing', label: 'Sign OCSP responses', description: 'Answers OCSP revocation checks.' },
];

export const PKI_LEAF_NOT_AFTER_BEHAVIORS: readonly {
  readonly value: PkiLeafNotAfterBehavior;
  readonly label: string;
  readonly description: string;
}[] = [
  { value: 'err', label: 'Refuse', description: 'Reject requests that would outlive this issuer.' },
  { value: 'truncate', label: 'Shorten', description: 'Cut the certificate lifetime to end with the issuer.' },
  { value: 'permit', label: 'Allow', description: 'Issue anyway; clients may reject the chain once the issuer expires.' },
];

/**
 * A private key Vault returned exactly once. It renders as `[REDACTED]` in
 * JSON and string contexts so it cannot leak into logs or caches by accident.
 */
export class PkiPrivateKey {
  readonly #value: string;
  /** `rsa`, `ec`, or `ed25519` as Vault reports it. */
  readonly type: string;

  constructor(value: string, type: string) {
    this.#value = value;
    this.type = type;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): '[REDACTED]' {
    return '[REDACTED]';
  }

  toString(): '[REDACTED]' {
    return '[REDACTED]';
  }
}

/**
 * A request Vault rejected with a readable reason, such as
 * "common name not allowed by this role". `details` never contains PEM data.
 */
export interface PkiIssuerSummary {
  readonly id: string;
  /** Empty when the issuer has no name. */
  readonly name: string;
  readonly isDefault: boolean;
  readonly keyId: string;
  readonly serialNumber: string;
}

export interface PkiIssuer {
  readonly id: string;
  readonly name: string;
  readonly keyId: string;
  readonly certificate: string;
  /** The issuer's chain, starting with its own certificate. */
  readonly caChain: readonly string[];
  readonly usage: readonly string[];
  readonly leafNotAfterBehavior: string;
  readonly revoked: boolean;
  readonly issuingCertificates: readonly string[];
  readonly crlDistributionPoints: readonly string[];
  readonly ocspServers: readonly string[];
}

export interface PkiIssuerUpdate {
  readonly name: string;
  readonly usage: readonly string[];
  readonly leafNotAfterBehavior: PkiLeafNotAfterBehavior;
}

export interface PkiKeySummary {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
}

/** Subject and key fields shared by root and intermediate generation. */
export interface PkiCaSubjectInput {
  readonly commonName: string;
  readonly keyType: PkiKeyType;
  readonly keyBits: number;
  readonly keyName?: string;
  readonly organization?: string;
  readonly ou?: string;
  readonly country?: string;
  readonly locality?: string;
  readonly province?: string;
  /** Comma-separated DNS names or email addresses. */
  readonly altNames?: string;
  /** Comma-separated IP addresses. */
  readonly ipSans?: string;
}

export interface PkiGenerateRootInput extends PkiCaSubjectInput {
  readonly exportKey: PkiKeyExport;
  readonly issuerName?: string;
  readonly ttl?: string;
  /** -1 or empty leaves the chain length unlimited. */
  readonly maxPathLength?: number;
}

export interface PkiGenerateIntermediateInput extends PkiCaSubjectInput {
  readonly exportKey: PkiKeyExport;
}

export interface PkiGeneratedRoot {
  readonly certificate: string;
  readonly issuerId: string;
  readonly issuerName: string;
  readonly keyId: string;
  readonly serialNumber: string;
  readonly privateKey?: PkiPrivateKey;
  readonly warnings: readonly string[];
}

export interface PkiGeneratedCsr {
  readonly csr: string;
  readonly keyId: string;
  readonly privateKey?: PkiPrivateKey;
  readonly warnings: readonly string[];
}

export interface PkiImportResult {
  readonly importedIssuers: readonly string[];
  readonly importedKeys: readonly string[];
  readonly existingIssuers: readonly string[];
  readonly warnings: readonly string[];
}

export interface PkiSignIntermediateInput {
  readonly csr: string;
  readonly commonName?: string;
  readonly issuerRef?: string;
  readonly ttl?: string;
  readonly maxPathLength?: number;
}

export interface PkiSignedCertificate {
  /** The leaf (or intermediate) certificate alone. */
  readonly certificate: string;
  readonly issuingCa: string;
  readonly caChain: readonly string[];
  readonly serialNumber: string;
  /** Epoch seconds. */
  readonly expiration?: number;
  readonly warnings: readonly string[];
}

export interface PkiIssuedCertificate extends PkiSignedCertificate {
  readonly privateKey?: PkiPrivateKey;
}

export interface PkiRole {
  readonly name: string;
  readonly issuerRef: string;
  readonly allowedDomains: readonly string[];
  readonly allowSubdomains: boolean;
  readonly allowBareDomains: boolean;
  readonly allowGlobDomains: boolean;
  readonly allowAnyName: boolean;
  readonly allowLocalhost: boolean;
  readonly allowIpSans: boolean;
  readonly serverFlag: boolean;
  readonly clientFlag: boolean;
  readonly keyType: PkiRoleKeyType;
  readonly keyBits: number;
  readonly ttlSeconds: number;
  readonly maxTtlSeconds: number;
  readonly noStore: boolean;
  readonly requireCn: boolean;
  readonly extKeyUsage: readonly string[];
  readonly organization: readonly string[];
  readonly ou: readonly string[];
}

/** Form values for creating or editing a role; TTLs are Vault duration strings. */
export interface PkiRoleInput extends Omit<PkiRole, 'name' | 'ttlSeconds' | 'maxTtlSeconds'> {
  readonly ttl: string;
  readonly maxTtl: string;
}

export interface PkiIssueInput {
  readonly commonName: string;
  readonly altNames?: string;
  readonly ipSans?: string;
  readonly ttl?: string;
  readonly format: PkiCertificateFormat;
  readonly privateKeyFormat: PkiPrivateKeyFormat;
}

export interface PkiSignInput {
  readonly csr: string;
  readonly commonName?: string;
  readonly altNames?: string;
  readonly ipSans?: string;
  readonly ttl?: string;
  readonly format: PkiCertificateFormat;
}

export interface PkiStoredCertificate {
  readonly serialNumber: string;
  readonly certificate: string;
  /** Epoch seconds; 0 when the certificate is not revoked. */
  readonly revocationTime: number;
  readonly revokedAt?: string;
  readonly issuerId?: string;
}

export interface PkiRevocation {
  readonly revocationTime: number;
  readonly state?: string;
}

export interface PkiTidyInput {
  readonly tidyCertStore: boolean;
  readonly tidyRevokedCerts: boolean;
  readonly tidyExpiredIssuers: boolean;
  /** Duration a certificate must be past expiry before removal, e.g. `72h`. */
  readonly safetyBuffer: string;
}

export interface PkiTidyStatus {
  /** `Inactive`, `Running`, `Finished`, `Error`, or `Cancelled`. */
  readonly state: string;
  readonly error?: string;
  readonly message?: string;
  readonly timeStarted?: string;
  readonly timeFinished?: string;
  readonly lastAutoTidyFinished?: string;
  readonly certStoreDeletedCount?: number;
  readonly revokedCertDeletedCount?: number;
  readonly currentCertStoreCount?: number;
  readonly currentRevokedCertCount?: number;
}

export interface PkiUrlsConfig {
  readonly issuingCertificates: readonly string[];
  readonly crlDistributionPoints: readonly string[];
  readonly ocspServers: readonly string[];
}

export interface PkiCrlConfig {
  readonly expiry: string;
  readonly disable: boolean;
  readonly autoRebuild: boolean;
}

/** Vault's multi-issuer PKI API (1.11 and later), relative to one mount. */
export interface PkiEngineGateway {
  listIssuers(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly PkiIssuerSummary[]>;
  readIssuer(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<PkiIssuer>;
  updateIssuer(session: VaultSession, mount: string, ref: string, input: PkiIssuerUpdate, signal?: AbortSignal): Promise<PkiIssuer>;
  deleteIssuer(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<readonly string[]>;
  setDefaultIssuer(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<void>;
  readIssuerCrl(session: VaultSession, mount: string, ref: string, signal?: AbortSignal): Promise<string>;
  importBundle(session: VaultSession, mount: string, pemBundle: string, signal?: AbortSignal): Promise<PkiImportResult>;
  listKeys(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly PkiKeySummary[]>;

  generateRoot(session: VaultSession, mount: string, input: PkiGenerateRootInput, signal?: AbortSignal): Promise<PkiGeneratedRoot>;
  generateIntermediate(
    session: VaultSession,
    mount: string,
    input: PkiGenerateIntermediateInput,
    signal?: AbortSignal,
  ): Promise<PkiGeneratedCsr>;
  setSignedIntermediate(session: VaultSession, mount: string, certificate: string, signal?: AbortSignal): Promise<PkiImportResult>;
  /** Called on the parent CA's mount. Returns the signed certificate followed by its issuer. */
  signIntermediate(
    session: VaultSession,
    rootMount: string,
    input: PkiSignIntermediateInput,
    signal?: AbortSignal,
  ): Promise<PkiSignedCertificate>;

  listRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]>;
  readRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<PkiRole>;
  /** Creates a role, or updates one while keeping fields this console does not edit. */
  saveRole(
    session: VaultSession,
    mount: string,
    name: string,
    input: PkiRoleInput,
    mode: 'create' | 'update',
    signal?: AbortSignal,
  ): Promise<void>;
  deleteRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
  issueCertificate(session: VaultSession, mount: string, role: string, input: PkiIssueInput, signal?: AbortSignal): Promise<PkiIssuedCertificate>;
  signCertificate(session: VaultSession, mount: string, role: string, input: PkiSignInput, signal?: AbortSignal): Promise<PkiSignedCertificate>;

  listCertificates(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]>;
  readCertificate(session: VaultSession, mount: string, serial: string, signal?: AbortSignal): Promise<PkiStoredCertificate>;
  revokeCertificate(session: VaultSession, mount: string, serial: string, signal?: AbortSignal): Promise<PkiRevocation>;

  tidy(session: VaultSession, mount: string, input: PkiTidyInput, signal?: AbortSignal): Promise<readonly string[]>;
  readTidyStatus(session: VaultSession, mount: string, signal?: AbortSignal): Promise<PkiTidyStatus>;
  readUrls(session: VaultSession, mount: string, signal?: AbortSignal): Promise<PkiUrlsConfig>;
  writeUrls(session: VaultSession, mount: string, input: PkiUrlsConfig, signal?: AbortSignal): Promise<void>;
  readCrlConfig(session: VaultSession, mount: string, signal?: AbortSignal): Promise<PkiCrlConfig>;
  writeCrlConfig(session: VaultSession, mount: string, input: PkiCrlConfig, signal?: AbortSignal): Promise<void>;
  rotateCrl(session: VaultSession, mount: string, signal?: AbortSignal): Promise<void>;
}
