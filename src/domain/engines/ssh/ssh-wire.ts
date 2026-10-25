const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Decodes standard base64; `undefined` when the text is not canonical base64. */
export function decodeBase64(value: string): Uint8Array | undefined {
  if (!value || !BASE64.test(value)) return undefined;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export class SshWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SshWireError';
  }
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** Sequential reader for the SSH wire encoding (RFC 4251 section 5). */
export class SshWireReader {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.#bytes.length - this.#offset;
  }

  #need(length: number): void {
    if (length < 0 || this.remaining < length) throw new SshWireError('The data ended before a field was complete.');
  }

  uint32(): number {
    this.#need(4);
    const value = this.#view.getUint32(this.#offset);
    this.#offset += 4;
    return value;
  }

  uint64(): bigint {
    this.#need(8);
    const value = this.#view.getBigUint64(this.#offset);
    this.#offset += 8;
    return value;
  }

  bytes(): Uint8Array {
    const length = this.uint32();
    this.#need(length);
    const value = this.#bytes.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }

  string(): string {
    try {
      return UTF8.decode(this.bytes());
    } catch (error) {
      if (error instanceof SshWireError) throw error;
      throw new SshWireError('A text field is not valid UTF-8.');
    }
  }
}
