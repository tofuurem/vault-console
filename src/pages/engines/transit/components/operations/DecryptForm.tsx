import { useState, type FormEvent } from 'react';

import { useTransitDecrypt } from '@/application/engines/transit/useTransitCrypto';
import { Textarea } from '@/components/base/Input';
import { ContextField, OperationError, ResultPanel, SubmitRow } from '../fields';
import { derivedContext, usePayloadInput } from '../usePayloadInput';
import DecryptedOutput from './DecryptedOutput';
import type { OperationFormProps } from './operation-props';

export default function DecryptForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitDecrypt(mount, transitKey.name);
  const [ciphertext, setCiphertext] = useState('');
  const context = usePayloadInput();
  const [showErrors, setShowErrors] = useState(false);
  const contextValue = derivedContext(transitKey.derived, context);
  const ciphertextError = showErrors && !ciphertext.trim() ? 'Paste the ciphertext to decrypt.' : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!ciphertext.trim() || !contextValue.ok) return;
    mutation.mutate({ ciphertext: ciphertext.trim(), context: contextValue.value });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <Textarea
        label="Ciphertext"
        value={ciphertext}
        onChange={(event) => setCiphertext(event.target.value)}
        rows={3}
        placeholder="vault:v1:…"
        spellCheck={false}
        autoComplete="off"
        error={ciphertextError}
        monospace
        className="text-xs"
      />
      {transitKey.derived && <ContextField payload={context} showErrors={showErrors} purpose="decrypt" />}
      <OperationError error={mutation.error} action="decrypt with this key" />
      <SubmitRow label="Decrypt" icon="ri-lock-unlock-line" pending={mutation.isPending} />
      {mutation.data !== undefined && (
        <ResultPanel title="Decrypted plaintext" onClear={() => mutation.reset()} note="The plaintext stays on this page only until you clear it or leave.">
          <DecryptedOutput base64={mutation.data} />
        </ResultPanel>
      )}
    </form>
  );
}
