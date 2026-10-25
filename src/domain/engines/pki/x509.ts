import {
  Asn1Error,
  bitLength,
  childrenOf,
  decodeOid,
  decodeSmallInteger,
  decodeString,
  decodeTime,
  expectTag,
  hexBytes,
  isContext,
  readSingle,
  TAG,
  unsignedIntegerBytes,
  type Tlv,
} from './asn1';

/** Raised for input that is not a parseable PEM certificate or CRL. */
export class X509ParseError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'X509ParseError';
  }
}

export interface PemBlock {
  readonly label: string;
  /** The block exactly as it appeared, including BEGIN/END lines. */
  readonly text: string;
  readonly der: Uint8Array;
}

export interface NameAttribute {
  /** Short name such as `CN` or `O`, or the dotted OID when unknown. */
  readonly type: string;
  readonly value: string;
}

export interface DistinguishedName {
  readonly attributes: readonly NameAttribute[];
  /** Attributes in encoded order, e.g. `C=US, O=Example Co, CN=Example Root CA`. */
  readonly text: string;
  readonly commonName?: string;
}

export interface SubjectAltNames {
  readonly dns: readonly string[];
  readonly ip: readonly string[];
  readonly email: readonly string[];
  readonly uri: readonly string[];
}

export type KeyAlgorithm = 'RSA' | 'EC' | 'Ed25519' | 'Ed448' | 'unknown';

export interface X509Certificate {
  /** Lower-case colon hex, the same format Vault uses for serial numbers. */
  readonly serialNumber: string;
  readonly subject: DistinguishedName;
  readonly issuer: DistinguishedName;
  /** Epoch milliseconds. */
  readonly notBefore: number;
  readonly notAfter: number;
  readonly altNames: SubjectAltNames;
  readonly isCa: boolean;
  readonly pathLength?: number;
  readonly keyAlgorithm: KeyAlgorithm;
  /** Bits for RSA and EC keys; Ed25519 is reported as 256. */
  readonly keySize?: number;
  readonly curve?: string;
  readonly signatureAlgorithm: string;
  readonly extendedKeyUsage: readonly string[];
  readonly subjectKeyId?: string;
  readonly authorityKeyId?: string;
  readonly selfSigned: boolean;
}

export interface X509Crl {
  readonly issuer: DistinguishedName;
  readonly thisUpdate: number;
  readonly nextUpdate?: number;
  readonly revokedCount: number;
  readonly crlNumber?: string;
}

const NAME_TYPES: Readonly<Record<string, string>> = {
  '2.5.4.3': 'CN',
  '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.9': 'street',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.17': 'postalCode',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC',
  '0.9.2342.19200300.100.1.1': 'UID',
};

const CURVES: Readonly<Record<string, readonly [string, number]>> = {
  '1.2.840.10045.3.1.7': ['P-256', 256],
  '1.3.132.0.34': ['P-384', 384],
  '1.3.132.0.35': ['P-521', 521],
  '1.3.132.0.10': ['secp256k1', 256],
};

