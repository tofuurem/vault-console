import { useState, type FormEvent } from 'react';

import { useTransitEncrypt } from '@/application/engines/transit/useTransitCrypto';
import { ContextField, KeyVersionField, OperationError, PayloadField, ResultPanel, SecretOutput, SubmitRow } from '../fields';
import { derivedContext, pinnedVersion, usePayloadInput } from '../usePayloadInput';
import type { OperationFormProps } from './operation-props';

export default function EncryptForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitEncrypt(mount, transitKey.name);
  const plaintext = usePayloadInput();
  const context = usePayloadInput();
  const [version, setVersion] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const contextValue = derivedContext(transitKey.derived, context);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!plaintext.encoded.ok || !contextValue.ok) return;
    mutation.mutate({ plaintext: plaintext.encoded.value, context: contextValue.value, keyVersion: pinnedVersion(version) });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <PayloadField
        label="Plaintext"
        payload={plaintext}
        placeholder="Text to encrypt"
        showErrors={showErrors}
        hint="Text is sent as UTF-8 base64."
      />
      {transitKey.derived && <ContextField payload={context} showErrors={showErrors} purpose="decrypt it later" />}
      <KeyVersionField transitKey={transitKey} value={version} onChange={setVersion} />
      <OperationError error={mutation.error} action="encrypt with this key" />
      <SubmitRow label="Encrypt" icon="ri-lock-line" pending={mutation.isPending} />
      {mutation.data && (
        <ResultPanel
          title="Ciphertext"
          onClear={() => mutation.reset()}
          note="Store the full value including the vault:v prefix. Decrypting needs this key and, for derived keys, the same context."
        >
          <SecretOutput
            label="Ciphertext"
            value={mutation.data.ciphertext}
            meta={mutation.data.keyVersion ? `key version ${mutation.data.keyVersion}` : undefined}
          />
        </ResultPanel>
      )}
    </form>
  );
}
