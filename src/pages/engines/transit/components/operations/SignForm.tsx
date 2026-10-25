import { useState, type FormEvent } from 'react';

import { useTransitSign } from '@/application/engines/transit/useTransitCrypto';
import { ContextField, KeyVersionField, OperationError, PayloadField, ResultPanel, SecretOutput, SubmitRow } from '../fields';
import { derivedContext, pinnedVersion, usePayloadInput } from '../usePayloadInput';
import type { OperationFormProps } from './operation-props';
import SignatureOptionsFields from './SignatureOptionsFields';
import { useSignatureOptions } from './useSignatureOptions';

export default function SignForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitSign(mount, transitKey.name);
  const input = usePayloadInput();
  const context = usePayloadInput();
  const signature = useSignatureOptions(transitKey.type);
  const [version, setVersion] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const contextValue = derivedContext(transitKey.derived, context);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!input.encoded.ok || !contextValue.ok) return;
    mutation.mutate({ input: input.encoded.value, ...signature.options(contextValue.value), keyVersion: pinnedVersion(version) });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <PayloadField label="Message" payload={input} placeholder="Data to sign" showErrors={showErrors} />
      <SignatureOptionsFields state={signature} />
      {transitKey.derived && <ContextField payload={context} showErrors={showErrors} purpose="verify the signature" />}
      <KeyVersionField transitKey={transitKey} value={version} onChange={setVersion} />
      <OperationError error={mutation.error} action="sign with this key" />
      <SubmitRow label="Sign" icon="ri-quill-pen-line" pending={mutation.isPending} />
      {mutation.data && (
        <ResultPanel title="Signature" onClear={() => mutation.reset()} note="Verifying needs the same message and options.">
          <SecretOutput
            label="Signature"
            value={mutation.data.signature}
            meta={mutation.data.keyVersion ? `key version ${mutation.data.keyVersion}` : undefined}
          />
        </ResultPanel>
      )}
    </form>
  );
}
