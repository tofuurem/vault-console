import { useState, type FormEvent, type ReactNode } from 'react';

import { useTransitHash, useTransitRandomBytes } from '@/application/engines/transit/useTransitCrypto';
import { Input } from '@/components/base/Input';
import type { ByteFormat, RandomSource } from '@/domain/engines/transit/transit';
import { DEFAULT_HASH_ALGORITHM, HASH_ALGORITHMS } from '@/domain/engines/transit/transit-key-types';
import { randomBytesError } from '@/domain/engines/transit/transit-validation';
import { OperationError, PayloadField, ResultPanel, SecretOutput, SelectField, SubmitRow } from './fields';
import { usePayloadInput } from './usePayloadInput';

const FORMATS: readonly (readonly [ByteFormat, string])[] = [['base64', 'Base64'], ['hex', 'Hex']];
const SOURCES: readonly (readonly [RandomSource, string])[] = [
  ['platform', 'Vault host (default)'],
  ['seal', 'Seal device'],
  ['all', 'Both, mixed'],
];

function ToolCard({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-background-300 bg-background-50 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-foreground-900">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs leading-5 text-foreground-600">{description}</p>
      {children}
    </section>
  );
}

function RandomBytesTool({ mount }: { readonly mount: string }) {
  const mutation = useTransitRandomBytes(mount);
  const [bytes, setBytes] = useState('32');
  const [format, setFormat] = useState<ByteFormat>('base64');
  const [source, setSource] = useState<RandomSource>('platform');
  const error = randomBytesError(bytes);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (error) return;
    mutation.mutate({ bytes: Number(bytes), format, source });
  };
  return (
    <ToolCard title="Random bytes" description="High-quality random data from Vault, for example for passwords, salts, or keys.">
      <form className="space-y-3" onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Bytes" value={bytes} onChange={(event) => setBytes(event.target.value)} error={error} inputMode="numeric" className="tabular-nums" />
          <SelectField label="Format" value={format} onChange={(value) => setFormat(value as ByteFormat)} options={FORMATS} />
          <SelectField label="Source" value={source} onChange={(value) => setSource(value as RandomSource)} options={SOURCES} />
        </div>
        <OperationError error={mutation.error} action="generate random bytes on this mount" />
        <SubmitRow label="Generate" icon="ri-dice-line" pending={mutation.isPending} />
        {mutation.data && (
          <ResultPanel title="Random bytes" onClear={() => mutation.reset()}>
            <SecretOutput key={mutation.data} label="Random bytes" value={mutation.data} masked meta={mutation.variables ? `${mutation.variables.bytes} bytes, ${mutation.variables.format}` : undefined} />
          </ResultPanel>
        )}
      </form>
    </ToolCard>
  );
}

function HashTool({ mount }: { readonly mount: string }) {
  const mutation = useTransitHash(mount);
  const input = usePayloadInput();
  const [algorithm, setAlgorithm] = useState(DEFAULT_HASH_ALGORITHM);
  const [format, setFormat] = useState<ByteFormat>('hex');
  const [showErrors, setShowErrors] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!input.encoded.ok) return;
    mutation.mutate({ input: input.encoded.value, algorithm, format });
  };
  return (
    <ToolCard title="Hash" description="Compute a digest with Vault. No key is involved, so anyone with the digest can recompute it.">
      <form className="space-y-3" onSubmit={submit} noValidate>
        <PayloadField label="Input" payload={input} placeholder="Data to hash" showErrors={showErrors} rows={3} />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Algorithm" value={algorithm} onChange={setAlgorithm} options={HASH_ALGORITHMS.map((name) => [name, name] as const)} />
          <SelectField label="Format" value={format} onChange={(value) => setFormat(value as ByteFormat)} options={FORMATS} />
        </div>
        <OperationError error={mutation.error} action="hash data on this mount" />
        <SubmitRow label="Hash" icon="ri-hashtag" pending={mutation.isPending} />
        {mutation.data && (
          <ResultPanel title="Digest" onClear={() => mutation.reset()}>
            <SecretOutput label="Digest" value={mutation.data} meta={mutation.variables ? `${mutation.variables.algorithm}, ${mutation.variables.format}` : undefined} />
          </ResultPanel>
        )}
      </form>
    </ToolCard>
  );
}

/** Mount-level utilities that do not use a named key. */
export default function TransitTools({ mount }: { readonly mount: string }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <RandomBytesTool mount={mount} />
      <HashTool mount={mount} />
    </div>
  );
}
