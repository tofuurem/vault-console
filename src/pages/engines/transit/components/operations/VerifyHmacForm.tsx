import { useState, type FormEvent } from 'react';

import { useTransitVerifyHmac } from '@/application/engines/transit/useTransitCrypto';
import { Textarea } from '@/components/base/Input';
import { DEFAULT_HASH_ALGORITHM, HASH_ALGORITHMS } from '@/domain/engines/transit/transit-key-types';
import { OperationError, PayloadField, ResultPanel, SelectField, SubmitRow, VerificationResult } from '../fields';
import { usePayloadInput } from '../usePayloadInput';
import type { OperationFormProps } from './operation-props';

export default function VerifyHmacForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitVerifyHmac(mount, transitKey.name);
  const input = usePayloadInput();
  const [hmac, setHmac] = useState('');
  const [algorithm, setAlgorithm] = useState(DEFAULT_HASH_ALGORITHM);
  const [showErrors, setShowErrors] = useState(false);
  const hmacError = showErrors && !hmac.trim() ? 'Paste the HMAC to check.' : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!input.encoded.ok || !hmac.trim()) return;
    mutation.mutate({ input: input.encoded.value, hmac: hmac.trim(), algorithm });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <PayloadField label="Message" payload={input} placeholder="Data that was authenticated" showErrors={showErrors} />
      <Textarea
        label="HMAC"
        value={hmac}
        onChange={(event) => setHmac(event.target.value)}
        rows={2}
        placeholder="vault:v1:…"
        spellCheck={false}
        autoComplete="off"
        error={hmacError}
        monospace
        className="text-xs"
      />
      <SelectField
        label="Hash algorithm"
        value={algorithm}
        onChange={setAlgorithm}
        options={HASH_ALGORITHMS.map((name) => [name, name] as const)}
      />
      <OperationError error={mutation.error} action="verify an HMAC with this key" />
      <SubmitRow label="Verify HMAC" icon="ri-checkbox-circle-line" pending={mutation.isPending} />
      {mutation.data !== undefined && (
        <ResultPanel title="Verification result" onClear={() => mutation.reset()}>
          <VerificationResult valid={mutation.data} subject="HMAC" />
        </ResultPanel>
      )}
    </form>
  );
}
