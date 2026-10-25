import { useState, type FormEvent } from 'react';

import { useTransitVerify } from '@/application/engines/transit/useTransitCrypto';
import { Textarea } from '@/components/base/Input';
import { ContextField, OperationError, PayloadField, ResultPanel, SubmitRow, VerificationResult } from '../fields';
import { derivedContext, usePayloadInput } from '../usePayloadInput';
import type { OperationFormProps } from './operation-props';
import SignatureOptionsFields from './SignatureOptionsFields';
import { useSignatureOptions } from './useSignatureOptions';

export default function VerifyForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitVerify(mount, transitKey.name);
  const input = usePayloadInput();
  const context = usePayloadInput();
  const signature = useSignatureOptions(transitKey.type);
  const [value, setValue] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const contextValue = derivedContext(transitKey.derived, context);
  const signatureError = showErrors && !value.trim() ? 'Paste the signature to check.' : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!input.encoded.ok || !value.trim() || !contextValue.ok) return;
    mutation.mutate({ input: input.encoded.value, signature: value.trim(), ...signature.options(contextValue.value) });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <PayloadField label="Message" payload={input} placeholder="Data that was signed" showErrors={showErrors} />
      <Textarea
        label="Signature"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="vault:v1:…"
        spellCheck={false}
        autoComplete="off"
        error={signatureError}
        monospace
        className="text-xs"
      />
      <SignatureOptionsFields state={signature} />
      {transitKey.derived && <ContextField payload={context} showErrors={showErrors} purpose="verify" />}
      <OperationError error={mutation.error} action="verify signatures with this key" />
      <SubmitRow label="Verify signature" icon="ri-shield-check-line" pending={mutation.isPending} />
      {mutation.data !== undefined && (
        <ResultPanel title="Verification result" onClear={() => mutation.reset()}>
          <VerificationResult valid={mutation.data} subject="signature" />
        </ResultPanel>
      )}
    </form>
  );
}