const SIGNATURES: Readonly<Record<string, string>> = {
  '1.2.840.113549.1.1.5': 'SHA1 with RSA',
  '1.2.840.113549.1.1.11': 'SHA256 with RSA',
  '1.2.840.113549.1.1.12': 'SHA384 with RSA',
  '1.2.840.113549.1.1.13': 'SHA512 with RSA',
  '1.2.840.113549.1.1.10': 'RSA-PSS',
  '1.2.840.10045.4.3.2': 'ECDSA with SHA256',
  '1.2.840.10045.4.3.3': 'ECDSA with SHA384',
  '1.2.840.10045.4.3.4': 'ECDSA with SHA512',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

const EXTENDED_KEY_USAGES: Readonly<Record<string, string>> = {
  '1.3.6.1.5.5.7.3.1': 'ServerAuth',
  '1.3.6.1.5.5.7.3.2': 'ClientAuth',
  '1.3.6.1.5.5.7.3.3': 'CodeSigning',
  '1.3.6.1.5.5.7.3.4': 'EmailProtection',
  '1.3.6.1.5.5.7.3.8': 'TimeStamping',
  '1.3.6.1.5.5.7.3.9': 'OcspSigning',
  '2.5.29.37.0': 'Any',
};

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;

function base64Bytes(body: string): Uint8Array {
  const compact = body.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new X509ParseError('The PEM block is not valid base64.');
  }
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Every PEM block in `text`, in order. Headers such as `Proc-Type` are not supported. */
export function pemBlocks(text: string): readonly PemBlock[] {
  return Array.from(text.matchAll(PEM_BLOCK), (match) => ({
    label: match[1],
    text: match[0],
    der: base64Bytes(match[2]),
  }));
}

/** The certificate blocks of a PEM bundle, skipping keys and other blocks. */
export function certificatePems(text: string): readonly string[] {
  return pemBlocks(text).filter((block) => block.label === 'CERTIFICATE').map((block) => `${block.text}\n`);
}

/** True when the text holds any private key block. */
export function containsPrivateKey(text: string): boolean {
  return /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(text);
}

function parseName(tlv: Tlv): DistinguishedName {
  expectTag(tlv, TAG.sequence, 'a name');
  const attributes = childrenOf(tlv).flatMap((set) => childrenOf(expectTag(set, TAG.set, 'a name set')).map((pair) => {
    const [oid, value] = childrenOf(expectTag(pair, TAG.sequence, 'a name attribute'));
    const dotted = decodeOid(expectTag(oid, TAG.oid, 'an attribute type').value);
    if (!value) throw new Asn1Error('Missing attribute value.');
    return { type: NAME_TYPES[dotted] ?? dotted, value: decodeString(value) };
  }));
  return {
    attributes,
    text: attributes.map(({ type, value }) => `${type}=${value}`).join(', '),
    commonName: [...attributes].reverse().find((attribute) => attribute.type === 'CN')?.value,
  };
}

function formatIpv6(bytes: Uint8Array): string {
  const groups = Array.from({ length: 8 }, (_, index) => ((bytes[index * 2] << 8) | bytes[index * 2 + 1]).toString(16));
  let bestStart = -1;
  let bestLength = 1;
  for (let start = 0; start < 8; start += 1) {
    let length = 0;
    while (start + length < 8 && groups[start + length] === '0') length += 1;
    if (length > bestLength) {
      bestStart = start;
      bestLength = length;
    }
  }
  if (bestStart < 0) return groups.join(':');
  return `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLength).join(':')}`;
}

function formatIp(bytes: Uint8Array): string {
  if (bytes.length === 4) return Array.from(bytes).join('.');
  if (bytes.length === 16) return formatIpv6(bytes);
  return hexBytes(bytes);
}

function latin1(value: Uint8Array): string {
  return String.fromCharCode(...value);
}

function parseAltNames(extension: Uint8Array): SubjectAltNames {
  const dns: string[] = [];
  const ip: string[] = [];
  const email: string[] = [];
  const uri: string[] = [];
  for (const name of childrenOf(expectTag(readSingle(extension), TAG.sequence, 'alternative names'))) {
    if (name.tagClass !== 'context') continue;
    if (name.tagNumber === 1) email.push(latin1(name.value));
    else if (name.tagNumber === 2) dns.push(latin1(name.value));
    else if (name.tagNumber === 6) uri.push(latin1(name.value));
    else if (name.tagNumber === 7) ip.push(formatIp(name.value));
  }
  return { dns, ip, email, uri };
}

function parseBasicConstraints(extension: Uint8Array): { readonly isCa: boolean; readonly pathLength?: number } {
  const items = childrenOf(expectTag(readSingle(extension), TAG.sequence, 'basic constraints'));
  let isCa = false;
  let pathLength: number | undefined;
  for (const item of items) {
    if (item.tag === TAG.boolean) isCa = item.value[0] !== 0;
    if (item.tag === TAG.integer) pathLength = decodeSmallInteger(item.value);
  }
  return { isCa, pathLength };
}

function parseKeyIdentifier(extension: Uint8Array, authority: boolean): string | undefined {
  const outer = readSingle(extension);
  if (!authority) return hexBytes(expectTag(outer, TAG.octetString, 'a key identifier').value);
  const keyId = childrenOf(expectTag(outer, TAG.sequence, 'an authority key identifier')).find((item) => isContext(item, 0));
  return keyId ? hexBytes(keyId.value) : undefined;
}

interface ExtensionValues {
  altNames: SubjectAltNames;
  isCa: boolean;
  pathLength?: number;
  extendedKeyUsage: readonly string[];
  subjectKeyId?: string;
  authorityKeyId?: string;
}

function applyExtension(values: ExtensionValues, oid: string, body: Uint8Array): void {
  switch (oid) {
    case '2.5.29.17':
      values.altNames = parseAltNames(body);
      break;
    case '2.5.29.19':
      Object.assign(values, parseBasicConstraints(body));
      break;
    case '2.5.29.37':
      values.extendedKeyUsage = childrenOf(expectTag(readSingle(body), TAG.sequence, 'extended key usage'))
        .map((item) => {
          const dotted = decodeOid(item.value);
          return EXTENDED_KEY_USAGES[dotted] ?? dotted;
        });
      break;
    case '2.5.29.14':
      values.subjectKeyId = parseKeyIdentifier(body, false);
      break;
    case '2.5.29.35':
      values.authorityKeyId = parseKeyIdentifier(body, true);
      break;
    default:
      break;
  }
}

function parseExtensions(tlv: Tlv | undefined): ExtensionValues {
  const values: ExtensionValues = {
    altNames: { dns: [], ip: [], email: [], uri: [] },
    isCa: false,
    extendedKeyUsage: [],
  };
  if (!tlv) return values;
  const [list] = childrenOf(tlv);
  for (const extension of childrenOf(expectTag(list, TAG.sequence, 'extensions'))) {
    const items = childrenOf(expectTag(extension, TAG.sequence, 'an extension'));
    const oid = decodeOid(expectTag(items[0], TAG.oid, 'an extension id').value);
    const body = expectTag(items[items.length - 1], TAG.octetString, 'an extension value').value;
    applyExtension(values, oid, body);
  }
  return values;
}

function parsePublicKey(spki: Tlv): Pick<X509Certificate, 'keyAlgorithm' | 'keySize' | 'curve'> {
  const [algorithm, key] = childrenOf(expectTag(spki, TAG.sequence, 'a public key'));
  const [oid, parameters] = childrenOf(expectTag(algorithm, TAG.sequence, 'a key algorithm'));
  const dotted = decodeOid(expectTag(oid, TAG.oid, 'a key algorithm id').value);
  if (dotted === '1.2.840.113549.1.1.1' || dotted === '1.2.840.113549.1.1.10') {
    const bits = expectTag(key, TAG.bitString, 'a key bit string').value.subarray(1);
    const [modulus] = childrenOf(expectTag(readSingle(bits), TAG.sequence, 'an RSA key'));
    return { keyAlgorithm: 'RSA', keySize: bitLength(expectTag(modulus, TAG.integer, 'an RSA modulus').value) };
  }
  if (dotted === '1.2.840.10045.2.1') {
    const curveOid = parameters?.tag === TAG.oid ? decodeOid(parameters.value) : undefined;
    const curve = curveOid ? CURVES[curveOid] : undefined;
    return { keyAlgorithm: 'EC', keySize: curve?.[1], curve: curve?.[0] ?? curveOid };
  }
  if (dotted === '1.3.101.112') return { keyAlgorithm: 'Ed25519', keySize: 256 };
  if (dotted === '1.3.101.113') return { keyAlgorithm: 'Ed448', keySize: 456 };
  return { keyAlgorithm: 'unknown' };
}

function algorithmName(tlv: Tlv): string {
  const [oid] = childrenOf(expectTag(tlv, TAG.sequence, 'an algorithm'));
  const dotted = decodeOid(expectTag(oid, TAG.oid, 'an algorithm id').value);
  return SIGNATURES[dotted] ?? dotted;
}

function withParseErrors<T>(parse: () => T, what: string): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof X509ParseError) throw error;
    throw new X509ParseError(`This is not a valid ${what}.`, { cause: error });
  }
}

