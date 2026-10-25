import {
  ECDSA_MARSHALING_ALGORITHMS,
  HASH_ALGORITHMS,
  RSA_SIGNATURE_ALGORITHMS,
} from '@/domain/engines/transit/transit-key-types';
import { CheckboxField, SelectField } from '../fields';
import type { SignatureOptionsState } from './useSignatureOptions';

const SIGNATURE_LABELS: Readonly<Record<string, string>> = { pss: 'PSS', pkcs1v15: 'PKCS#1 v1.5' };
const MARSHALING_LABELS: Readonly<Record<string, string>> = { asn1: 'ASN.1 (default)', jws: 'JWS' };

/** Must match between signing and verifying, so both forms share these fields. */
export default function SignatureOptionsFields({ state }: { readonly state: SignatureOptionsState }) {
  const { applicable } = state;
  if (!applicable.hashAlgorithm && !applicable.signatureAlgorithm && !applicable.marshalingAlgorithm) return null;
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        {applicable.hashAlgorithm && (
          <SelectField
            label="Hash algorithm"
            value={state.hashAlgorithm}
            onChange={state.setHashAlgorithm}
            options={HASH_ALGORITHMS.map((algorithm) => [algorithm, algorithm] as const)}
          />
        )}
        {applicable.signatureAlgorithm && (
          <SelectField
            label="Signature algorithm"
            value={state.signatureAlgorithm}
            onChange={state.setSignatureAlgorithm}
            options={RSA_SIGNATURE_ALGORITHMS.map((algorithm) => [algorithm, SIGNATURE_LABELS[algorithm]] as const)}
          />
        )}
        {applicable.marshalingAlgorithm && (
          <SelectField
            label="Signature format"
            value={state.marshalingAlgorithm}
            onChange={state.setMarshalingAlgorithm}
            options={ECDSA_MARSHALING_ALGORITHMS.map((algorithm) => [algorithm, MARSHALING_LABELS[algorithm]] as const)}
          />
        )}
      </div>
      {applicable.prehashed && (
        <CheckboxField
          label="Input is already hashed"
          description="Send a digest made with the hash algorithm above instead of the full message."
          checked={state.prehashed}
          onChange={state.setPrehashed}
        />
      )}
    </div>
  );
}
