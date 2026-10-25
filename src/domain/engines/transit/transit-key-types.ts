import type { TransitKey } from './transit';

export type TransitKeyFamily = 'symmetric' | 'rsa' | 'ecdsa' | 'ed25519' | 'hmac';

export interface TransitKeyTypeInfo {
  readonly type: string;
  readonly label: string;
  readonly family: TransitKeyFamily;
  readonly description: string;
  readonly encryption: boolean;
  readonly signing: boolean;
  /** Per-request context derives a unique key (`derived=true`). */
  readonly derivation: boolean;
  /** Same plaintext and context produce the same ciphertext; requires derivation. */
  readonly convergent: boolean;
  /** Asymmetric keys publish a public key per version. */
  readonly asymmetric: boolean;
}

/** Key types the console can create, in the order shown to operators. */
export const TRANSIT_KEY_TYPES: readonly TransitKeyTypeInfo[] = [
  symmetric('aes256-gcm96', 'AES-256-GCM', 'The default. Fast authenticated encryption.'),
  symmetric('aes128-gcm96', 'AES-128-GCM', 'Authenticated encryption with a shorter key.'),
  symmetric('chacha20-poly1305', 'ChaCha20-Poly1305', 'Authenticated encryption that is fast without AES hardware.'),
  {
    type: 'ed25519',
    label: 'Ed25519',
    family: 'ed25519',
    description: 'Fast, compact signatures.',
    encryption: false,
    signing: true,
    derivation: true,
    convergent: false,
    asymmetric: true,
  },
  ...['p256', 'p384', 'p521'].map((curve) => ({
    type: `ecdsa-${curve}`,
    label: `ECDSA ${curve.toUpperCase()}`,
    family: 'ecdsa' as const,
    description: `Signatures on the NIST ${curve.toUpperCase()} curve.`,
    encryption: false,
    signing: true,
    derivation: false,
    convergent: false,
    asymmetric: true,
  })),
  ...['2048', '3072', '4096'].map((bits) => ({
    type: `rsa-${bits}`,
    label: `RSA ${bits}`,
    family: 'rsa' as const,
    description: `${bits}-bit RSA for signatures and encrypting small payloads.`,
    encryption: true,
    signing: true,
    derivation: false,
    convergent: false,
    asymmetric: true,
  })),
  {
    type: 'hmac',
    label: 'HMAC',
    family: 'hmac',
    description: 'A dedicated key for HMAC only.',
    encryption: false,
    signing: false,
    derivation: false,
    convergent: false,
    asymmetric: false,
  },
];

function symmetric(type: string, label: string, description: string): TransitKeyTypeInfo {
  return {
    type,
    label,
    family: 'symmetric',
    description,
    encryption: true,
    signing: false,
    derivation: true,
    convergent: true,
    asymmetric: false,
  };
}

export const DEFAULT_TRANSIT_KEY_TYPE = 'aes256-gcm96';

export function transitKeyTypeInfo(type: string): TransitKeyTypeInfo | undefined {
  return TRANSIT_KEY_TYPES.find((entry) => entry.type === type);
}

export function transitKeyTypeLabel(type: string): string {
  return transitKeyTypeInfo(type)?.label ?? type;
}

export function transitKeyFamily(type: string): TransitKeyFamily | undefined {
  return transitKeyTypeInfo(type)?.family;
}

export type TransitOperation =
  | 'encrypt'
  | 'decrypt'
  | 'rewrap'
  | 'datakey'
  | 'sign'
  | 'verify'
  | 'hmac'
  | 'verify-hmac';

export interface TransitOperationInfo {
  readonly key: TransitOperation;
  readonly label: string;
  readonly icon: string;
  /** Lower-case phrase that completes "Your token is not allowed to …". */
  readonly action: string;
}

export const TRANSIT_OPERATIONS: readonly TransitOperationInfo[] = [
  { key: 'encrypt', label: 'Encrypt', icon: 'ri-lock-line', action: 'encrypt with this key' },
  { key: 'decrypt', label: 'Decrypt', icon: 'ri-lock-unlock-line', action: 'decrypt with this key' },
  { key: 'rewrap', label: 'Rewrap', icon: 'ri-refresh-line', action: 'rewrap with this key' },
  { key: 'datakey', label: 'Data key', icon: 'ri-key-2-line', action: 'generate a data key with this key' },
  { key: 'sign', label: 'Sign', icon: 'ri-quill-pen-line', action: 'sign with this key' },
  { key: 'verify', label: 'Verify', icon: 'ri-shield-check-line', action: 'verify signatures with this key' },
  { key: 'hmac', label: 'HMAC', icon: 'ri-fingerprint-line', action: 'compute an HMAC with this key' },
  { key: 'verify-hmac', label: 'Verify HMAC', icon: 'ri-checkbox-circle-line', action: 'verify an HMAC with this key' },
];

export function isTransitOperation(value: string): value is TransitOperation {
  return TRANSIT_OPERATIONS.some((operation) => operation.key === value);
}

/**
 * Operations the key can run. Vault's own `supports_*` flags win so imported
 * or newer key types still work; every key type except managed keys can HMAC.
 */
export function transitKeyOperations(key: Pick<TransitKey, 'type' | 'supportsEncryption' | 'supportsDecryption' | 'supportsSigning'>): readonly TransitOperation[] {
  const operations: TransitOperation[] = [];
  if (key.supportsEncryption) operations.push('encrypt');
  if (key.supportsDecryption) operations.push('decrypt');
  if (key.supportsEncryption && key.supportsDecryption) operations.push('rewrap');
  // Data keys are wrapped with the transit key, so any key that encrypts works.
  if (key.supportsEncryption) operations.push('datakey');
  if (key.supportsSigning) operations.push('sign', 'verify');
  if (key.type !== 'managed_key') operations.push('hmac', 'verify-hmac');
  return operations;
}

export const HASH_ALGORITHMS = [
  'sha2-224',
  'sha2-256',
  'sha2-384',
  'sha2-512',
  'sha3-224',
  'sha3-256',
  'sha3-384',
  'sha3-512',
] as const;

export const DEFAULT_HASH_ALGORITHM = 'sha2-256';
export const RSA_SIGNATURE_ALGORITHMS = ['pss', 'pkcs1v15'] as const;
export const ECDSA_MARSHALING_ALGORITHMS = ['asn1', 'jws'] as const;
export const DATA_KEY_BITS = [128, 256, 512] as const;

/** Signing options that apply to a key family; Ed25519 ignores the hash. */
export function signingOptions(type: string) {
  const family = transitKeyFamily(type);
  return {
    hashAlgorithm: family === 'rsa' || family === 'ecdsa',
    prehashed: family === 'rsa' || family === 'ecdsa',
    signatureAlgorithm: family === 'rsa',
    marshalingAlgorithm: family === 'ecdsa',
  };
}
