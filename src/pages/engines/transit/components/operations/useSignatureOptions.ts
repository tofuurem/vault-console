import { useState } from 'react';

import type { SignatureOptions } from '@/domain/engines/transit/transit';
import { DEFAULT_HASH_ALGORITHM, signingOptions } from '@/domain/engines/transit/transit-key-types';

/** Signing parameters, limited to the ones the key's algorithm uses. */
export function useSignatureOptions(keyType: string) {
  const applicable = signingOptions(keyType);
  const [hashAlgorithm, setHashAlgorithm] = useState(DEFAULT_HASH_ALGORITHM);
  const [prehashed, setPrehashed] = useState(false);
  const [signatureAlgorithm, setSignatureAlgorithm] = useState('pss');
  const [marshalingAlgorithm, setMarshalingAlgorithm] = useState('asn1');
  const options = (context?: string): SignatureOptions => ({
    hashAlgorithm: applicable.hashAlgorithm ? hashAlgorithm : undefined,
    prehashed: applicable.prehashed ? prehashed : undefined,
    signatureAlgorithm: applicable.signatureAlgorithm ? signatureAlgorithm : undefined,
    marshalingAlgorithm: applicable.marshalingAlgorithm ? marshalingAlgorithm : undefined,
    context,
  });
  return {
    applicable,
    hashAlgorithm,
    setHashAlgorithm,
    prehashed,
    setPrehashed,
    signatureAlgorithm,
    setSignatureAlgorithm,
    marshalingAlgorithm,
    setMarshalingAlgorithm,
    options,
  } as const;
}

export type SignatureOptionsState = ReturnType<typeof useSignatureOptions>;
