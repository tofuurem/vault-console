import { useState } from 'react';

import { decodeBase64Text } from '@/domain/engines/transit/transit-encoding';
import { CheckboxField, SecretOutput } from '../fields';

interface DecryptedOutputProps {
  /** Base64 plaintext exactly as Vault returned it. */
  readonly base64: string;
  readonly label?: string;
}

/** Shows decoded text when the bytes are readable, with the raw base64 one toggle away. */
export default function DecryptedOutput({ base64, label = 'Plaintext' }: DecryptedOutputProps) {
  const [raw, setRaw] = useState(false);
  const decoded = decodeBase64Text(base64);
  if (decoded.kind === 'binary') {
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-4 text-foreground-600">
          The plaintext is binary data ({decoded.byteLength.toLocaleString('en-US')} bytes), so it is shown as base64.
        </p>
        <SecretOutput label={`${label} (base64)`} value={base64} masked />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <SecretOutput key={String(raw)} label={raw ? `${label} (base64)` : label} value={raw ? base64 : decoded.text} masked />
      <CheckboxField label="Show raw base64" checked={raw} onChange={setRaw} />
    </div>
  );
}
