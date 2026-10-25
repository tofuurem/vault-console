import { useState, type FormEvent } from 'react';

import { useTransitDataKey } from '@/application/engines/transit/useTransitCrypto';
import type { DataKeyKind } from '@/domain/engines/transit/transit';
import { DATA_KEY_BITS } from '@/domain/engines/transit/transit-key-types';
import { ContextField, OperationError, ResultPanel, SecretOutput, SelectField, SubmitRow } from '../fields';
import { derivedContext, usePayloadInput } from '../usePayloadInput';
import type { OperationFormProps } from './operation-props';

export default function DataKeyForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitDataKey(mount, transitKey.name);
  const [kind, setKind] = useState<DataKeyKind>('wrapped');
  const [bits, setBits] = useState('256');
  const context = usePayloadInput();
  const [showErrors, setShowErrors] = useState(false);
  const contextValue = derivedContext(transitKey.derived, context);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!contextValue.ok) return;
    mutation.mutate({ kind, bits: Number(bits), context: contextValue.value });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <p className="text-[11px] leading-4 text-foreground-500">
        Generates a new random key for encrypting data outside Vault, returned encrypted with this transit key.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Return"
          value={kind}
          onChange={(value) => {
            setKind(value as DataKeyKind);
            mutation.reset();
          }}
          options={[['wrapped', 'Ciphertext only'], ['plaintext', 'Ciphertext and plaintext']]}
        />
        <SelectField
          label="Key length"
          value={bits}
          onChange={setBits}
          options={DATA_KEY_BITS.map((value) => [String(value), `${value} bits`] as const)}
        />
      </div>
      {transitKey.derived && <ContextField payload={context} showErrors={showErrors} purpose="decrypt the data key" />}
      <OperationError error={mutation.error} action="generate a data key with this key" />
      <SubmitRow label="Generate data key" icon="ri-key-2-line" pending={mutation.isPending} />
      {mutation.data && (
        <ResultPanel
          title="Data key"
          onClear={() => mutation.reset()}
          note={mutation.data.plaintext
            ? 'Store only the ciphertext. Use the plaintext key in memory, then discard it; decrypt the ciphertext with this key when you need it again.'
            : 'Decrypt the ciphertext with this key when you need the data key.'}
        >
          <SecretOutput label="Ciphertext" value={mutation.data.ciphertext} meta={mutation.data.keyVersion ? `key version ${mutation.data.keyVersion}` : undefined} />
          {mutation.data.plaintext && <SecretOutput label="Plaintext key (base64)" value={mutation.data.plaintext} masked />}
        </ResultPanel>
      )}
    </form>
  );
}