/** Parses a DER-encoded X.509 certificate. */
export function parseCertificateDer(der: Uint8Array): X509Certificate {
  return withParseErrors(() => {
    const [tbs, signature] = childrenOf(expectTag(readSingle(der), TAG.sequence, 'a certificate'));
    const fields = childrenOf(expectTag(tbs, TAG.sequence, 'certificate fields'));
    let index = isContext(fields[0], 0) ? 1 : 0;
    const serial = expectTag(fields[index], TAG.integer, 'a serial number');
    index += 2; // serial, then the inner signature algorithm
    const issuer = parseName(fields[index]);
    const [notBefore, notAfter] = childrenOf(expectTag(fields[index + 1], TAG.sequence, 'a validity period'));
    const subject = parseName(fields[index + 2]);
    const key = parsePublicKey(fields[index + 3]);
    const extensions = parseExtensions(fields.slice(index + 4).find((field) => isContext(field, 3)));
    return {
      serialNumber: hexBytes(unsignedIntegerBytes(serial.value)),
      subject,
      issuer,
      notBefore: decodeTime(notBefore),
      notAfter: decodeTime(notAfter),
      ...extensions,
      ...key,
      signatureAlgorithm: algorithmName(signature),
      selfSigned: subject.text === issuer.text
        && (extensions.authorityKeyId === undefined || extensions.authorityKeyId === extensions.subjectKeyId),
    };
  }, 'certificate');
}

