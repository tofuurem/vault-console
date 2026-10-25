/**
 * A minimal DER reader: enough of ASN.1 to walk X.509 certificates and CRLs.
 * It never allocates beyond views over the input and rejects anything that
 * is not strict DER (indefinite lengths, lengths past the buffer).
 */

export class Asn1Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Asn1Error';
  }
}

export const TAG = {
  boolean: 0x01,
  integer: 0x02,
  bitString: 0x03,
  octetString: 0x04,
  null: 0x05,
  oid: 0x06,
  utf8String: 0x0c,
  sequence: 0x30,
  set: 0x31,
  printableString: 0x13,
  t61String: 0x14,
  ia5String: 0x16,
  utcTime: 0x17,
  generalizedTime: 0x18,
  universalString: 0x1c,
  bmpString: 0x1e,
} as const;

export interface Tlv {
  /** The identifier octet (class, constructed bit, and low tag number). */
  readonly tag: number;
  readonly tagClass: 'universal' | 'application' | 'context' | 'private';
  readonly constructed: boolean;
  readonly tagNumber: number;
  readonly value: Uint8Array;
  /** Offset just past this element in the buffer it was read from. */
  readonly end: number;
}

const CLASSES = ['universal', 'application', 'context', 'private'] as const;

function readLength(bytes: Uint8Array, offset: number): { readonly length: number; readonly next: number } {
  if (offset >= bytes.length) throw new Asn1Error('Truncated length.');
  const first = bytes[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  const count = first & 0x7f;
  if (count === 0) throw new Asn1Error('Indefinite lengths are not DER.');
  if (count > 4) throw new Asn1Error('Length is too large.');
  if (offset + 1 + count > bytes.length) throw new Asn1Error('Truncated length.');
  let length = 0;
  for (let index = 0; index < count; index += 1) length = length * 256 + bytes[offset + 1 + index];
  return { length, next: offset + 1 + count };
}

/** Reads one TLV element starting at `offset`. */
export function readTlv(bytes: Uint8Array, offset = 0): Tlv {
  if (offset >= bytes.length) throw new Asn1Error('Unexpected end of data.');
  const tag = bytes[offset];
  let tagNumber = tag & 0x1f;
  let cursor = offset + 1;
  if (tagNumber === 0x1f) {
    tagNumber = 0;
    let octet: number;
    do {
      if (cursor >= bytes.length) throw new Asn1Error('Truncated tag.');
      octet = bytes[cursor];
      tagNumber = tagNumber * 128 + (octet & 0x7f);
      cursor += 1;
    } while (octet & 0x80);
  }
  const { length, next } = readLength(bytes, cursor);
  const end = next + length;
  if (end > bytes.length) throw new Asn1Error('Element runs past the end of data.');
  return {
    tag,
    tagClass: CLASSES[tag >> 6],
    constructed: (tag & 0x20) !== 0,
    tagNumber,
    value: bytes.subarray(next, end),
    end,
  };
}

/** Parses a buffer that must hold exactly one element. */
export function readSingle(bytes: Uint8Array): Tlv {
  const tlv = readTlv(bytes, 0);
  if (tlv.end !== bytes.length) throw new Asn1Error('Trailing data after element.');
  return tlv;
}

/** The elements inside a constructed value. */
export function childrenOf(tlv: Tlv): readonly Tlv[] {
  if (!tlv.constructed) throw new Asn1Error('Expected a constructed element.');
  const items: Tlv[] = [];
  let offset = 0;
  while (offset < tlv.value.length) {
    const child = readTlv(tlv.value, offset);
    items.push(child);
    offset = child.end;
  }
  return items;
}

export function expectTag(tlv: Tlv | undefined, tag: number, what: string): Tlv {
  if (!tlv || tlv.tag !== tag) throw new Asn1Error(`Expected ${what}.`);
  return tlv;
}

export function isContext(tlv: Tlv | undefined, tagNumber: number): tlv is Tlv {
  return tlv !== undefined && tlv.tagClass === 'context' && tlv.tagNumber === tagNumber;
}

export function decodeOid(value: Uint8Array): string {
  if (value.length === 0) throw new Asn1Error('Empty object identifier.');
  const parts: number[] = [];
  let current = 0;
  for (const octet of value) {
    current = current * 128 + (octet & 0x7f);
    if ((octet & 0x80) === 0) {
      parts.push(current);
      current = 0;
    }
  }
  const [first, ...rest] = parts;
  const head = first < 80 ? [Math.floor(first / 40), first % 40] : [2, first - 80];
  return [...head, ...rest].join('.');
}

export function hexBytes(value: Uint8Array, separator = ':'): string {
  return Array.from(value, (octet) => octet.toString(16).padStart(2, '0')).join(separator);
}

/** Unsigned big-endian integer bytes without DER's sign-padding zeros. */
export function unsignedIntegerBytes(value: Uint8Array): Uint8Array {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start += 1;
  return value.subarray(start);
}

/** Number of significant bits in an unsigned big-endian integer. */
export function bitLength(value: Uint8Array): number {
  const bytes = unsignedIntegerBytes(value);
  if (bytes.length === 0 || (bytes.length === 1 && bytes[0] === 0)) return 0;
  return (bytes.length - 1) * 8 + (32 - Math.clz32(bytes[0]));
}

export function decodeSmallInteger(value: Uint8Array): number {
  if (value.length === 0 || value.length > 6) throw new Asn1Error('Integer out of range.');
  let result = 0;
  for (const octet of value) result = result * 256 + octet;
  return result;
}

function decodeUtf16Be(value: Uint8Array): string {
  let result = '';
  for (let index = 0; index + 1 < value.length; index += 2) {
    result += String.fromCharCode((value[index] << 8) | value[index + 1]);
  }
  return result;
}

function decodeUtf32Be(value: Uint8Array): string {
  let result = '';
  for (let index = 0; index + 3 < value.length; index += 4) {
    const code = ((value[index] << 24) | (value[index + 1] << 16) | (value[index + 2] << 8) | value[index + 3]) >>> 0;
    result += String.fromCodePoint(code);
  }
  return result;
}

/** Decodes any of the ASN.1 string types used in names. */
export function decodeString(tlv: Tlv): string {
  switch (tlv.tag) {
    case TAG.utf8String:
      return new TextDecoder('utf-8').decode(tlv.value);
    case TAG.bmpString:
      return decodeUtf16Be(tlv.value);
    case TAG.universalString:
      return decodeUtf32Be(tlv.value);
    default:
      // PrintableString, IA5String, T61String, VisibleString: treat as Latin-1.
      return String.fromCharCode(...tlv.value);
  }
}

function digits(text: string, start: number, count: number): number {
  const slice = text.slice(start, start + count);
  if (!/^\d+$/.test(slice) || slice.length !== count) throw new Asn1Error('Malformed time.');
  return Number(slice);
}

/** UTCTime or GeneralizedTime as epoch milliseconds (UTC). */
export function decodeTime(tlv: Tlv): number {
  const text = String.fromCharCode(...tlv.value);
  let year: number;
  let rest: number;
  if (tlv.tag === TAG.utcTime) {
    const short = digits(text, 0, 2);
    year = short >= 50 ? 1900 + short : 2000 + short;
    rest = 2;
  } else if (tlv.tag === TAG.generalizedTime) {
    year = digits(text, 0, 4);
    rest = 4;
  } else {
    throw new Asn1Error('Expected a time value.');
  }
  const month = digits(text, rest, 2);
  const day = digits(text, rest + 2, 2);
  const hour = digits(text, rest + 4, 2);
  const minute = digits(text, rest + 6, 2);
  const hasSeconds = /^\d{2}/.test(text.slice(rest + 8));
  const second = hasSeconds ? digits(text, rest + 8, 2) : 0;
  const fraction = text.slice(rest + (hasSeconds ? 10 : 8)).match(/^\.(\d+)/);
  const milliseconds = fraction ? Math.round(Number(`0.${fraction[1]}`) * 1000) : 0;
  if (!text.endsWith('Z')) throw new Asn1Error('Only UTC times are supported.');
  return Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
}
