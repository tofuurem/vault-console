import { useState, type FormEvent } from 'react';

import { useTransitHmac } from '@/application/engines/transit/useTransitCrypto';
import { DEFAULT_HASH_ALGORITHM, HASH_ALGORITHMS } from '@/domain/engines/transit/transit-key-types';
import { KeyVersionField, OperationError, PayloadField, ResultPanel, SecretOutput, SelectField, SubmitRow } from '../fields';
import { pinnedVersion, usePayloadInput } from '../usePayloadInput';
import type { OperationFormProps } from './operation-props';

export default function HmacForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitHmac(mount, transitKey.name);
  const input = usePayloadInput();
  const [algorithm, setAlgorithm] = useState(DEFAULT_HASH_ALGORITHM);
  const [version, setVersion] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!input.encoded.ok) return;
    mutation.mutate({ input: input.encoded.value, algorithm, keyVersion: pinnedVersion(version) });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <PayloadField label="Message" payload={input} placeholder="Data to authenticate" showErrors={showErrors} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Hash algorithm"
          value={algorithm}
          onChange={setAlgorithm}
          options={HASH_ALGORITHMS.map((name) => [name, name] as const)}
        />
        <KeyVersionField transitKey={transitKey} value={version} onChange={setVersion} />
      </div>
      <OperationError error={mutation.error} action="compute an HMAC with this key" />
      <SubmitRow label="Compute HMAC" icon="ri-fingerprint-line" pending={mutation.isPending} />
      {mutation.data && (
        <ResultPanel title="HMAC" onClear={() => mutation.reset()} note={`Verify with the same message and ${algorithm}.`}>
          <SecretOutput label="HMAC" value={mutation.data} />
        </ResultPanel>
      )}
    </form>
  );
}
