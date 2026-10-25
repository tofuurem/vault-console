import { useState, type FormEvent } from 'react';

import { useTransitRewrap } from '@/application/engines/transit/useTransitCrypto';
import { Textarea } from '@/components/base/Input';
import { ContextField, KeyVersionField, OperationError, ResultPanel, SecretOutput, SubmitRow } from '../fields';
import { derivedContext, pinnedVersion, usePayloadInput } from '../usePayloadInput';
import type { OperationFormProps } from './operation-props';

export default function RewrapForm({ mount, transitKey }: OperationFormProps) {
  const mutation = useTransitRewrap(mount, transitKey.name);
  const [ciphertext, setCiphertext] = useState('');
  const context = usePayloadInput();
  const [version, setVersion] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const contextValue = derivedContext(transitKey.derived, context);
  const ciphertextError = showErrors && !ciphertext.trim() ? 'Paste the ciphertext to rewrap.' : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!ciphertext.trim() || !contextValue.ok) return;
    mutation.mutate({ ciphertext: ciphertext.trim(), context: contextValue.value, keyVersion: pinnedVersion(version) });
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <p className="text-[11px] leading-4 text-foreground-500">
        Re-encrypts existing ciphertext with a newer key version without revealing the plaintext.
      </p>
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
      {transitKey.derived && <ContextField payload={context} showErrors={showErrors} purpose="rewrap" />}
      <KeyVersionField transitKey={transitKey} value={version} onChange={setVersion} label="Rewrap to version" />
      <OperationError error={mutation.error} action="rewrap with this key" />
      <SubmitRow label="Rewrap" icon="ri-refresh-line" pending={mutation.isPending} />
      {mutation.data && (
        <ResultPanel title="Rewrapped ciphertext" onClear={() => mutation.reset()}>
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
