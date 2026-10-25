import type { VaultSession } from '@/domain/vault/contracts';
import type { VaultError } from '@/domain/vault/errors';

/** One version in a key ring. Symmetric keys carry only a creation time. */
export interface TransitKeyVersion {
  readonly version: number;
  /** ISO timestamp; missing when Vault does not report one. */
  readonly createdAt?: string;
  /** PEM or base64 public key for asymmetric keys. */
  readonly publicKey?: string;
}

export interface TransitKey {
  readonly name: string;
  /** Raw Vault key type, e.g. `aes256-gcm96` or `ed25519`. */
  readonly type: string;
  readonly latestVersion: number;
  readonly minDecryptionVersion: number;
  /** 0 means "always the latest version". */
  readonly minEncryptionVersion: number;
  /** Versions below this were trimmed and are gone for good; 0 means nothing was trimmed. */
  readonly minAvailableVersion: number;
  readonly deletionAllowed: boolean;
  readonly exportable: boolean;
  readonly allowPlaintextBackup: boolean;
  readonly derived: boolean;
  readonly convergentEncryption: boolean;
  readonly importedKey: boolean;
  readonly supportsEncryption: boolean;
  readonly supportsDecryption: boolean;
  readonly supportsDerivation: boolean;
  readonly supportsSigning: boolean;
  /** 0 disables automatic rotation. */
  readonly autoRotatePeriodSeconds: number;
  /** HMAC key size in bytes. */
  readonly keySize?: number;
  /** Versions Vault still holds key material for, newest first. */
  readonly versions: readonly TransitKeyVersion[];
}

export interface CreateTransitKeyInput {
  readonly name: string;
  readonly type: string;
  readonly derived: boolean;
  readonly convergentEncryption: boolean;
  readonly exportable: boolean;
  readonly allowPlaintextBackup: boolean;
  /** Vault duration; empty or `0` disables automatic rotation. */
  readonly autoRotatePeriod: string;
  /** HMAC only, in bytes. */
  readonly keySize?: number;
}

export interface TransitKeyConfigInput {
  readonly minDecryptionVersion: number;
  readonly minEncryptionVersion: number;
  readonly deletionAllowed: boolean;
  readonly exportable: boolean;
  readonly allowPlaintextBackup: boolean;
  readonly autoRotatePeriod: string;
}

/** Every binary payload crossing the gateway is base64, exactly as Vault expects it. */
export interface EncryptInput {
  readonly plaintext: string;
  readonly context?: string;
  readonly keyVersion?: number;
}

export interface DecryptInput {
  readonly ciphertext: string;
  readonly context?: string;
}

export interface RewrapInput {
  readonly ciphertext: string;
  readonly context?: string;
  readonly keyVersion?: number;
}

export interface CiphertextResult {
  readonly ciphertext: string;
  readonly keyVersion?: number;
}

export type DataKeyKind = 'plaintext' | 'wrapped';

export interface DataKeyInput {
  readonly kind: DataKeyKind;
  readonly bits: number;
  readonly context?: string;
}

export interface DataKeyResult {
  readonly ciphertext: string;
  /** Present only for `plaintext` data keys. */
  readonly plaintext?: string;
  readonly keyVersion?: number;
}

export interface SignatureOptions {
  readonly hashAlgorithm?: string;
  readonly prehashed?: boolean;
  /** RSA only: `pss` or `pkcs1v15`. */
  readonly signatureAlgorithm?: string;
  /** ECDSA only: `asn1` or `jws`. */
  readonly marshalingAlgorithm?: string;
  readonly context?: string;
}

export interface SignInput extends SignatureOptions {
  readonly input: string;
  readonly keyVersion?: number;
}

export interface SignResult {
  readonly signature: string;
  readonly keyVersion?: number;
}

export interface VerifyInput extends SignatureOptions {
  readonly input: string;
  readonly signature: string;
}

export interface HmacInput {
  readonly input: string;
  readonly algorithm?: string;
  readonly keyVersion?: number;
}

export interface VerifyHmacInput {
  readonly input: string;
  readonly hmac: string;
  readonly algorithm?: string;
}

export type ByteFormat = 'base64' | 'hex';
export type RandomSource = 'platform' | 'seal' | 'all';

export interface RandomBytesInput {
  readonly bytes: number;
  readonly format: ByteFormat;
  readonly source: RandomSource;
}

export interface HashInput {
  readonly input: string;
  readonly algorithm: string;
  readonly format: ByteFormat;
}

/** Transit keys and cryptographic operations under one mount. */
export interface TransitEngineGateway {
  listKeys(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]>;
  readKey(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<TransitKey>;
  createKey(session: VaultSession, mount: string, input: CreateTransitKeyInput, signal?: AbortSignal): Promise<void>;
  rotateKey(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
  updateKeyConfig(
    session: VaultSession,
    mount: string,
    name: string,
    input: TransitKeyConfigInput,
    signal?: AbortSignal,
  ): Promise<void>;
  trimKey(session: VaultSession, mount: string, name: string, minAvailableVersion: number, signal?: AbortSignal): Promise<void>;
  deleteKey(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;

  encrypt(session: VaultSession, mount: string, name: string, input: EncryptInput, signal?: AbortSignal): Promise<CiphertextResult>;
  /** Resolves to base64 plaintext. */
  decrypt(session: VaultSession, mount: string, name: string, input: DecryptInput, signal?: AbortSignal): Promise<string>;
  rewrap(session: VaultSession, mount: string, name: string, input: RewrapInput, signal?: AbortSignal): Promise<CiphertextResult>;
  generateDataKey(session: VaultSession, mount: string, name: string, input: DataKeyInput, signal?: AbortSignal): Promise<DataKeyResult>;
  sign(session: VaultSession, mount: string, name: string, input: SignInput, signal?: AbortSignal): Promise<SignResult>;
  verify(session: VaultSession, mount: string, name: string, input: VerifyInput, signal?: AbortSignal): Promise<boolean>;
  hmac(session: VaultSession, mount: string, name: string, input: HmacInput, signal?: AbortSignal): Promise<string>;
  verifyHmac(session: VaultSession, mount: string, name: string, input: VerifyHmacInput, signal?: AbortSignal): Promise<boolean>;

  randomBytes(session: VaultSession, mount: string, input: RandomBytesInput, signal?: AbortSignal): Promise<string>;
  hash(session: VaultSession, mount: string, input: HashInput, signal?: AbortSignal): Promise<string>;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface TransitErrorText {
  readonly message: string;
  readonly detail?: string;
}

/** Plain-language explanation for a failed transit request. */
export function transitErrorText(error: VaultError, action: string): TransitErrorText {
  // Transit's validation messages ("missing 'context' for key derivation") are the only useful hint.
  const detail = error.reason ? sentence(error.reason) : undefined;
  if (error.code === 'authorization') {
    return { message: `Your token is not allowed to ${action}. Ask an operator for a policy that grants it.` };
  }
  if (error.code === 'invalid-request') {
    return { message: `Vault could not ${action}.`, detail: detail ?? 'Check the values and try again.' };
  }
  if (error.code === 'not-found') {
    return { message: `Vault could not ${action} because the key or path no longer exists.` };
  }
  return { message: error.message };
}
