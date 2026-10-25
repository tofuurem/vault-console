import { useEffect, useState } from 'react';

import { sshFingerprint } from '@/domain/engines/ssh/ssh-certificate';

/** SHA256 fingerprint of a wire-format key; undefined until computed or when unavailable. */
export function useFingerprint(blob: Uint8Array | undefined): string | undefined {
  const [result, setResult] = useState<{ readonly blob: Uint8Array; readonly value: string }>();
  useEffect(() => {
    if (!blob) return undefined;
    let active = true;
    sshFingerprint(blob).then(
      (value) => {
        if (active) setResult({ blob, value });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [blob]);
  return result && result.blob === blob ? result.value : undefined;
}
