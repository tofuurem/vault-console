import { useState } from 'react';

import { payloadBase64 } from '@/domain/engines/transit/transit-encoding';

/** Text typed by the operator plus whether it is already base64; `encoded` is what Vault receives. */
export function usePayloadInput(initialBase64 = false) {
  const [text, setText] = useState('');
  const [base64, setBase64] = useState(initialBase64);
  return { text, setText, base64, setBase64, encoded: payloadBase64(text, base64) } as const;
}

export type PayloadInputState = ReturnType<typeof usePayloadInput>;

/** A derived key's context: required and valid, or not used at all. */
export function derivedContext(required: boolean, context: PayloadInputState): { readonly ok: boolean; readonly value?: string } {
  if (!required) return { ok: true };
  if (!context.text.trim() || !context.encoded.ok) return { ok: false };
  return { ok: true, value: context.encoded.value };
}

/** `''` means "latest"; anything else is a pinned version number. */
export function pinnedVersion(value: string): number | undefined {
  return value ? Number(value) : undefined;
}
