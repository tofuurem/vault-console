import type { VaultSession } from '@/domain/vault/contracts';

const REDACTED = '[REDACTED]';

/**
 * Secret SSH material (one-time passwords, imported CA private keys). The value
 * stays in memory and redacts itself when serialized or logged.
 */
export interface SshSecret<Kind extends string> {
  readonly kind: Kind;
  reveal(): string;
  toJSON(): typeof REDACTED;
  toString(): typeof REDACTED;
}

class MemoryOnlySshSecret<Kind extends string> implements SshSecret<Kind> {
  readonly kind: Kind;
  readonly #value: string;

  constructor(kind: Kind, value: string) {
    this.kind = kind;
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): typeof REDACTED {
    return REDACTED;
  }

  toString(): typeof REDACTED {
    return REDACTED;
  }
}

export type SshOtp = SshSecret<'ssh-otp'>;
export type SshPrivateKey = SshSecret<'ssh-private-key'>;

export function sshOtp(value: string): SshOtp {
  return new MemoryOnlySshSecret('ssh-otp', value);
}

export function sshPrivateKey(value: string): SshPrivateKey {
  return new MemoryOnlySshSecret('ssh-private-key', value);
}

/** Key types Vault can generate for a signing CA. */
export const SSH_CA_KEY_TYPES = [
  { value: 'ssh-ed25519', label: 'Ed25519', bits: [] },
  { value: 'ecdsa-sha2-nistp256', label: 'ECDSA P-256', bits: [] },
  { value: 'ecdsa-sha2-nistp384', label: 'ECDSA P-384', bits: [] },
  { value: 'ecdsa-sha2-nistp521', label: 'ECDSA P-521', bits: [] },
  { value: 'ssh-rsa', label: 'RSA', bits: [2048, 3072, 4096] },
] as const;

export type SshCaKeyType = (typeof SSH_CA_KEY_TYPES)[number]['value'];

export interface SshCaConfig {
  /** OpenSSH public key line of the signing CA, without a trailing newline. */
  readonly publicKey: string;
}

export type SshCaSetupInput =
  | { readonly mode: 'generate'; readonly keyType: SshCaKeyType; readonly keyBits?: number }
  | { readonly mode: 'import'; readonly privateKey: SshPrivateKey; readonly publicKey: string };

export type SshRoleKeyType = 'ca' | 'otp';

export interface SshRoleSummary {
  readonly name: string;
  /** `dynamic` roles are deprecated and shown read-only; unknown types keep their raw value. */
  readonly keyType: SshRoleKeyType | string;
}

export const SSH_ALGORITHM_SIGNERS = ['default', 'rsa-sha2-256', 'rsa-sha2-512', 'ssh-rsa'] as const;

export interface SshCaRole {
  readonly keyType: 'ca';
  readonly allowUserCertificates: boolean;
  readonly allowHostCertificates: boolean;
  readonly allowedUsers: string;
  readonly defaultUser: string;
  readonly allowedDomains: string;
  readonly allowSubdomains: boolean;
  readonly allowBareDomains: boolean;
  readonly allowedExtensions: string;
  readonly defaultExtensions: Readonly<Record<string, string>>;
  readonly allowedCriticalOptions: string;
  readonly defaultCriticalOptions: Readonly<Record<string, string>>;
  readonly allowUserKeyIds: boolean;
  readonly keyIdFormat: string;
  readonly algorithmSigner: string;
  /** Key type to allowed lengths; `0` means any length for that type. */
  readonly allowedUserKeyLengths: Readonly<Record<string, readonly number[]>>;
  readonly ttlSeconds: number;
  readonly maxTtlSeconds: number;
  readonly notBeforeDurationSeconds: number;
  /** Identity templating flags; kept so saving a role never silently turns them off. */
  readonly allowedUsersTemplate: boolean;
  readonly allowedDomainsTemplate: boolean;
  readonly defaultUserTemplate: boolean;
  readonly defaultExtensionsTemplate: boolean;
  readonly allowEmptyPrincipals: boolean;
}

export interface SshOtpRole {
  readonly keyType: 'otp';
  readonly defaultUser: string;
  readonly allowedUsers: string;
  readonly cidrList: string;
  readonly excludeCidrList: string;
  readonly port: number;
}

export type SshRole = SshCaRole | SshOtpRole;

/** What the role form sends: durations are strings Vault parses (`30m`, `24h`). */
export interface SshCaRoleInput extends Omit<SshCaRole, 'ttlSeconds' | 'maxTtlSeconds' | 'notBeforeDurationSeconds'> {
  readonly ttl: string;
  readonly maxTtl: string;
  readonly notBeforeDuration: string;
}

export type SshRoleInput = SshCaRoleInput | SshOtpRole;

export type SshCertType = 'user' | 'host';

export interface SshSignInput {
  readonly role: string;
  readonly publicKey: string;
  /** Comma-separated principals; empty uses the role default. */
  readonly validPrincipals: string;
  readonly certType: SshCertType;
  readonly ttl: string;
  readonly keyId: string;
  /** Omitted when undefined so the role's default extensions apply. */
  readonly extensions?: Readonly<Record<string, string>>;
  readonly criticalOptions?: Readonly<Record<string, string>>;
}

export interface SshSignedKey {
  readonly serialNumber: string;
  /** OpenSSH certificate line, without a trailing newline. */
  readonly signedKey: string;
}

export interface SshOtpRequest {
  readonly ip: string;
  readonly username?: string;
}

export interface SshOtpCredential {
  readonly otp: SshOtp;
  readonly ip: string;
  readonly username: string;
  readonly port?: number;
  readonly leaseId?: string;
  readonly leaseDurationSeconds?: number;
}

export interface SshOtpVerification {
  readonly ip: string;
  readonly username: string;
  readonly roleName: string;
}

export interface SshEngineGateway {
  /** Resolves `null` while no signing CA is configured. */
  readCa(session: VaultSession, mount: string, signal?: AbortSignal): Promise<SshCaConfig | null>;
  /** Resolves the generated public key, or `null` for an import (Vault does not echo it). */
  configureCa(session: VaultSession, mount: string, input: SshCaSetupInput, signal?: AbortSignal): Promise<SshCaConfig | null>;
  deleteCa(session: VaultSession, mount: string, signal?: AbortSignal): Promise<void>;
  listRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly SshRoleSummary[]>;
  readRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<SshRole>;
  writeRole(session: VaultSession, mount: string, name: string, input: SshRoleInput, signal?: AbortSignal): Promise<void>;
  deleteRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
  signKey(session: VaultSession, mount: string, input: SshSignInput, signal?: AbortSignal): Promise<SshSignedKey>;
  createOtp(session: VaultSession, mount: string, role: string, input: SshOtpRequest, signal?: AbortSignal): Promise<SshOtpCredential>;
  /** Resolves `null` when Vault does not know the OTP (already used or never issued). */
  verifyOtp(session: VaultSession, mount: string, otp: SshOtp, signal?: AbortSignal): Promise<SshOtpVerification | null>;
  readZeroAddressRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]>;
  /** An empty list removes the zero-address configuration. */
  writeZeroAddressRoles(session: VaultSession, mount: string, roles: readonly string[], signal?: AbortSignal): Promise<void>;
}
