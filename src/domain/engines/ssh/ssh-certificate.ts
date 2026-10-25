import { decodeBase64, encodeBase64, SshWireError, SshWireReader } from './ssh-wire';

const CERT_SUFFIX = '-cert-v01@openssh.com';
const FOREVER = 0xffff_ffff_ffff_ffffn;
/** Largest instant a JavaScript Date can hold, in seconds. */
const MAX_DATE_SECONDS = 8_640_000_000_000n;

export interface SshCertificateOption {
  readonly name: string;
  /** Empty for flag-style options such as `permit-pty`. */
  readonly value: string;
}

export interface SshCertificate {
  /** Full certificate type, e.g. `ssh-ed25519-cert-v01@openssh.com`. */
  readonly type: string;
  /** Certified key type, e.g. `ssh-ed25519`. */
  readonly keyType: string;
  readonly certType: 'user' | 'host';
  /** Serial as an unsigned decimal string, as `ssh-keygen -L` prints it. */
  readonly serial: string;
  readonly serialHex: string;
  readonly keyId: string;
  readonly principals: readonly string[];
  /** `null` means no lower bound. */
  readonly validAfter: Date | null;
  /** `null` means the certificate never expires. */
  readonly validBefore: Date | null;
  readonly criticalOptions: readonly SshCertificateOption[];
  readonly extensions: readonly SshCertificateOption[];
  /** Key type of the CA that signed the certificate. */
  readonly signingKeyType: string;
  /** Signature algorithm, e.g. `ssh-ed25519` or `rsa-sha2-512`. */
  readonly signatureAlgorithm: string;
  /** Wire-format CA public key, for fingerprints. */
  readonly signingKey: Uint8Array;
  readonly comment?: string;
}

export class SshCertificateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SshCertificateError';
  }
}

/** Skips the type-specific public key fields that follow the nonce. */
function skipPublicKey(reader: SshWireReader, keyType: string): void {
  const fields: Readonly<Record<string, number>> = {
    'ssh-rsa': 2, // e, n
    'ssh-dss': 4, // p, q, g, y
    'ssh-ed25519': 1, // pk
    'sk-ssh-ed25519@openssh.com': 2, // pk, application
    'sk-ecdsa-sha2-nistp256@openssh.com': 3, // curve, Q, application
  };
  const count = fields[keyType] ?? (keyType.startsWith('ecdsa-sha2-') ? 2 : undefined);
  if (count === undefined) throw new SshCertificateError(`Unsupported certificate key type ${keyType}.`);
  for (let index = 0; index < count; index += 1) reader.bytes();
}

function readStringList(blob: Uint8Array): readonly string[] {
  const reader = new SshWireReader(blob);
  const values: string[] = [];
  while (reader.remaining > 0) values.push(reader.string());
  return values;
}

/** Options are name/data pairs; non-empty data wraps the value in a nested string. */
function readOptions(blob: Uint8Array): readonly SshCertificateOption[] {
  const reader = new SshWireReader(blob);
  const options: SshCertificateOption[] = [];
  while (reader.remaining > 0) {
    const name = reader.string();
    const data = reader.bytes();
    options.push({ name, value: data.length === 0 ? '' : new SshWireReader(data).string() });
  }
  return options;
}

function timestamp(seconds: bigint, unbounded: bigint): Date | null {
  if (seconds === unbounded || seconds >= MAX_DATE_SECONDS) return null;
  return new Date(Number(seconds) * 1000);
}

function decodeCertificate(type: string, bytes: Uint8Array, comment: string | undefined): SshCertificate {
  const reader = new SshWireReader(bytes);
  if (reader.string() !== type) throw new SshCertificateError('The certificate type does not match its contents.');
  const keyType = type.slice(0, -CERT_SUFFIX.length);
  reader.bytes(); // nonce
  skipPublicKey(reader, keyType);
  const serial = reader.uint64();
  const certTypeCode = reader.uint32();
  if (certTypeCode !== 1 && certTypeCode !== 2) throw new SshCertificateError('The certificate is neither a user nor a host certificate.');
  const keyId = reader.string();
  const principals = readStringList(reader.bytes());
  const validAfter = reader.uint64();
  const validBefore = reader.uint64();
  const criticalOptions = readOptions(reader.bytes());
  const extensions = readOptions(reader.bytes());
  reader.bytes(); // reserved
  const signingKey = reader.bytes();
  const signature = reader.bytes();
  return {
    type,
    keyType,
    certType: certTypeCode === 1 ? 'user' : 'host',
    serial: serial.toString(10),
    serialHex: serial.toString(16).padStart(16, '0'),
    keyId,
    principals,
    validAfter: timestamp(validAfter, 0n),
    validBefore: timestamp(validBefore, FOREVER),
    criticalOptions,
    extensions,
    signingKeyType: new SshWireReader(signingKey).string(),
    signatureAlgorithm: new SshWireReader(signature).string(),
    signingKey,
    ...(comment ? { comment } : {}),
  };
}

/**
 * Parses an OpenSSH certificate line (`<type>-cert-v01@openssh.com <base64> [comment]`).
 * Signatures are not verified: this is for display, Vault already signed it.
 */
export function parseSshCertificate(text: string): SshCertificate {
  const [type = '', body = '', ...comment] = text.trim().split(/\s+/);
  if (!type.endsWith(CERT_SUFFIX)) throw new SshCertificateError('This is not an OpenSSH certificate.');
  const bytes = decodeBase64(body);
  if (!bytes) throw new SshCertificateError('The certificate body is not valid base64.');
  try {
    return decodeCertificate(type, bytes, comment.join(' ') || undefined);
  } catch (error) {
    if (error instanceof SshWireError) throw new SshCertificateError(`The certificate is malformed. ${error.message}`);
    throw error;
  }
}

export function tryParseSshCertificate(text: string): SshCertificate | undefined {
  try {
    return parseSshCertificate(text);
  } catch {
    return undefined;
  }
}

export type SshCertificateStatus = 'not-yet-valid' | 'valid' | 'expired';

export function sshCertificateStatus(certificate: Pick<SshCertificate, 'validAfter' | 'validBefore'>, now = Date.now()): SshCertificateStatus {
  if (certificate.validAfter && now < certificate.validAfter.getTime()) return 'not-yet-valid';
  if (certificate.validBefore && now >= certificate.validBefore.getTime()) return 'expired';
  return 'valid';
}

/** OpenSSH-style `SHA256:<base64>` fingerprint of a wire-format public key. */
export async function sshFingerprint(blob: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(blob));
  return `SHA256:${encodeBase64(new Uint8Array(digest)).replace(/=+$/, '')}`;
}
