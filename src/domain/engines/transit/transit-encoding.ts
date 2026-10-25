const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Standard, padded base64 as Vault produces and accepts it. Whitespace is ignored. */
export function isBase64(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  return compact.length > 0 && BASE64.test(compact);
}

/** Encodes text as UTF-8 and then base64, the form transit expects for plaintext and input. */
export function encodeTextBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/** Base64 without whitespace, for values pasted across several lines. */
export function compactBase64(value: string): string {
  return value.replace(/\s+/g, '');
}

export type DecodedPayload =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'binary'; readonly byteLength: number };

/** Decodes base64 and reports whether the bytes are readable UTF-8 text. */
export function decodeBase64Text(value: string): DecodedPayload {
  const binary = atob(compactBase64(value));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Control bytes other than tabs and line breaks mean this is not meant to be read as text.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
      return { kind: 'binary', byteLength: bytes.length };
    }
    return { kind: 'text', text };
  } catch {
    return { kind: 'binary', byteLength: bytes.length };
  }
}

/** Turns operator input into the base64 Vault expects, or reports why it cannot. */
export function payloadBase64(value: string, alreadyBase64: boolean): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly message: string } {
  if (!alreadyBase64) return { ok: true, value: encodeTextBase64(value) };
  if (!isBase64(value)) return { ok: false, message: 'This is not valid base64. Turn off "Input is already base64" to send it as text.' };
  return { ok: true, value: compactBase64(value) };
}