/** Parses the first CERTIFICATE block of a PEM string or bundle. */
export function parseCertificatePem(pem: string): X509Certificate {
  const block = pemBlocks(pem).find((candidate) => candidate.label === 'CERTIFICATE');
  if (!block) throw new X509ParseError('No PEM certificate was found.');
  return parseCertificateDer(block.der);
}

/** Like `parseCertificatePem`, but returns undefined instead of throwing. */
export function tryParseCertificate(pem: string | undefined): X509Certificate | undefined {
  if (!pem) return undefined;
  try {
    return parseCertificatePem(pem);
  } catch {
    return undefined;
  }
}

function crlNumber(extensions: Tlv | undefined): string | undefined {
  if (!extensions) return undefined;
  const [list] = childrenOf(extensions);
  for (const extension of childrenOf(expectTag(list, TAG.sequence, 'CRL extensions'))) {
    const items = childrenOf(extension);
    if (decodeOid(items[0].value) !== '2.5.29.20') continue;
    const value = readSingle(items[items.length - 1].value);
    return BigInt(`0x${hexBytes(unsignedIntegerBytes(value.value), '') || '0'}`).toString();
  }
  return undefined;
}

/** Parses a PEM `X509 CRL` block: issuer, update times, and the revoked entry count. */
export function parseCrlPem(pem: string): X509Crl {
  const block = pemBlocks(pem).find((candidate) => candidate.label === 'X509 CRL');
  if (!block) throw new X509ParseError('No PEM certificate revocation list was found.');
  return withParseErrors(() => {
    const [tbs] = childrenOf(expectTag(readSingle(block.der), TAG.sequence, 'a CRL'));
    const fields = childrenOf(expectTag(tbs, TAG.sequence, 'CRL fields'));
    let index = fields[0]?.tag === TAG.integer ? 1 : 0;
    index += 1; // signature algorithm
    const issuer = parseName(fields[index]);
    const thisUpdate = decodeTime(fields[index + 1]);
    const rest = fields.slice(index + 2);
    const next = rest[0]?.tag === TAG.utcTime || rest[0]?.tag === TAG.generalizedTime ? rest.shift() : undefined;
    const revoked = rest[0]?.tag === TAG.sequence ? rest.shift() : undefined;
    return {
      issuer,
      thisUpdate,
      nextUpdate: next ? decodeTime(next) : undefined,
      revokedCount: revoked ? childrenOf(revoked).length : 0,
      crlNumber: crlNumber(rest.find((field) => isContext(field, 0))),
    };
  }, 'certificate revocation list');
}
